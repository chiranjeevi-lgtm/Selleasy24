import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  DeleteObjectCommand,
  GetObjectCommand,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { createReadStream, existsSync } from 'node:fs';
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { dirname, join, normalize, resolve, sep } from 'node:path';

import type { Env } from '../../config/env.schema';

/** Which bucket an object belongs in. These have different exposure rules. */
export type StorageBucket = 'public' | 'documents';

export interface PutObjectInput {
  bucket: StorageBucket;
  key: string;
  body: Buffer;
  contentType: string;
}

/**
 * Object storage, S3-compatible.
 *
 * Two buckets with deliberately different rules:
 *
 *  - `public`    — listing photos. CDN-served, cacheable.
 *  - `documents` — sale deeds and identity proofs. Never CDN-fronted, never
 *                  publicly readable, reachable only through a short-lived
 *                  presigned URL issued after an authorisation check. Contents
 *                  are already AES-256-GCM ciphertext when they arrive here.
 *
 * When no credentials are configured — local development — objects are written
 * under ./storage instead. Env validation makes credentials mandatory in
 * production, so this fallback cannot silently take over a real deployment.
 */
@Injectable()
export class StorageService {
  private readonly logger = new Logger(StorageService.name);
  private readonly client: S3Client | null;
  private readonly buckets: Record<StorageBucket, string>;
  private readonly documentUrlTtl: number;
  private readonly localRoot: string;

  constructor(private readonly config: ConfigService<Env, true>) {
    const accessKeyId = this.config.get<string>('STORAGE_ACCESS_KEY_ID') ?? '';
    const secretAccessKey = this.config.get<string>('STORAGE_SECRET_ACCESS_KEY') ?? '';

    this.buckets = {
      public: this.config.getOrThrow<string>('STORAGE_BUCKET_PUBLIC'),
      documents: this.config.getOrThrow<string>('STORAGE_BUCKET_DOCUMENTS'),
    };
    this.documentUrlTtl = this.config.getOrThrow<number>('DOCUMENT_URL_TTL_SECONDS');
    this.localRoot = resolve(process.cwd(), 'storage');

    if (accessKeyId && secretAccessKey) {
      this.client = new S3Client({
        endpoint: this.config.getOrThrow<string>('STORAGE_ENDPOINT'),
        region: this.config.getOrThrow<string>('STORAGE_REGION'),
        credentials: { accessKeyId, secretAccessKey },
        // DigitalOcean Spaces and R2 both require path-style addressing.
        forcePathStyle: true,
      });
    } else {
      this.client = null;
      this.logger.warn(
        'Object storage credentials absent — using local ./storage directory. Development only.',
      );
    }
  }

  async put(input: PutObjectInput): Promise<void> {
    this.assertSafeKey(input.key);

    if (!this.client) {
      const path = this.localPath(input.bucket, input.key);
      await mkdir(dirname(path), { recursive: true });
      await writeFile(path, input.body);
      return;
    }

    await this.client.send(
      new PutObjectCommand({
        Bucket: this.buckets[input.bucket],
        Key: input.key,
        Body: input.body,
        ContentType: input.contentType,
        // Documents are private without exception. Photos are readable because
        // they are CDN-served, and contain nothing sensitive.
        ACL: input.bucket === 'public' ? 'public-read' : 'private',
        // Belt and braces alongside our own application-layer encryption.
        ServerSideEncryption: input.bucket === 'documents' ? 'AES256' : undefined,
      }),
    );
  }

  /** Reads an object into memory. Used to decrypt a document for admin preview. */
  async get(bucket: StorageBucket, key: string): Promise<Buffer> {
    this.assertSafeKey(key);

    if (!this.client) {
      const path = this.localPath(bucket, key);
      if (!existsSync(path)) {
        throw new NotFoundException('Stored file not found.');
      }
      return readFile(path);
    }

    const response = await this.client.send(
      new GetObjectCommand({ Bucket: this.buckets[bucket], Key: key }),
    );

    if (!response.Body) {
      throw new NotFoundException('Stored file not found.');
    }

    return Buffer.from(await response.Body.transformToByteArray());
  }

  async delete(bucket: StorageBucket, key: string): Promise<void> {
    this.assertSafeKey(key);

    if (!this.client) {
      await rm(this.localPath(bucket, key), { force: true });
      return;
    }

    await this.client.send(
      new DeleteObjectCommand({ Bucket: this.buckets[bucket], Key: key }),
    );
  }

  /**
   * Issues a short-lived presigned URL for a private document.
   *
   * The caller MUST have already performed the authorisation check and written a
   * DocumentAccessLog row. This method grants access; it does not decide it.
   */
  async presignDocument(key: string): Promise<string> {
    this.assertSafeKey(key);

    if (!this.client) {
      // No signing locally; the API streams the decrypted bytes instead.
      return `local://documents/${key}`;
    }

    return getSignedUrl(
      this.client,
      new GetObjectCommand({ Bucket: this.buckets.documents, Key: key }),
      { expiresIn: this.documentUrlTtl },
    );
  }

  /** Public CDN/base URL for a photo. */
  publicUrl(key: string): string {
    if (!this.client) {
      return `/api/dev-storage/public/${key}`;
    }
    const endpoint = this.config.getOrThrow<string>('STORAGE_ENDPOINT').replace(/\/$/, '');
    return `${endpoint}/${this.buckets.public}/${key}`;
  }

  /** Streams a locally stored object. Development only. */
  localReadStream(bucket: StorageBucket, key: string): ReturnType<typeof createReadStream> {
    this.assertSafeKey(key);
    const path = this.localPath(bucket, key);
    if (!existsSync(path)) {
      throw new NotFoundException('Stored file not found.');
    }
    return createReadStream(path);
  }

  get isLocal(): boolean {
    return this.client === null;
  }

  /**
   * Rejects keys that could escape their prefix.
   *
   * Storage keys are built from UUIDs internally, so this should be
   * unreachable — which is exactly why it is asserted. A future code path that
   * interpolates user input into a key must fail here rather than write outside
   * its bucket prefix or, in local mode, outside ./storage entirely.
   */
  private assertSafeKey(key: string): void {
    if (
      key.length === 0 ||
      key.startsWith('/') ||
      key.includes('..') ||
      key.includes('\\') ||
      key.includes('\0')
    ) {
      throw new Error(`Unsafe storage key rejected: ${JSON.stringify(key)}`);
    }
  }

  private localPath(bucket: StorageBucket, key: string): string {
    const bucketRoot = join(this.localRoot, bucket);
    const candidate = normalize(join(bucketRoot, key));

    // Second traversal guard, after normalisation this time.
    if (candidate !== bucketRoot && !candidate.startsWith(bucketRoot + sep)) {
      throw new Error('Resolved storage path escaped its bucket directory.');
    }

    return candidate;
  }
}

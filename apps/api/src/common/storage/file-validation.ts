import { BadRequestException } from '@nestjs/common';

/**
 * Upload validation.
 *
 * The governing rule: never trust anything the client tells us about a file.
 * `Content-Type` and the filename are both attacker-controlled, so the real
 * type is determined by reading the leading bytes of the content itself. A file
 * named `deed.pdf` carrying an `image/jpeg` header and an HTML payload is a
 * stored-XSS attempt, and header-only checks wave it straight through.
 */

export const PHOTO_MAX_BYTES = 5 * 1024 * 1024; // 5 MB
export const DOCUMENT_MAX_BYTES = 10 * 1024 * 1024; // 10 MB

export const MIN_PHOTOS = 3;
export const MAX_PHOTOS = 15;

interface FileSignature {
  mimeType: string;
  extension: string;
  /** Byte sequence at `offset`; null entries are wildcards. */
  magic: ReadonlyArray<number | null>;
  offset: number;
}

/**
 * Signatures for the formats we accept. Deliberately short:
 *  - No SVG. It is XML, it executes script, and it is a stored-XSS vector.
 *  - No TIFF, HEIC or raw formats — browsers cannot display them reliably.
 *  - No ZIP-based office formats; documents are PDF or flat images only.
 */
const PHOTO_SIGNATURES: readonly FileSignature[] = [
  { mimeType: 'image/jpeg', extension: 'jpg', magic: [0xff, 0xd8, 0xff], offset: 0 },
  {
    mimeType: 'image/png',
    extension: 'png',
    magic: [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a],
    offset: 0,
  },
  // WebP is a RIFF container: "RIFF" <4 byte size> "WEBP"
  {
    mimeType: 'image/webp',
    extension: 'webp',
    magic: [0x52, 0x49, 0x46, 0x46, null, null, null, null, 0x57, 0x45, 0x42, 0x50],
    offset: 0,
  },
];

const DOCUMENT_SIGNATURES: readonly FileSignature[] = [
  // "%PDF-"
  {
    mimeType: 'application/pdf',
    extension: 'pdf',
    magic: [0x25, 0x50, 0x44, 0x46, 0x2d],
    offset: 0,
  },
  // Sellers commonly photograph a deed rather than scan it.
  ...PHOTO_SIGNATURES,
];

export interface ValidatedFile {
  buffer: Buffer;
  /** Detected from content, not from the request. */
  mimeType: string;
  /** Safe extension derived from the detected type. */
  extension: string;
  sizeBytes: number;
  /** Sanitised original name, retained for display only. */
  displayFilename: string;
}

function matches(buffer: Buffer, signature: FileSignature): boolean {
  const end = signature.offset + signature.magic.length;
  if (buffer.length < end) {
    return false;
  }
  return signature.magic.every((byte, i) => {
    if (byte === null) {
      return true;
    }
    return buffer[signature.offset + i] === byte;
  });
}

function detect(
  buffer: Buffer,
  allowed: readonly FileSignature[],
): { mimeType: string; extension: string } | null {
  const found = allowed.find((signature) => matches(buffer, signature));
  return found ? { mimeType: found.mimeType, extension: found.extension } : null;
}

/** True for C0 controls, DEL, and C1 controls. */
function isControlCodePoint(codePoint: number): boolean {
  return codePoint <= 0x1f || (codePoint >= 0x7f && codePoint <= 0x9f);
}

/**
 * Strips a client-supplied filename down to something safe to display.
 *
 * Removes directory separators, traversal sequences and control characters — a
 * newline in a filename can forge a `Content-Disposition` header line.
 *
 * This value is NEVER used to build a storage key. Keys are generated UUIDs, so
 * a hostile filename cannot influence where bytes land; this protects only
 * downstream display and response headers.
 *
 * Implemented as a codepoint filter rather than a regex character class on
 * purpose: literal control characters inside a source regex are invisible and
 * fragile to edit.
 */
export function sanitizeFilename(name: string): string {
  const lastSegment = name.replace(/\\/g, '/').split('/').pop() ?? '';

  const withoutControls = Array.from(lastSegment)
    .filter((char) => {
      const codePoint = char.codePointAt(0);
      return codePoint !== undefined && !isControlCodePoint(codePoint);
    })
    .join('');

  const cleaned = withoutControls
    // Collapse traversal sequences.
    .replace(/\.{2,}/g, '.')
    .trim()
    // Allowlist: anything outside this set becomes an underscore.
    .replace(/[^A-Za-z0-9._-]/g, '_')
    .slice(0, 120);

  return cleaned.length > 0 ? cleaned : 'upload';
}

function validate(
  file: Express.Multer.File | undefined,
  allowed: readonly FileSignature[],
  maxBytes: number,
  label: string,
): ValidatedFile {
  if (!file) {
    throw new BadRequestException(`No ${label.toLowerCase()} was uploaded.`);
  }

  // Multer's own limit should already have rejected this. Checked again because
  // relying on one layer for a resource bound is how bounds get bypassed.
  if (file.size > maxBytes) {
    throw new BadRequestException(
      `${label} exceeds the maximum size of ${Math.floor(maxBytes / 1024 / 1024)} MB.`,
    );
  }

  if (file.size === 0) {
    throw new BadRequestException(`${label} is empty.`);
  }

  const detected = detect(file.buffer, allowed);
  if (!detected) {
    const permitted = [...new Set(allowed.map((s) => s.extension))].join(', ');
    throw new BadRequestException(
      `${label} is not a supported file type. Permitted: ${permitted}.`,
    );
  }

  return {
    buffer: file.buffer,
    mimeType: detected.mimeType,
    extension: detected.extension,
    sizeBytes: file.size,
    displayFilename: sanitizeFilename(file.originalname),
  };
}

export function validatePhoto(file: Express.Multer.File | undefined): ValidatedFile {
  return validate(file, PHOTO_SIGNATURES, PHOTO_MAX_BYTES, 'Photo');
}

export function validateDocument(file: Express.Multer.File | undefined): ValidatedFile {
  return validate(file, DOCUMENT_SIGNATURES, DOCUMENT_MAX_BYTES, 'Document');
}

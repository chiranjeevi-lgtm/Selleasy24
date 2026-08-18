import {
  Controller,
  Get,
  Header,
  NotFoundException,
  Param,
  StreamableFile,
} from '@nestjs/common';
import { ApiExcludeController } from '@nestjs/swagger';

import { Public } from '../../common/auth/auth.decorators';
import { StorageService } from '../../common/storage/storage.service';

/**
 * Serves public media from the local storage driver.
 *
 * Exists only because the local driver has no CDN in front of it — in any
 * deployed environment `StorageService.publicUrl()` returns a Spaces/CDN URL and
 * nothing ever reaches this controller.
 *
 * Two guards make that concrete rather than assumed:
 *  - Every route returns 404 unless the storage driver is actually in local
 *    mode, so this cannot serve anything in production even if the route is
 *    somehow reachable.
 *  - Only the PUBLIC bucket is exposed. Encrypted ownership documents live in a
 *    separate bucket and are reachable only through the verification module,
 *    which authorises and logs each access.
 */
@ApiExcludeController()
@Public()
@Controller('dev-storage')
export class DevStorageController {
  constructor(private readonly storage: StorageService) {}

  /**
   * Express 4 wildcard. The matched remainder lands in the unnamed `0`
   * parameter — `public/*path` is Express 5 syntax and silently matches nothing
   * here.
   */
  @Get('public/*')
  // Long cache: keys contain a UUID, so a given URL's bytes never change.
  @Header('Cache-Control', 'public, max-age=31536000, immutable')
  @Header('X-Content-Type-Options', 'nosniff')
  publicFile(@Param('0') path: string): StreamableFile {
    if (!this.storage.isLocal) {
      throw new NotFoundException();
    }

    const key = path;

    /**
     * StorageService rejects unsafe keys by throwing, which would surface as a
     * 500 — and a 500 tells a prober that their input was interesting, while a
     * clean miss returns 404. Every failure here looks identical from outside.
     */
    let stream;
    try {
      stream = this.storage.localReadStream('public', key);
    } catch {
      throw new NotFoundException();
    }

    const type = key.endsWith('.png')
      ? 'image/png'
      : key.endsWith('.webp')
        ? 'image/webp'
        : 'image/jpeg';

    return new StreamableFile(stream, { type });
  }
}

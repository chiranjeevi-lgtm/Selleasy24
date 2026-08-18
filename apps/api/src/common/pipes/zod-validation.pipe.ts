import { BadRequestException, Injectable, PipeTransform } from '@nestjs/common';
import { ZodError, ZodSchema } from 'zod';

/**
 * Validates and *replaces* the incoming payload with Zod's parsed output.
 *
 * Two properties matter for security:
 *
 *  - Unknown keys are stripped by Zod objects, so a client cannot smuggle extra
 *    fields into a Prisma call (`role: 'ADMIN'` on a registration body, say).
 *    Schemas must therefore be plain objects, never `.passthrough()`.
 *  - The handler receives the *parsed* value, so coercions and defaults declared
 *    in the schema are the values the service actually sees.
 *
 * Usage:
 *   @Post()
 *   create(@Body(new ZodValidationPipe(createListingSchema)) dto: CreateListingDto)
 */
@Injectable()
export class ZodValidationPipe implements PipeTransform {
  constructor(private readonly schema: ZodSchema) {}

  transform(value: unknown): unknown {
    try {
      return this.schema.parse(value);
    } catch (error) {
      if (error instanceof ZodError) {
        throw new BadRequestException({
          message: 'Validation failed',
          // Field-level detail so clients can attach errors to inputs. Contains
          // only field paths and rule messages — never the submitted values,
          // which could be echoed back into logs or error trackers.
          errors: error.issues.map((issue) => ({
            field: issue.path.join('.'),
            message: issue.message,
          })),
        });
      }
      throw error;
    }
  }
}

import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { Prisma } from '@kamala/db';
import type { Request, Response } from 'express';
import { randomUUID } from 'node:crypto';

interface ErrorResponseBody {
  statusCode: number;
  message: string;
  errors?: unknown;
  /** Correlates the client-visible response with the server log entry. */
  reference: string;
  timestamp: string;
  path: string;
}

/**
 * Single exit point for every error leaving the API.
 *
 * The rule it enforces: a client learns what it did wrong, never how the server
 * is built. Stack traces, SQL, table names and constraint names stay in the log;
 * the response carries a reference id the client can quote to support.
 */
@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger(AllExceptionsFilter.name);

  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();
    const reference = randomUUID();

    const { status, message, errors, logAsError } = this.classify(exception);

    const logContext = {
      reference,
      method: request.method,
      path: request.url,
      status,
    };

    if (logAsError) {
      // Full detail, server-side only.
      this.logger.error(
        `${request.method} ${request.url} → ${status} [${reference}]`,
        exception instanceof Error ? exception.stack : JSON.stringify(exception),
      );
    } else {
      this.logger.warn(`${request.method} ${request.url} → ${status} [${reference}]`, logContext);
    }

    const body: ErrorResponseBody = {
      statusCode: status,
      message,
      reference,
      timestamp: new Date().toISOString(),
      path: request.url,
    };
    if (errors !== undefined) {
      body.errors = errors;
    }

    response.status(status).json(body);
  }

  private classify(exception: unknown): {
    status: number;
    message: string;
    errors?: unknown;
    logAsError: boolean;
  } {
    // Deliberate exceptions raised by our own code.
    if (exception instanceof HttpException) {
      const res = exception.getResponse();
      const status = exception.getStatus();
      const isServerFault = status >= 500;

      if (typeof res === 'string') {
        return { status, message: res, logAsError: isServerFault };
      }

      const obj = res as { message?: unknown; errors?: unknown };
      return {
        status,
        message:
          typeof obj.message === 'string' ? obj.message : exception.message || 'Request failed',
        errors: obj.errors,
        logAsError: isServerFault,
      };
    }

    // Prisma errors are mapped to safe, generic messages. Their `meta` field
    // names real columns and constraints, so it is never forwarded to a client.
    if (exception instanceof Prisma.PrismaClientKnownRequestError) {
      switch (exception.code) {
        case 'P2002':
          return {
            status: HttpStatus.CONFLICT,
            message: 'That value is already in use.',
            logAsError: false,
          };
        case 'P2003':
          return {
            status: HttpStatus.BAD_REQUEST,
            message: 'A referenced record does not exist.',
            logAsError: false,
          };
        case 'P2025':
          return {
            status: HttpStatus.NOT_FOUND,
            message: 'Record not found.',
            logAsError: false,
          };
        default:
          return {
            status: HttpStatus.INTERNAL_SERVER_ERROR,
            message: 'An unexpected database error occurred.',
            logAsError: true,
          };
      }
    }

    if (exception instanceof Prisma.PrismaClientValidationError) {
      // Almost always our bug, not the caller's — log loudly, say little.
      return {
        status: HttpStatus.INTERNAL_SERVER_ERROR,
        message: 'An unexpected database error occurred.',
        logAsError: true,
      };
    }

    return {
      status: HttpStatus.INTERNAL_SERVER_ERROR,
      message: 'An unexpected error occurred.',
      logAsError: true,
    };
  }
}

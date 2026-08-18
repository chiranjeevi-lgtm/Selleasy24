import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { PrismaClient } from '@kamala/db';

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(PrismaService.name);

  constructor() {
    super({
      // Query logging is emitted as an event rather than written to stdout so it
      // flows through the app logger and can be redacted centrally.
      log: [
        { emit: 'event', level: 'warn' },
        { emit: 'event', level: 'error' },
      ],
    });
  }

  async onModuleInit(): Promise<void> {
    // Prisma's typed event overloads don't narrow through the subclass, so these
    // handlers are attached with an explicit cast rather than `any` leaking out.
    (this as unknown as PrismaClient).$on('warn' as never, (event: unknown) => {
      this.logger.warn(event);
    });
    (this as unknown as PrismaClient).$on('error' as never, (event: unknown) => {
      this.logger.error(event);
    });

    await this.$connect();
    this.logger.log('Database connected');
  }

  async onModuleDestroy(): Promise<void> {
    await this.$disconnect();
  }
}

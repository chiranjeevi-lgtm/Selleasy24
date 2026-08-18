import { Controller, Get } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { Public } from '../../common/auth/auth.decorators';
import { PrismaService } from '../../common/prisma/prisma.service';

/**
 * Health probes MUST be unauthenticated.
 *
 * Authentication is deny-by-default via a global guard, which means these
 * endpoints started returning 401 the moment that guard was added — and a load
 * balancer reading 401 marks every instance unhealthy and takes the service
 * down. @Public() is load-bearing here, not decoration.
 *
 * Neither endpoint reveals anything: liveness returns uptime, readiness returns
 * whether the database answered.
 */
@Public()
@ApiTags('health')
@Controller('health')
export class HealthController {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Liveness — the process is up and serving.
   *
   * Deliberately does not touch the database: a load balancer must not cycle
   * healthy application containers because the database is briefly unavailable.
   */
  @Get()
  @ApiOperation({ summary: 'Liveness probe' })
  live(): { status: string; uptimeSeconds: number } {
    return { status: 'ok', uptimeSeconds: Math.floor(process.uptime()) };
  }

  /**
   * Readiness — this instance can serve real traffic, dependencies included.
   *
   * Returns 503 when the database is unreachable so orchestrators stop routing
   * to an instance that would only produce errors.
   */
  @Get('ready')
  @ApiOperation({ summary: 'Readiness probe (checks database connectivity)' })
  async ready(): Promise<{ status: string; database: string }> {
    await this.prisma.$queryRaw`SELECT 1`;
    return { status: 'ok', database: 'ok' };
  }
}

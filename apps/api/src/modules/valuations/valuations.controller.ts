import { Body, Controller, HttpCode, HttpStatus, Post } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';

import { Public } from '../../common/auth/auth.decorators';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';
import { estimateSchema, type EstimateDto } from './valuations.dto';
import { ValuationsService } from './valuations.service';

@ApiTags('valuations')
@Controller()
export class ValuationsController {
  constructor(private readonly valuations: ValuationsService) {}

  /**
   * Public e-valuation endpoint.
   *
   * POST rather than GET because the input shape (multiple config fields)
   * belongs in a body, and because we do NOT want these requests indexed
   * or cached with URL-based keys — each estimate is a live query against
   * verified inventory. Throttled tighter than the default (60/min) to
   * discourage systematic scraping of comparables through this endpoint.
   */
  @Post('valuations/estimate')
  @Public()
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { ttl: 60_000, limit: 20 } })
  @ApiOperation({
    summary: 'Estimate a property value from verified comparables',
    description:
      'Requires either coordinates (latitude + longitude) or a neighborhoodId. Returns a 25th/50th/75th percentile range, top 10 comparables (anonymised), and a confidence tier. Never fabricates a number when comparables are too thin — returns insufficient_data instead.',
  })
  async estimate(
    @Body(new ZodValidationPipe(estimateSchema)) dto: EstimateDto,
  ) {
    return this.valuations.estimate(dto);
  }
}

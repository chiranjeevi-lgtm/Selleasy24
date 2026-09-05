'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  Cell,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import {
  api,
  type CityPriceDistribution,
  type CitySummary,
  type CityTrend,
  type Locality,
} from '@/lib/api';
import { HeatmapLegend, InsightsHeatmap } from './insights-heatmap';

/**
 * Property Price Insights widget — Feature 10.
 *
 * Four cards on the homepage that mirror Square Yards' pattern with the
 * chart types they use:
 *   1. Rate & Activity  — text stats with icons (like SQ's Govt. Registrations)
 *   2. Price Trend      — spline area chart with gradient (like SQ's Price Trends)
 *   3. Asking Price     — vertical bar chart with tooltips (like SQ's Asking Price)
 *   4. Rates Heatmap    — live Leaflet map (SQ shows only a preview image)
 *
 * Charts use Recharts — the free equivalent of Highcharts. Tooltips,
 * hover states, y-axis tick labels, and draw-in animations come from the
 * library defaults rather than being hand-authored per chart. The colour
 * palette is the site's own gold-on-navy scheme, not Recharts' defaults.
 */

const CITY = 'Hyderabad';

const VERIFY = '#c9a227';
const VERIFY_SOFT = '#e3c86b';
const LINE = '#e3dfd7';
const MUTED = '#6b7078';

function formatCount(n: number): string {
  return n.toLocaleString('en-IN');
}

function formatRateShort(value: number): string {
  if (value >= 1000) return `₹${(value / 1000).toFixed(1)}K`;
  return `₹${Math.round(value)}`;
}

// ---------------------------------------------------------------------------
// Tooltip components — customised to match the site's design tokens
// ---------------------------------------------------------------------------

interface RechartsTooltipPayload {
  active?: boolean;
  payload?: Array<{ value: number; payload: Record<string, unknown> }>;
  label?: string;
}

function TrendTooltip({ active, payload, label }: RechartsTooltipPayload) {
  if (!active || !payload || payload.length === 0) return null;
  const value = payload[0]!.value;
  return (
    <div className="rounded-md bg-action px-2.5 py-1.5 text-white shadow-lift">
      <div className="text-[0.6875rem] font-medium text-white/70">{label}</div>
      <div className="tabular text-[0.8125rem] font-semibold text-verify">
        ₹{value.toLocaleString('en-IN')}
        <span className="ml-0.5 text-[0.625rem] font-normal text-white/60">/sqft</span>
      </div>
    </div>
  );
}

function DistributionTooltip({ active, payload }: RechartsTooltipPayload) {
  if (!active || !payload || payload.length === 0) return null;
  const bucket = payload[0]!.payload as { label: string; count: number };
  return (
    <div className="rounded-md bg-action px-2.5 py-1.5 text-white shadow-lift">
      <div className="text-[0.6875rem] font-medium text-white/70">
        ₹{bucket.label}/sqft
      </div>
      <div className="tabular text-[0.8125rem] font-semibold text-verify">
        {bucket.count} listing{bucket.count === 1 ? '' : 's'}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Card 1 — Stat rows (matches Square Yards' Govt. Registrations card)
// ---------------------------------------------------------------------------

function StatRow({
  icon,
  label,
  value,
}: {
  icon: React.ReactNode;
  label: string;
  value: string | number;
}) {
  return (
    <div className="flex items-center gap-3">
      <span
        aria-hidden="true"
        className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-verify-soft text-verify-ink"
      >
        {icon}
      </span>
      <span className="min-w-0 flex-1 text-[0.8125rem] text-muted">{label}</span>
      <span className="tabular rounded-control bg-canvas-deep px-3 py-1 text-[0.8125rem] font-semibold text-ink">
        {typeof value === 'number' ? formatCount(value) : value}
      </span>
    </div>
  );
}

function HomeIcon() {
  return (
    <svg viewBox="0 0 20 20" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.8">
      <path d="M3 9.5 10 4l7 5.5V16a1 1 0 0 1-1 1h-3v-4H7v4H4a1 1 0 0 1-1-1V9.5Z" strokeLinejoin="round" />
    </svg>
  );
}

function BuildingIcon() {
  return (
    <svg viewBox="0 0 20 20" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.8">
      <rect x="4" y="3" width="12" height="14" rx="1" />
      <path d="M7 6h2M11 6h2M7 9h2M11 9h2M7 12h2M11 12h2M8.5 17v-3h3v3" />
    </svg>
  );
}

function ClockIcon() {
  return (
    <svg viewBox="0 0 20 20" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.8">
      <circle cx="10" cy="10" r="7" />
      <path d="M10 6v4l2.5 2" strokeLinecap="round" />
    </svg>
  );
}

function CheckIcon() {
  return (
    <svg viewBox="0 0 20 20" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.8">
      <path d="m4.5 10.5 3.5 3.5 7.5-8" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

// ---------------------------------------------------------------------------
// Card 2 — Spline area chart for the price trend (Recharts AreaChart)
// ---------------------------------------------------------------------------

/**
 * Summary of a trend series — used to render the headline number and QoQ
 * pill above the chart, matching Square Yards' Price Trends layout.
 */
function summariseTrend(points: CityTrend['points']) {
  const valid = points.filter(
    (p): p is CityTrend['points'][number] & { medianPricePerSqft: number } =>
      p.medianPricePerSqft !== null,
  );
  if (valid.length === 0) {
    return { current: null, qoq: null, valid };
  }
  const current = valid[valid.length - 1]!.medianPricePerSqft;
  // QoQ compares the latest month against the point 3 months prior. Falls
  // back to earliest available if fewer than 4 points exist, so a partial
  // series still shows a meaningful delta.
  const priorIndex = Math.max(0, valid.length - 4);
  const prior = valid[priorIndex]!.medianPricePerSqft;
  const qoq =
    prior > 0 ? Math.round(((current - prior) / prior) * 100 * 100) / 100 : null;
  return { current, qoq, valid };
}

function TrendAreaChart({ points }: { points: CityTrend['points'] }) {
  const { valid } = summariseTrend(points);

  if (valid.length < 1) {
    return (
      <div className="grid h-full min-h-[260px] place-items-center">
        <p className="text-[0.8125rem] text-faint">Not enough historical data yet.</p>
      </div>
    );
  }

  const data = valid.map((p) => ({
    month: p.month.slice(5) + '/' + p.month.slice(2, 4),
    value: p.medianPricePerSqft,
  }));

  // Anchor the y-axis at 90% of the min value so month-over-month
  // variation is visible instead of collapsing to a flat line.
  const values = valid.map((p) => p.medianPricePerSqft);
  const yMin = Math.floor((Math.min(...values) * 0.9) / 100) * 100;
  const yMax = Math.ceil((Math.max(...values) * 1.05) / 100) * 100;

  return (
    <ResponsiveContainer width="100%" height={260}>
      <AreaChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
        <defs>
          <linearGradient id="trendGradient" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={VERIFY} stopOpacity={0.55} />
            <stop offset="95%" stopColor={VERIFY} stopOpacity={0} />
          </linearGradient>
        </defs>
        <CartesianGrid
          strokeDasharray="3 3"
          stroke={LINE}
          vertical={false}
        />
        <XAxis
          dataKey="month"
          tickLine={false}
          axisLine={false}
          tick={{ fontSize: 10, fill: MUTED }}
          padding={{ left: 8, right: 8 }}
        />
        <YAxis
          domain={[yMin, yMax]}
          tickFormatter={formatRateShort}
          tickLine={false}
          axisLine={false}
          tick={{ fontSize: 10, fill: MUTED }}
          width={40}
        />
        <Tooltip
          content={<TrendTooltip />}
          cursor={{ stroke: VERIFY, strokeWidth: 1, strokeDasharray: '3 3' }}
        />
        <Area
          type="monotone"
          dataKey="value"
          stroke={VERIFY}
          strokeWidth={2.5}
          fill="url(#trendGradient)"
          activeDot={{
            r: 5,
            strokeWidth: 2,
            stroke: VERIFY,
            fill: '#fff',
          }}
          dot={{
            r: 3,
            strokeWidth: 2,
            stroke: VERIFY,
            fill: '#fff',
          }}
          animationDuration={800}
        />
      </AreaChart>
    </ResponsiveContainer>
  );
}

// ---------------------------------------------------------------------------
// Card 3 — Vertical bar chart for asking price distribution (Recharts BarChart)
// ---------------------------------------------------------------------------

function DistributionBarChart({
  buckets,
}: {
  buckets: CityPriceDistribution['buckets'];
}) {
  const total = buckets.reduce((sum, b) => sum + b.count, 0);
  if (total === 0) {
    return (
      <div className="grid h-full min-h-[180px] place-items-center">
        <p className="text-[0.8125rem] text-faint">No listings yet.</p>
      </div>
    );
  }

  // Identify the mode bucket so we can highlight it.
  const modeIndex = buckets.reduce(
    (bestIdx, b, i, arr) => (b.count > arr[bestIdx]!.count ? i : bestIdx),
    0,
  );

  return (
    <ResponsiveContainer width="100%" height="100%">
      <BarChart data={buckets} margin={{ top: 8, right: 12, left: 0, bottom: 8 }}>
        <CartesianGrid
          strokeDasharray="3 3"
          stroke={LINE}
          vertical={false}
        />
        <XAxis
          dataKey="label"
          tickLine={false}
          axisLine={false}
          tick={{ fontSize: 11, fill: MUTED }}
          angle={-30}
          textAnchor="end"
          height={52}
          interval={0}
        />
        <YAxis
          tickLine={false}
          axisLine={false}
          tick={{ fontSize: 11, fill: MUTED }}
          width={32}
          allowDecimals={false}
        />
        <Tooltip
          content={<DistributionTooltip />}
          cursor={{ fill: 'transparent' }}
        />
        <Bar
          dataKey="count"
          radius={[4, 4, 0, 0]}
          maxBarSize={72}
          animationDuration={800}
        >
          {buckets.map((_, index) => (
            <Cell
              key={index}
              fill={index === modeIndex ? VERIFY : VERIFY_SOFT}
            />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}

// ---------------------------------------------------------------------------
// The widget
// ---------------------------------------------------------------------------

interface DashboardData {
  summary: CitySummary;
  distribution: CityPriceDistribution;
  trend: CityTrend;
  localities: Locality[];
}

export function InsightsDashboard() {
  const [data, setData] = useState<DashboardData | null>(null);
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading');
  const [errorDetail, setErrorDetail] = useState<string>('');

  useEffect(() => {
    let cancelled = false;
    Promise.all([
      api.citySummary(CITY),
      api.cityPriceDistribution(CITY),
      api.cityTrend(CITY, 12),
      api.localities(CITY),
    ])
      .then(([summary, distribution, trend, localities]) => {
        if (cancelled) return;
        setData({ summary, distribution, trend, localities });
        setStatus('ready');
      })
      .catch((error: unknown) => {
        if (cancelled) return;
        setStatus('error');
        const detail = error instanceof Error ? error.message : 'Unknown error';
        setErrorDetail(detail);
        // console.warn (not error) with a plain string — Next.js 15's dev
        // overlay treats `console.error(msg, Error)` as a reportable dev
        // error and pops the red screen even though this component
        // already renders its own "unavailable" fallback. A warn-level
        // string is loud enough for the console but doesn't hijack the UI.
        // eslint-disable-next-line no-console
        console.warn(`InsightsDashboard: market data unavailable (${detail})`);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  if (status === 'loading') {
    return (
      <section
        aria-label="Property Price Insights (loading)"
        className="mx-auto max-w-[76rem] px-5 pt-14 sm:px-8"
      >
        <span aria-hidden="true" className="mb-3 block h-[3px] w-10 bg-verify" />
        <h2 className="display text-[1.625rem] text-ink">
          Property Price Insights in {CITY}
        </h2>
        <p className="mt-4 text-[0.9375rem] text-muted">Loading market data…</p>
      </section>
    );
  }

  if (status === 'error' || !data) {
    return (
      <section
        aria-label="Property Price Insights (unavailable)"
        className="mx-auto max-w-[76rem] px-5 pt-14 sm:px-8"
      >
        <span aria-hidden="true" className="mb-3 block h-[3px] w-10 bg-verify" />
        <h2 className="display text-[1.625rem] text-ink">
          Property Price Insights in {CITY}
        </h2>
        <div className="mt-4 rounded-card border border-line-soft bg-surface p-6">
          <p className="text-[0.9375rem] text-ink">
            Market data is temporarily unavailable.
          </p>
          {errorDetail && (
            <p className="mt-2 text-[0.75rem] font-mono text-faint">
              {errorDetail}
            </p>
          )}
        </div>
      </section>
    );
  }

  const { summary, distribution, trend, localities } = data;

  return (
    <section
      aria-labelledby="insights-heading"
      className="mx-auto max-w-[76rem] px-5 pt-14 sm:px-8"
    >
      <div className="max-w-2xl">
        <span aria-hidden="true" className="mb-3 block h-[3px] w-10 bg-verify" />
        <h2 id="insights-heading" className="display text-[1.625rem] text-ink">
          Property Price Insights in {summary.city}
        </h2>
        <p className="mt-3 text-[0.9375rem] leading-relaxed text-muted">
          Live market intelligence from every verified listing on
          SellEasy24 — median rates, price trends, and where the market is
          concentrating today.
        </p>
      </div>

      <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {/* Card 1: Rate & Activity — stat rows with icons (Square Yards style) */}
        <article className="rounded-card bg-surface p-6 shadow-card ring-1 ring-line">
          <p className="label text-verify">Rate & activity</p>
          <p className="mt-3 tabular display text-[1.75rem] text-ink">
            {summary.medianPricePerSqft
              ? `₹${summary.medianPricePerSqft.toLocaleString('en-IN')}`
              : '—'}
            <span className="ml-1 text-[0.875rem] font-normal text-muted">/sqft</span>
          </p>
          <p className="mt-1 text-[0.8125rem] text-muted">
            Median across verified listings
          </p>

          <div className="mt-5 space-y-2.5 border-t border-line-soft pt-4">
            <StatRow
              icon={<HomeIcon />}
              label="Active listings"
              value={summary.listingCount}
            />
            <StatRow
              icon={<BuildingIcon />}
              label="Verified projects"
              value={summary.projectCount}
            />
            <StatRow
              icon={<ClockIcon />}
              label="Avg on market"
              value={
                summary.avgDaysOnMarket !== null
                  ? `${summary.avgDaysOnMarket}d`
                  : '—'
              }
            />
            <StatRow
              icon={<CheckIcon />}
              label="Closed"
              value={summary.soldCount}
            />
          </div>
        </article>

        {/* Card 2: Price trend — spline area chart with headline + QoQ pill
            (mirrors Square Yards' Price Trends card layout). The chart is
            deliberately taller than the others so the spline reads clearly. */}
        <article className="flex flex-col rounded-card bg-surface p-6 shadow-card ring-1 ring-line">
          <p className="label text-verify">Price trend</p>
          {(() => {
            const { current, qoq } = summariseTrend(trend.points);
            if (current === null) {
              return (
                <p className="mt-2 text-[0.8125rem] text-muted">
                  Median ₹/sqft, last 12 months
                </p>
              );
            }
            const rising = qoq !== null && qoq > 0;
            const falling = qoq !== null && qoq < 0;
            return (
              <div className="mt-2 flex items-baseline gap-3">
                <p className="tabular display text-[1.75rem] text-ink">
                  ₹{current.toLocaleString('en-IN')}
                  <span className="ml-1 text-[0.75rem] font-normal text-muted">
                    /sqft
                  </span>
                </p>
                {qoq !== null && (
                  <span
                    className={
                      'rounded-full px-2 py-0.5 text-[0.6875rem] font-semibold tabular ' +
                      (rising
                        ? 'bg-verify-soft text-verify-ink'
                        : falling
                          ? 'bg-seal-soft text-seal'
                          : 'bg-canvas-deep text-muted')
                    }
                  >
                    {qoq > 0 ? '↑' : qoq < 0 ? '↓' : '·'} {Math.abs(qoq).toFixed(2)}% QoQ
                  </span>
                )}
              </div>
            );
          })()}
          <div className="mt-4 flex-1">
            <TrendAreaChart points={trend.points} />
          </div>
        </article>

        {/* Card 3: Asking price spread — bar chart with tooltips.
            `flex flex-col` + `flex-1` on the chart wrapper mirrors Card 2's
            trend chart so the bars stretch to fill the whole card rather
            than leaving a slab of white space below a squat 180-tall chart. */}
        <article className="flex flex-col rounded-card bg-surface p-6 shadow-card ring-1 ring-line">
          <p className="label text-verify">Asking price spread</p>
          <p className="mt-2 text-[0.8125rem] text-muted">
            {formatCount(distribution.total)} listings by ₹/sqft
          </p>
          <div className="mt-4 min-h-[260px] flex-1">
            <DistributionBarChart buckets={distribution.buckets} />
          </div>
        </article>

        {/* Card 4: Property Rates Heatmap — links through to the full map.
            The preview map itself is `pointer-events-none` so any click in
            the card (map area included) navigates to /map, where the full
            interactive experience lives. The map here is a teaser, not a
            second interactive surface competing with the dedicated page. */}
        <Link
          href="/map"
          aria-label="Open full property rates map"
          className="group block rounded-card bg-surface p-6 shadow-card ring-1 ring-line transition-all duration-200 hover:-translate-y-0.5 hover:shadow-lift hover:ring-verify/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-verify"
        >
          <div className="flex items-baseline justify-between gap-3">
            <p className="label text-verify">Property rates heatmap</p>
            <span
              aria-hidden="true"
              className="text-[0.75rem] font-semibold text-verify opacity-0 transition-opacity duration-200 group-hover:opacity-100"
            >
              Open full map →
            </span>
          </div>
          <p className="mt-2 text-[0.8125rem] text-muted">
            Locality ₹/sqft, sized by inventory
          </p>
          <div className="mt-4 pointer-events-none">
            <InsightsHeatmap localities={localities} />
            <HeatmapLegend />
          </div>
        </Link>
      </div>

      <p className="mt-4 text-[0.75rem] text-faint">
        Updated{' '}
        {new Date(summary.computedAt).toLocaleDateString('en-IN', {
          day: 'numeric',
          month: 'short',
          year: 'numeric',
        })}
        . Computed live from verified listings, not third-party estimates.
        <Link
          href="/localities"
          className="ml-2 text-verify underline-offset-2 hover:underline"
        >
          See locality-by-locality →
        </Link>
      </p>
    </section>
  );
}

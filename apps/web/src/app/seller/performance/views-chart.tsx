'use client';

import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import type { SellerStats } from '@/lib/server-api';

/**
 * Views per day — Recharts BarChart.
 *
 * Replaces the earlier div-based bars: proper y-axis, a highlighted peak
 * bar, an average reference line, and rich tooltips. Same Recharts stack
 * the city insights dashboard uses, so bundle cost is already paid.
 *
 * Zero-view days render as very short bars (minPointSize) so the axis
 * reads continuous instead of gappy — same visual intent as the previous
 * "min 2% height" trick.
 */

// Design-token hexes, lifted from the shared palette so this component
// doesn't need to reach into globals.css.
const VERIFY = '#c8a24b';
const VERIFY_SOFT = '#e8d59a';
const MUTED = '#6b7078';
const LINE = '#e5e2d9';
const INK = '#151513';

interface TooltipPayload {
  value: number;
  payload: { date: string; views: number };
}

function ChartTooltip({
  active,
  payload,
}: {
  active?: boolean;
  payload?: TooltipPayload[];
}) {
  if (!active || !payload || payload.length === 0) return null;
  const entry = payload[0]!;
  const { date, views } = entry.payload;
  const formatted = new Date(date).toLocaleDateString('en-IN', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
  });
  return (
    <div className="rounded-control bg-ink px-2.5 py-1.5 text-[0.6875rem] text-white shadow-lift">
      <p className="tabular font-semibold">
        {views} view{views === 1 ? '' : 's'}
      </p>
      <p className="text-white/70">{formatted}</p>
    </div>
  );
}

export function PerformanceViewsChart({ daily }: { daily: SellerStats['daily'] }) {
  const total = daily.reduce((sum, day) => sum + day.views, 0);

  if (total === 0) {
    return (
      <p className="mt-8 rounded-card border border-dashed border-line px-5 py-8 text-center text-[0.875rem] text-muted">
        No views recorded in this period yet.
      </p>
    );
  }

  const peak = Math.max(...daily.map((d) => d.views));
  const avg = total / daily.length;
  // Format each date once and stash it on the row so both the axis and the
  // tooltip can use the same "5 Aug" label without re-parsing.
  const data = daily.map((d) => ({
    ...d,
    label: new Date(d.date).toLocaleDateString('en-IN', {
      day: 'numeric',
      month: 'short',
    }),
  }));

  const peakIndex = data.findIndex((d) => d.views === peak);

  // With ~30 daily rows, showing every tick is illegible; ~7 evenly-spaced
  // ticks read cleanly at the sizes this chart renders.
  const tickInterval = Math.max(0, Math.floor(data.length / 7) - 1);

  return (
    <section className="mt-8" aria-labelledby="views-chart">
      <div className="flex flex-wrap items-baseline justify-between gap-3">
        <h2 id="views-chart" className="display text-[1.25rem] text-ink">
          Views per day
        </h2>
        <p className="text-[0.8125rem] text-muted tabular">
          {total} total · peak <span className="font-semibold text-ink">{peak}</span> · avg{' '}
          <span className="font-semibold text-ink">{avg.toFixed(1)}</span>
        </p>
      </div>

      <div className="mt-4 h-64 rounded-card border border-line bg-surface p-4">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart
            data={data}
            margin={{ top: 8, right: 12, left: 0, bottom: 4 }}
          >
            <CartesianGrid stroke={LINE} strokeDasharray="3 3" vertical={false} />
            <XAxis
              dataKey="label"
              tickLine={false}
              axisLine={false}
              tick={{ fontSize: 11, fill: MUTED }}
              interval={tickInterval}
            />
            <YAxis
              tickLine={false}
              axisLine={false}
              tick={{ fontSize: 11, fill: MUTED }}
              width={32}
              allowDecimals={false}
            />
            <Tooltip
              content={<ChartTooltip />}
              cursor={{ fill: 'transparent' }}
            />
            {/* Average reference line — a seller wants to know if today is
                above or below their usual, not just the absolute number. */}
            <ReferenceLine
              y={avg}
              stroke={INK}
              strokeOpacity={0.4}
              strokeDasharray="4 4"
              label={{
                value: `avg ${avg.toFixed(1)}`,
                position: 'insideTopRight',
                fill: MUTED,
                fontSize: 10,
              }}
            />
            <Bar
              dataKey="views"
              radius={[4, 4, 0, 0]}
              minPointSize={2}
              maxBarSize={40}
              animationDuration={700}
            >
              {data.map((_, i) => (
                <Cell key={i} fill={i === peakIndex ? VERIFY : VERIFY_SOFT} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
    </section>
  );
}

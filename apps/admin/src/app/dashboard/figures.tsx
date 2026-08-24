/**
 * Dashboard primitives.
 *
 * Two rules run through all of these.
 *
 * A null is "not enough to say", never zero. A dashboard reporting "0 hours to
 * decision" because nothing has been decided tells the reader the queue is
 * instant, which is the opposite of the truth — so nulls render as an em dash.
 *
 * And a figure drawn from too few rows says so. A median of three decisions is
 * arithmetic, not a finding, and presenting the two identically is how an ops
 * team ends up acting on noise.
 */

/** The one colour used for data marks, validated against the paper surface. */
export const MARK = '#3d5ccc';

export function formatNumber(value: number): string {
  return new Intl.NumberFormat('en-IN').format(value);
}

/** "4.2 h", "18 h", or an em dash when there is nothing to report. */
export function formatHours(value: number | null): string {
  if (value === null) {
    return '—';
  }
  if (value < 1) {
    return `${Math.round(value * 60)} min`;
  }
  return value < 10 ? `${value.toFixed(1)} h` : `${Math.round(value)} h`;
}

export function formatPercent(value: number | null): string {
  return value === null ? '—' : `${value}%`;
}

/**
 * The single number a block is about.
 *
 * `tone` is reserved for state, never for decoration — seal means the promise
 * is being missed, and it is the only thing that turns a figure red.
 */
export function Hero({
  value,
  label,
  caption,
  tone = 'neutral',
}: {
  value: string;
  label: string;
  caption?: string;
  tone?: 'neutral' | 'good' | 'bad';
}) {
  const colour =
    tone === 'bad' ? 'text-seal' : tone === 'good' ? 'text-ink' : 'text-ink';

  return (
    <div>
      <p className="stamp-label text-graphite-light">{label}</p>
      {/*
        Deliberately not `tabular`. Equal-width digits exist so figures line up
        in a column; on one large standalone number they just space it oddly —
        "121" ends up looking broken. The gridded stats below keep them.
      */}
      <p className={`mt-1 font-display text-[2.5rem] font-extrabold leading-none ${colour}`}>
        {value}
      </p>
      {caption && (
        <p className="mt-1.5 text-[0.75rem] leading-snug text-graphite">{caption}</p>
      )}
    </div>
  );
}

export function Stat({
  value,
  label,
  caption,
  tone = 'neutral',
}: {
  value: string;
  label: string;
  caption?: string;
  tone?: 'neutral' | 'bad';
}) {
  return (
    <div>
      <p className="stamp-label text-graphite-light">{label}</p>
      <p
        className={`mt-1 font-display text-[1.375rem] font-extrabold leading-none tabular ${
          tone === 'bad' ? 'text-seal' : 'text-ink'
        }`}
      >
        {value}
      </p>
      {caption && <p className="mt-1 text-[0.6875rem] leading-snug text-graphite">{caption}</p>}
    </div>
  );
}

/**
 * Says a figure came from too little data to lean on.
 *
 * Shown rather than suppressing the number: hiding it leaves the reader
 * guessing, while labelling it lets them weigh it correctly.
 */
export function ThinSample({ n, threshold }: { n: number; threshold: number }) {
  if (n >= threshold) {
    return <span className="text-[0.6875rem] text-graphite-light">from {n}</span>;
  }
  return (
    <span className="text-[0.6875rem] text-seal">
      from {n} — too few to rely on
    </span>
  );
}

/**
 * The shared time axis for a group of small multiples.
 *
 * One band under the group rather than three, because all three charts span the
 * identical window — repeating it would be noise. Without any dates at all, a
 * hover tooltip is the only way to know *when* a spike happened, and a value
 * readable only on hover is not readable.
 */
export function TimeAxis({ from, to }: { from: string; to: string }) {
  const label = (iso: string) =>
    new Date(`${iso}T00:00:00Z`).toLocaleDateString('en-IN', {
      day: 'numeric',
      month: 'short',
      timeZone: 'UTC',
    });

  return (
    <p
      className="mt-1 flex justify-between text-[0.6875rem] text-graphite-light"
      aria-hidden="true"
    >
      <span>{label(from)}</span>
      <span>{label(to)}</span>
    </p>
  );
}

export function Panel({
  title,
  hint,
  children,
}: {
  title: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="border border-paper-edge bg-paper px-5 py-4">
      <h2 className="stamp-label text-seal">{title}</h2>
      {hint && (
        <p className="mt-1.5 max-w-prose text-[0.75rem] leading-relaxed text-graphite">{hint}</p>
      )}
      <div className="mt-4">{children}</div>
    </section>
  );
}

/**
 * Daily counts as bars.
 *
 * Bars rather than a line because these are discrete events per day — a line
 * would interpolate between Tuesday and Wednesday, implying a quantity that
 * flowed continuously when what happened is "three people registered".
 *
 * One series per chart, so no legend: the title names it, and identity is never
 * carried by colour alone. Every bar has a `<title>`, which gives a real
 * tooltip natively with no client JavaScript.
 */
export function DailyBars({
  data,
  label,
  noun,
}: {
  data: Array<{ date: string; value: number }>;
  label: string;
  noun: string;
}) {
  const max = Math.max(...data.map((d) => d.value), 0);
  const total = data.reduce((sum, d) => sum + d.value, 0);

  // Geometry in user units; the SVG scales to its container.
  const step = 10;
  const gap = 2;
  const barWidth = step - gap;
  const height = 44;
  const width = data.length * step;

  return (
    <figure className="min-w-0">
      <figcaption className="flex flex-wrap items-baseline justify-between gap-2">
        <span className="text-[0.8125rem] font-medium text-ink">{label}</span>
        <span className="text-[0.75rem] text-graphite tabular">
          {formatNumber(total)} in the window
        </span>
      </figcaption>

      {total === 0 ? (
        <p className="mt-2 border-t border-paper-edge pt-2 text-[0.75rem] text-graphite-light">
          Nothing in this period.
        </p>
      ) : (
        <svg
          viewBox={`0 0 ${width} ${height}`}
          preserveAspectRatio="none"
          role="img"
          aria-label={`${label}: ${total} ${noun} over ${data.length} days`}
          className="mt-2 h-11 w-full"
        >
          {/* Recessive baseline. The only axis line the chart needs. */}
          <line
            x1={0}
            y1={height}
            x2={width}
            y2={height}
            stroke="#cfd8cb"
            strokeWidth={1}
            vectorEffect="non-scaling-stroke"
          />
          {data.map((point, index) => {
            // A day with activity always draws something, so a count of one is
            // never rounded away to an invisible sliver.
            const barHeight =
              point.value === 0 ? 0 : Math.max(2, (point.value / max) * (height - 3));
            const caption = `${point.date}: ${point.value} ${
              point.value === 1 ? noun.replace(/s$/, '') : noun
            }`;

            return (
              <g key={point.date}>
                {/*
                  A full-height transparent target behind the bar. Without it a
                  quiet day has no hit area at all — the one thing a reader most
                  wants to check on a sparse chart is which day the gap was, and
                  a zero-height rect cannot be hovered.
                */}
                <rect
                  x={index * step}
                  y={0}
                  width={barWidth}
                  height={height}
                  fill="transparent"
                >
                  <title>{caption}</title>
                </rect>
                {barHeight > 0 && (
                  <rect
                    x={index * step}
                    y={height - barHeight}
                    width={barWidth}
                    height={barHeight}
                    rx={1.5}
                    fill={MARK}
                    // The target above carries the tooltip; this must not
                    // swallow the pointer or the zero days go dead again.
                    pointerEvents="none"
                  />
                )}
              </g>
            );
          })}
        </svg>
      )}
    </figure>
  );
}

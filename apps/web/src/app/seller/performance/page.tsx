import type { Metadata } from 'next';
import Link from 'next/link';
import { ApiError } from '@/lib/api';
import { serverApi, type SellerStats } from '@/lib/server-api';
import { formatArea, formatRupeesShort } from '@/lib/format';
import { WrongAccount } from '../wrong-account';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = { title: 'Performance' };

interface PageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

const RANGES = [
  { days: 7, label: '7 days' },
  { days: 30, label: '30 days' },
  { days: 90, label: '90 days' },
];

export default async function PerformancePage({ searchParams }: PageProps) {
  const params = await searchParams;
  const raw = Array.isArray(params.days) ? params.days[0] : params.days;
  const days = RANGES.some((r) => String(r.days) === raw) ? Number(raw) : 30;

  // A builder reaching this by typed URL gets an explanation rather than a 500.
  const stats = await serverApi.myStats(days).catch((error) => {
    if (error instanceof ApiError && error.status === 403) return null;
    throw error;
  });

  if (stats === null) {
    return (
      <WrongAccount
        what="Listing figures"
        goTo="/seller/projects"
        goToLabel="Go to your projects"
      />
    );
  }

  const hasListings = stats.listings.length > 0;

  return (
    <div>
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="display text-[1.75rem] text-ink">Performance</h1>
          <p className="mt-1.5 text-[0.9375rem] text-muted">
            How buyers are responding to your properties.
          </p>
        </div>

        <nav aria-label="Date range" className="flex gap-1">
          {RANGES.map((range) => (
            <Link
              key={range.days}
              href={`/seller/performance?days=${range.days}`}
              aria-current={range.days === days ? 'true' : undefined}
              className={`rounded-control border px-3 py-1.5 text-[0.8125rem] font-medium transition-colors ${
                range.days === days
                  ? 'border-action bg-action text-white'
                  : 'border-line text-muted hover:border-muted hover:text-ink'
              }`}
            >
              {range.label}
            </Link>
          ))}
        </nav>
      </div>

      {!hasListings ? (
        <div className="mt-8 rounded-card border border-dashed border-line bg-surface px-6 py-16 text-center">
          <p className="text-[1.0625rem] font-medium text-ink">Nothing to measure yet</p>
          <p className="mx-auto mt-2 max-w-sm text-[0.9375rem] leading-relaxed text-muted">
            Once a property is live, this page shows how many people viewed it,
            shortlisted it and got in touch.
          </p>
          <Link
            href="/seller/listings/new"
            className="mt-6 inline-block rounded-control bg-action px-5 py-2.5 text-[0.9375rem] font-semibold text-white transition-colors hover:bg-action-hover"
          >
            Add a property
          </Link>
        </div>
      ) : (
        <>
          <div className="mt-7 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <Stat
              label="Views"
              value={stats.totals.views}
              note={`in the last ${days} days`}
              hint="One per person per day, so refreshing does not inflate it."
            />
            <Stat
              label="Shortlisted"
              value={stats.totals.saves}
              note="saved by buyers"
              hint="People holding your property in mind. Counted in total, not just this period."
              emphasis
            />
            <Stat
              label="Enquiries"
              value={stats.totals.leads}
              note={`in the last ${days} days`}
              hint="Buyers who asked to be contacted."
            />
            <Stat label="Live" value={stats.totals.live} note="verified and public" />
          </div>

          {/*
            Shortlists without enquiries are the most actionable signal a seller
            gets, so it is stated rather than left for them to infer from two
            numbers sitting side by side.
          */}
          {stats.totals.saves > 0 && stats.totals.saves > stats.totals.leads && (
            <p className="mt-4 rounded-card border-l-[3px] border-verify bg-verify-soft px-4 py-3 text-[0.875rem] leading-relaxed text-ink">
              <strong className="font-semibold">
                {stats.totals.saves - stats.totals.leads}{' '}
                {stats.totals.saves - stats.totals.leads === 1 ? 'buyer has' : 'buyers have'}
              </strong>{' '}
              shortlisted a property without getting in touch. That usually means
              interest held back by price or by not enough photographs.
            </p>
          )}

          <ViewsChart daily={stats.daily} />

          <section className="mt-10" aria-labelledby="per-listing">
            <h2 id="per-listing" className="display text-[1.25rem] text-ink">
              By property
            </h2>

            <div className="mt-4 overflow-x-auto">
              <table className="w-full min-w-[40rem] border-collapse text-left">
                <thead>
                  <tr className="border-b border-line">
                    <th scope="col" className="pb-2.5 text-[0.75rem] font-semibold uppercase tracking-wider text-faint">
                      Property
                    </th>
                    {['Views', 'Shortlisted', 'Enquiries'].map((heading) => (
                      <th
                        key={heading}
                        scope="col"
                        className="w-28 pb-2.5 text-right text-[0.75rem] font-semibold uppercase tracking-wider text-faint"
                      >
                        {heading}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {stats.listings.map((item) => (
                    <tr key={item.id} className="border-b border-line last:border-none">
                      <td className="py-3 pr-4">
                        <Link href={`/seller/listings/${item.id}`} className="group flex items-center gap-3">
                          <span className="h-11 w-14 shrink-0 overflow-hidden rounded-control bg-canvas-deep">
                            {item.photo && (
                              /* eslint-disable-next-line @next/next/no-img-element */
                              <img src={item.photo} alt="" className="h-full w-full object-cover" loading="lazy" />
                            )}
                          </span>
                          <span className="min-w-0">
                            <span className="block truncate text-[0.9375rem] font-medium text-ink group-hover:underline">
                              {item.bedrooms} BHK in {item.locality}
                            </span>
                            <span className="block text-[0.8125rem] text-muted tabular">
                              {formatRupeesShort(item.price)} · {formatArea(item.areaSqft)}
                              {!item.isVerified && (
                                <span className="ml-2 text-faint">Not live</span>
                              )}
                            </span>
                          </span>
                        </Link>
                      </td>
                      <td className="py-3 text-right text-[0.9375rem] tabular text-ink">{item.views}</td>
                      <td className="py-3 text-right text-[0.9375rem] tabular font-semibold text-ink">
                        {item.saves}
                      </td>
                      <td className="py-3 text-right text-[0.9375rem] tabular text-ink">{item.leads}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          <p className="mt-6 text-[0.8125rem] leading-relaxed text-faint">
            We never tell you which buyers shortlisted a property, only how many.
            Someone who saved it but has not written to you has chosen not to be
            contacted yet.
          </p>
        </>
      )}
    </div>
  );
}

function Stat({
  label,
  value,
  note,
  hint,
  emphasis,
}: {
  label: string;
  value: number;
  note: string;
  hint?: string;
  emphasis?: boolean;
}) {
  return (
    <div
      className={`rounded-card border px-5 py-4 ${
        emphasis ? 'border-verify/40 bg-verify-soft' : 'border-line bg-surface'
      }`}
    >
      <p className="label text-muted">{label}</p>
      <p className="mt-1.5 display text-[2rem] leading-none tabular text-ink">{value}</p>
      <p className="mt-1.5 text-[0.8125rem] text-muted">{note}</p>
      {hint && <p className="mt-2 text-[0.75rem] leading-snug text-faint">{hint}</p>}
    </div>
  );
}

/**
 * Views per day.
 *
 * Plain scaled bars rather than a charting library: it is one series over at
 * most ninety points, and pulling in a dependency for that would cost more to
 * load than the whole page.
 */
function ViewsChart({ daily }: { daily: SellerStats['daily'] }) {
  const peak = Math.max(...daily.map((day) => day.views), 1);
  const total = daily.reduce((sum, day) => sum + day.views, 0);

  if (total === 0) {
    return (
      <p className="mt-8 rounded-card border border-dashed border-line px-5 py-8 text-center text-[0.875rem] text-muted">
        No views recorded in this period yet.
      </p>
    );
  }

  return (
    <section className="mt-8" aria-labelledby="views-chart">
      <h2 id="views-chart" className="display text-[1.25rem] text-ink">
        Views per day
      </h2>

      <div className="mt-4 rounded-card border border-line bg-surface px-5 py-5">
        <div className="flex h-32 items-end gap-[3px]" role="img" aria-label={`${total} views over ${daily.length} days`}>
          {daily.map((day) => (
            <div
              key={day.date}
              className="group relative flex-1 rounded-t-[3px] bg-action/15 transition-colors hover:bg-action/35"
              // A floor of 2% keeps zero-view days visible as a baseline rather
              // than a gap, so the axis reads as continuous.
              style={{ height: `${Math.max((day.views / peak) * 100, 2)}%` }}
            >
              <span className="pointer-events-none absolute bottom-full left-1/2 z-10 mb-1.5 hidden -translate-x-1/2 whitespace-nowrap rounded-control bg-ink px-2 py-1 text-[0.6875rem] text-white group-hover:block">
                {day.views} on {new Date(day.date).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}
              </span>
            </div>
          ))}
        </div>

        <div className="mt-2.5 flex justify-between text-[0.75rem] text-faint tabular">
          <span>
            {new Date(daily[0]!.date).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}
          </span>
          <span>Peak {peak} in a day</span>
          <span>
            {new Date(daily[daily.length - 1]!.date).toLocaleDateString('en-IN', {
              day: 'numeric',
              month: 'short',
            })}
          </span>
        </div>
      </div>
    </section>
  );
}

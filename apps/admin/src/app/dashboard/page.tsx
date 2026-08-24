import Link from 'next/link';
import { redirect } from 'next/navigation';
import { adminApi, ApiError, type Metrics } from '@/lib/api';
import { ConsoleShell } from '@/components/console-shell';
import {
  DailyBars,
  Hero,
  Panel,
  Stat,
  ThinSample,
  TimeAxis,
  formatHours,
  formatNumber,
  formatPercent,
} from './figures';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Dashboard' };

const WINDOWS = [7, 30, 90] as const;

/** "1 listing", "3 listings". Every noun used here is regular. */
function plural(count: number, noun: string): string {
  return `${count} ${noun}${count === 1 ? '' : 's'}`;
}

interface PageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

/**
 * One step of the funnel.
 *
 * A stepped list rather than a bar chart, deliberately. The steps span three
 * orders of magnitude — hundreds of views against a handful of sales — so bars
 * drawn to a shared scale would render every stage after the first as an
 * invisible sliver. The number and the drop-off between steps are the content;
 * a chart here would be decoration that hid them.
 */
function FunnelStep({
  label,
  value,
  rate,
  rateLabel,
  last,
}: {
  label: string;
  value: number;
  rate?: number | null;
  rateLabel?: string;
  last?: boolean;
}) {
  return (
    <li className="flex items-baseline justify-between gap-4 py-2.5">
      <div className="min-w-0">
        <p className="text-[0.875rem] text-ink">{label}</p>
        {rateLabel && (
          <p className="mt-0.5 text-[0.6875rem] text-graphite">
            {rate === null || rate === undefined ? '—' : `${rate}%`} {rateLabel}
          </p>
        )}
      </div>
      <p
        className={`shrink-0 font-display font-extrabold tabular ${
          last ? 'text-[1.375rem] text-ink' : 'text-[1.125rem] text-graphite'
        }`}
      >
        {formatNumber(value)}
      </p>
    </li>
  );
}

export default async function DashboardPage({ searchParams }: PageProps) {
  const params = await searchParams;
  const raw = params.days;
  const requested = Number(Array.isArray(raw) ? raw[0] : raw);
  const days = WINDOWS.includes(requested as (typeof WINDOWS)[number]) ? requested : 30;

  let user;
  let metrics: Metrics;
  try {
    [user, metrics] = await Promise.all([adminApi.me(), adminApi.metrics(days)]);
  } catch (error) {
    if (error instanceof ApiError && (error.status === 401 || error.status === 403)) {
      redirect('/login');
    }
    throw error;
  }

  const { verification, funnel, leads, sales, growth, inventory, onboarding, moderation } =
    metrics;

  const slaMissed =
    verification.withinSlaPercent !== null && verification.withinSlaPercent < 90;

  return (
    <ConsoleShell user={user} active="dashboard">
      <div className="flex flex-wrap items-baseline justify-between gap-4">
        <div>
          <h1 className="font-display text-[1.375rem] font-extrabold leading-none tracking-tight text-ink">
            How things are going
          </h1>
          <p className="mt-1.5 text-[0.8125rem] text-graphite">
            Counts only — no names, numbers or addresses appear on this page.
          </p>
        </div>

        {/* Links rather than a control, so a window is a real URL somebody can
            send to a colleague. */}
        <nav className="flex items-center gap-1" aria-label="Time window">
          {WINDOWS.map((option) => (
            <Link
              key={option}
              href={`/dashboard?days=${option}`}
              aria-current={option === days ? 'true' : undefined}
              className={`px-2.5 py-1 text-[0.8125rem] transition-colors ${
                option === days
                  ? 'bg-ink text-paper'
                  : 'border border-paper-edge text-graphite hover:text-ink'
              }`}
            >
              {option} days
            </Link>
          ))}
        </nav>
      </div>

      <div className="mt-6 space-y-4">
        {/* ---------------- The promise ---------------- */}
        <Panel
          title="Verification"
          hint={`The ${metrics.slaHours}-hour promise is the commitment made publicly, and the only one that can be missed quietly.`}
        >
          <div className="grid gap-6 sm:grid-cols-[minmax(0,1fr)_2fr]">
            <div>
              <Hero
                value={formatPercent(verification.withinSlaPercent)}
                label={`Decided within ${metrics.slaHours} h`}
                tone={slaMissed ? 'bad' : 'neutral'}
              />
              <p className="mt-1.5">
                <ThinSample
                  n={verification.timedSample}
                  threshold={metrics.minConfidentSample}
                />
              </p>
            </div>

            <dl className="grid grid-cols-2 gap-x-6 gap-y-5 sm:grid-cols-3">
              <Stat
                value={formatNumber(verification.pendingListings + verification.pendingProjects)}
                label="Waiting now"
                caption={`${plural(verification.pendingListings, 'listing')} · ${plural(verification.pendingProjects, 'project')}`}
              />
              <Stat
                value={formatNumber(verification.overdue)}
                label="Overdue"
                tone={verification.overdue > 0 ? 'bad' : 'neutral'}
                caption={verification.overdue > 0 ? 'Past the promise' : 'Inside the promise'}
              />
              <Stat
                value={formatHours(verification.medianHoursToDecision)}
                label="Typical wait"
                caption="Median from submission"
              />
              <Stat
                value={formatHours(verification.p90HoursToDecision)}
                label="Slow tail"
                // The median can sit comfortably inside the SLA while the
                // slowest tenth waits days — and those are the submissions
                // people complain about.
                caption="9 in 10 decided by"
              />
              <Stat
                value={formatNumber(verification.decided.total)}
                label="Decided"
                caption={`${verification.decided.approved} approved · ${verification.decided.rejected} rejected · ${verification.decided.revisionRequested} sent back`}
              />
              <Stat
                value={formatNumber(moderation.openReports)}
                label="Open reports"
                tone={moderation.openReports > 0 ? 'bad' : 'neutral'}
              />
            </dl>
          </div>
        </Panel>

        {/* ---------------- The funnel ---------------- */}
        <div className="grid gap-4 lg:grid-cols-2">
          <Panel
            title="From looking to buying"
            hint="Each step as a share of the one above it."
          >
            <ul className="divide-y divide-paper-edge">
              <FunnelStep label="Listing views" value={funnel.views} />
              <FunnelStep
                label="Shortlisted"
                value={funnel.shortlists}
                rate={funnel.shortlistRate}
                rateLabel="of views"
              />
              <FunnelStep
                label="Enquiries"
                value={funnel.enquiries}
                rate={funnel.enquiryRate}
                rateLabel="of shortlists"
              />
              <FunnelStep
                label="Visit requests"
                value={funnel.siteVisits}
                rate={funnel.visitRate}
                rateLabel="of enquiries"
              />
              <FunnelStep label="Sold" value={funnel.sold} last />
            </ul>
          </Panel>

          <Panel
            title="Did we cause the sale?"
            hint="Asked of the seller at the moment of sale, about one transaction. This is the figure to trust."
          >
            <div className="grid gap-6 sm:grid-cols-2">
              <div>
                <Hero
                  value={formatPercent(sales.attributedPercent)}
                  label="Buyer came from here"
                  caption="Of sellers who answered"
                />
                <p className="mt-1.5">
                  <ThinSample
                    n={sales.throughPlatform + sales.notThroughPlatform}
                    threshold={metrics.minConfidentSample}
                  />
                </p>
              </div>

              <dl className="grid grid-cols-2 gap-x-6 gap-y-5">
                <Stat value={formatNumber(sales.sold)} label="Sold" />
                <Stat
                  value={formatNumber(sales.notAnswered)}
                  label="Didn’t say"
                  caption="Excluded from the rate"
                />
                <Stat
                  value={formatPercent(sales.medianPriceGapPercent)}
                  label="Against asking"
                  caption={`From ${sales.priceDisclosed} disclosed`}
                />
                <Stat
                  value={formatPercent(leads.conversionPercent)}
                  label="Leads converted"
                  // Sellers rarely revisit a lead to mark it closed, so this
                  // under-counts by an unknown amount. Kept because the trend
                  // is informative; labelled so nobody quotes it as fact.
                  caption="Seller-reported, under-counts"
                />
              </dl>
            </div>
          </Panel>
        </div>

        {/* ---------------- Enquiry health ---------------- */}
        <Panel
          title="Enquiries"
          hint="An enquiry nobody answers is the complaint buyers make most about the incumbents."
        >
          <dl className="grid grid-cols-2 gap-x-6 gap-y-5 sm:grid-cols-4">
            <Stat value={formatNumber(leads.total)} label="Received" />
            <Stat
              value={formatHours(leads.medianResponseHours)}
              label="Typical reply"
              caption={`From ${leads.respondedSample} answered`}
            />
            <Stat
              value={formatNumber(leads.unansweredOver48h)}
              label={`Untouched ${leads.unansweredHours} h+`}
              tone={leads.unansweredOver48h > 0 ? 'bad' : 'neutral'}
              caption={leads.unansweredOver48h > 0 ? 'Worth chasing' : 'None outstanding'}
            />
            <Stat
              value={formatPercent(onboarding.completionPercent)}
              label="Finished onboarding"
              caption={`${onboarding.completed} of ${onboarding.started} who started`}
            />
          </dl>
        </Panel>

        {/* ---------------- Activity ---------------- */}
        <Panel
          title={`Activity, last ${days} days`}
          hint="One bar per day, quiet days included — a chart drawn only from busy days makes a flat fortnight look busy."
        >
          <div className="space-y-5">
            <DailyBars
              label="Registrations"
              noun="registrations"
              data={growth.daily.map((row) => ({ date: row.date, value: row.registrations }))}
            />
            <DailyBars
              label="Listings submitted"
              noun="listings"
              data={growth.daily.map((row) => ({
                date: row.date,
                value: row.listingsSubmitted,
              }))}
            />
            <DailyBars
              label="Enquiries"
              noun="enquiries"
              data={growth.daily.map((row) => ({ date: row.date, value: row.enquiries }))}
            />

            {/* One axis for all three — they share the window, and repeating
                it under each would be noise. */}
            {growth.daily.length > 0 && (
              <TimeAxis
                from={growth.daily[0]!.date}
                to={growth.daily[growth.daily.length - 1]!.date}
              />
            )}
          </div>

          {/* The numbers behind the marks, for anyone who cannot read them off
              a chart or would simply rather not. */}
          <details className="mt-5 border-t border-paper-edge pt-3">
            <summary className="cursor-pointer list-none text-[0.8125rem] text-indigo underline-offset-4 hover:underline">
              Show the numbers
            </summary>
            <div className="mt-3 max-h-72 overflow-auto">
              <table className="w-full border-collapse text-[0.75rem]">
                <thead className="sticky top-0 bg-paper">
                  <tr className="border-b border-paper-edge">
                    {['Date', 'Registrations', 'Listings', 'Enquiries'].map((heading) => (
                      <th
                        key={heading}
                        scope="col"
                        className="stamp-label px-2 py-1.5 text-left text-graphite-light"
                      >
                        {heading}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {growth.daily.map((row) => (
                    <tr key={row.date} className="border-b border-paper-edge last:border-0">
                      <th scope="row" className="px-2 py-1 text-left font-normal text-graphite">
                        {row.date}
                      </th>
                      <td className="px-2 py-1 tabular text-ink">{row.registrations}</td>
                      <td className="px-2 py-1 tabular text-ink">{row.listingsSubmitted}</td>
                      <td className="px-2 py-1 tabular text-ink">{row.enquiries}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </details>
        </Panel>

        {/* ---------------- Who and what ---------------- */}
        <div className="grid gap-4 lg:grid-cols-2">
          <Panel title="Who signed up" hint={`New accounts in the last ${days} days.`}>
            <dl className="grid grid-cols-2 gap-x-6 gap-y-5 sm:grid-cols-4">
              <Stat value={formatNumber(growth.registrations.total)} label="Total" />
              <Stat value={formatNumber(growth.registrations.buyers)} label="Buyers" />
              <Stat
                value={formatNumber(
                  growth.registrations.owners + growth.registrations.brokers,
                )}
                label="Sellers"
                caption={`${growth.registrations.owners} owners · ${growth.registrations.brokers} agents`}
              />
              <Stat value={formatNumber(growth.registrations.builders)} label="Builders" />
            </dl>
          </Panel>

          <Panel title="What is on the platform" hint="Right now, not over the window.">
            <dl className="grid grid-cols-2 gap-x-6 gap-y-5 sm:grid-cols-4">
              <Stat
                value={formatNumber(inventory.liveListings)}
                label="Live listings"
                caption={`${inventory.liveProjects} projects`}
              />
              <Stat
                value={formatNumber(inventory.pausedListings)}
                label="Paused"
                caption="Taken down by the seller"
              />
              <Stat value={formatNumber(inventory.soldListings)} label="Sold" />
              <Stat
                value={formatNumber(inventory.suspendedUsers)}
                label="Suspended"
                tone={inventory.suspendedUsers > 0 ? 'bad' : 'neutral'}
                caption="Accounts"
              />
            </dl>
          </Panel>
        </div>
      </div>
    </ConsoleShell>
  );
}

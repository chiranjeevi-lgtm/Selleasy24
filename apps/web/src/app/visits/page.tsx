import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { ApiError } from '@/lib/api';
import { serverApi, type SiteVisit } from '@/lib/server-api';
import { formatAge } from '@/lib/format';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Your visits',
  description: 'Properties you have asked to see, and what the owner said.',
};

/**
 * The buyer's side of a visit request.
 *
 * The listing page tells them "you will see the answer here", so this page has
 * to actually carry the answer — including a decline and the reason for it.
 */

function when(iso: string): string {
  return new Date(iso).toLocaleString('en-IN', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  });
}

/**
 * What the buyer needs to know at a glance: whose move is it, and is it on.
 * `tone` drives the badge; `line` is the one sentence that says where it stands.
 */
function standing(visit: SiteVisit): {
  label: string;
  tone: string;
  line: string;
} {
  switch (visit.status) {
    case 'REQUESTED':
      return {
        label: 'Waiting',
        tone: 'border-line bg-canvas-deep text-muted',
        line: `You asked to visit on ${when(visit.preferredAt)}. The owner has not replied yet.`,
      };
    case 'CONFIRMED':
      return {
        label: 'Confirmed',
        tone: 'border-action bg-action text-white',
        line: visit.confirmedAt
          ? `Confirmed for ${when(visit.confirmedAt)}.`
          : 'The owner confirmed your visit.',
      };
    case 'RESCHEDULED':
      return {
        label: 'New time offered',
        tone: 'border-verify bg-verify-soft text-verify-ink',
        line: visit.proposedAt
          ? `The owner cannot do your time and suggested ${when(visit.proposedAt)} instead.`
          : 'The owner suggested a different time.',
      };
    case 'DECLINED':
      return {
        label: 'Declined',
        tone: 'border-seal bg-seal-soft text-seal',
        line: 'The owner cannot show the property.',
      };
    case 'CANCELLED':
      return {
        label: 'Cancelled',
        tone: 'border-line bg-canvas-deep text-muted',
        line: 'This request was cancelled.',
      };
    case 'COMPLETED':
      return {
        label: 'Visited',
        tone: 'border-line bg-canvas-deep text-muted',
        line: visit.confirmedAt ? `You visited on ${when(visit.confirmedAt)}.` : 'You visited this property.',
      };
  }
}

export default async function BuyerVisitsPage() {
  let visits: SiteVisit[];

  try {
    visits = await serverApi.mySiteVisits();
  } catch (error) {
    if (error instanceof ApiError && (error.status === 401 || error.status === 403)) {
      redirect('/login?next=/visits');
    }
    throw error;
  }

  return (
    <div className="mx-auto max-w-[52rem] px-5 py-8 sm:px-8">
      <nav aria-label="Breadcrumb" className="mb-5 text-[0.875rem]">
        <Link href="/" className="text-muted transition-colors hover:text-ink">
          Homes
        </Link>
        <span className="mx-2 text-faint" aria-hidden="true">/</span>
        <span className="text-ink">Visits</span>
      </nav>

      <h1 className="display text-[1.75rem] text-ink sm:text-[2.125rem]">Your visits</h1>
      <p className="mt-2 max-w-prose text-[0.9375rem] text-muted">
        {visits.length === 0
          ? 'Nothing here yet.'
          : 'Every property you have asked to see, and what the owner said.'}
      </p>

      {visits.length === 0 ? (
        <div className="mt-8 rounded-card border border-dashed border-line bg-surface px-6 py-16 text-center">
          <p className="text-[1.0625rem] font-medium text-ink">
            Ask to see a property
          </p>
          <p className="mx-auto mt-2 max-w-sm text-[0.875rem] leading-relaxed text-muted">
            Open any home you like the look of and request a visit. The owner
            confirms your time or offers another, and the answer shows up here.
          </p>
          <Link
            href="/"
            className="mt-6 inline-block rounded-control bg-action px-5 py-2.5 text-[0.9375rem] font-semibold text-white transition-colors hover:bg-action-hover"
          >
            Browse homes
          </Link>
        </div>
      ) : (
        <ul className="mt-7 space-y-3">
          {visits.map((visit) => {
            const state = standing(visit);
            return (
              <li key={visit.id} className="rounded-card border border-line bg-surface px-5 py-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <Link
                    href={`/listings/${visit.listing.id}`}
                    className="min-w-0 text-[0.9375rem] font-semibold text-ink hover:underline"
                  >
                    {visit.listing.title}
                  </Link>
                  <span
                    className={`label shrink-0 rounded-full border px-2.5 py-1 ${state.tone}`}
                  >
                    {state.label}
                  </span>
                </div>

                <p className="mt-2 text-[0.875rem] leading-relaxed text-ink">{state.line}</p>

                {visit.sellerNote && (
                  <p className="mt-2 text-[0.875rem] leading-relaxed text-muted">
                    They said: “{visit.sellerNote}”
                  </p>
                )}

                {visit.note && (
                  <p className="mt-2 text-[0.8125rem] leading-relaxed text-faint">
                    You wrote: “{visit.note}”
                  </p>
                )}

                <p className="mt-3 border-t border-line pt-2.5 text-[0.75rem] text-faint">
                  Requested {formatAge(visit.createdAt)}
                </p>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

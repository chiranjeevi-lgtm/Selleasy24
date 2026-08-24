import Link from 'next/link';
import { ApiError } from '@/lib/api';
import { serverApi, type SiteVisit } from '@/lib/server-api';
import { VisitCard } from './visit-card';
import { WrongAccount } from '../wrong-account';

export const dynamic = 'force-dynamic';

/**
 * Visit requests waiting on the seller.
 *
 * Open requests come first and everything settled is collapsed below them. A
 * seller opening this page has one question — who is waiting on me — and the
 * page should answer it before they scroll.
 */
export default async function SellerVisitsPage() {
  // A builder reaching this by typed URL gets an explanation rather than a 500.
  const visits = await serverApi.receivedSiteVisits().catch((error) => {
    if (error instanceof ApiError && error.status === 403) return null;
    throw error;
  });

  if (visits === null) {
    return (
      <WrongAccount
        what="Visit requests"
        goTo="/seller/projects"
        goToLabel="Go to your projects"
      />
    );
  }

  const isOpen = (v: SiteVisit) => v.status === 'REQUESTED' || v.status === 'RESCHEDULED';

  const open = visits.filter(isOpen);
  const settled = visits.filter((v) => !isOpen(v));
  const awaiting = open.filter((v) => v.status === 'REQUESTED').length;

  return (
    <div>
      <div className="flex flex-wrap items-baseline justify-between gap-3">
        <h2 className="label text-muted">
          {visits.length === 0
            ? 'No visit requests yet'
            : `${visits.length} ${visits.length === 1 ? 'request' : 'requests'}`}
        </h2>
        {awaiting > 0 && (
          <span className="label rounded-full border border-action/35 px-2.5 py-1 text-action">
            {awaiting} waiting on you
          </span>
        )}
      </div>

      {visits.length === 0 ? (
        <div className="mt-6 rounded-card border border-dashed border-line px-6 py-14 text-center">
          <p className="text-[0.9375rem] text-ink">Visit requests appear here</p>
          <p className="mx-auto mt-2 max-w-sm text-[0.8125rem] leading-relaxed text-muted">
            When a buyer asks to see one of your live properties, you pick the
            time here — confirm what they suggested, offer another slot, or say
            it is not possible. We email you as soon as one arrives.
          </p>
          <Link
            href="/seller/listings"
            className="mt-5 inline-block rounded-control border border-action px-4 py-2 text-[0.875rem] text-action transition-colors hover:bg-action hover:text-surface"
          >
            View your listings
          </Link>
        </div>
      ) : (
        <>
          <p className="mt-3 max-w-prose text-[0.75rem] leading-relaxed text-faint">
            Buyer contact details appear on open requests only, and were given to
            you alone. Answer even when the answer is no — a request left hanging
            is the thing buyers complain about most.
          </p>

          {open.length > 0 && (
            <ul className="mt-5 space-y-3">
              {open.map((visit) => (
                <VisitCard key={visit.id} visit={visit} />
              ))}
            </ul>
          )}

          {settled.length > 0 && (
            <section className="mt-9">
              <h3 className="label text-faint">Settled</h3>
              <ul className="mt-3 space-y-3">
                {settled.map((visit) => (
                  <VisitCard key={visit.id} visit={visit} />
                ))}
              </ul>
            </section>
          )}
        </>
      )}
    </div>
  );
}

import Link from 'next/link';
import { serverApi } from '@/lib/server-api';
import { formatAge, formatDate } from '@/lib/format';
import { LeadStatusControl } from './lead-status-control';

export const dynamic = 'force-dynamic';

/** Status labels in the seller's language, in pipeline order. */
const STATUS_LABEL: Record<string, string> = {
  NEW: 'New',
  CONTACTED: 'Contacted',
  INTERESTED: 'Interested',
  NOT_INTERESTED: 'Not interested',
  CONVERTED: 'Sold to them',
};

export default async function SellerLeadsPage() {
  const leads = await serverApi.myLeads();
  const newCount = leads.filter((lead) => lead.status === 'NEW').length;

  return (
    <div>
      <div className="flex flex-wrap items-baseline justify-between gap-3">
        <h2 className="stamp-label text-muted">
          {leads.length === 0
            ? 'No enquiries yet'
            : `${leads.length} ${leads.length === 1 ? 'enquiry' : 'enquiries'}`}
        </h2>
        {newCount > 0 && (
          <span className="stamp-label border border-action/35 px-2 py-[3px] text-action">
            {newCount} unanswered
          </span>
        )}
      </div>

      {leads.length === 0 ? (
        <div className="mt-6 border border-dashed border-line px-6 py-14 text-center">
          <p className="text-[0.9375rem] text-ink">Enquiries appear here</p>
          <p className="mx-auto mt-2 max-w-sm text-[0.8125rem] leading-relaxed text-muted">
            When a buyer contacts you about a live listing, their name and number
            show up on this page. We email you as soon as one arrives.
          </p>
          <Link
            href="/seller/listings"
            className="mt-5 inline-block border border-action px-4 py-2 text-[0.875rem] text-action transition-colors hover:bg-action hover:text-surface"
          >
            View your listings
          </Link>
        </div>
      ) : (
        <>
          <p className="mt-3 max-w-prose text-[0.75rem] leading-relaxed text-faint">
            These contact details were given to you and only you. Passing them on
            to other agents is a breach of our terms and the reason buyers trust
            this platform.
          </p>

          <ul className="mt-5 space-y-3">
            {leads.map((lead) => (
              <li key={lead.id} className="border border-line bg-surface px-4 py-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-[0.9375rem] font-medium text-ink">{lead.name}</p>
                    <p className="mt-0.5 text-[0.8125rem] text-muted">
                      <a
                        href={`tel:${lead.phone}`}
                        className="tabular text-action hover:underline"
                      >
                        {lead.phone}
                      </a>
                      {lead.email && (
                        <>
                          <span className="mx-1.5 text-line" aria-hidden="true">
                            ·
                          </span>
                          <a
                            href={`mailto:${lead.email}`}
                            className="text-action hover:underline"
                          >
                            {lead.email}
                          </a>
                        </>
                      )}
                    </p>
                  </div>

                  <span className="stamp-label text-faint">
                    {formatAge(lead.createdAt)}
                  </span>
                </div>

                <p className="mt-2 text-[0.75rem] text-muted">
                  About{' '}
                  <Link
                    href={`/seller/listings/${lead.listing.id}`}
                    className="text-action hover:underline"
                  >
                    {lead.listing.title}
                  </Link>
                </p>

                {lead.message && (
                  <blockquote className="mt-3 border-l-2 border-line pl-3 text-[0.8125rem] leading-relaxed whitespace-pre-line text-ink">
                    {lead.message}
                  </blockquote>
                )}

                <div className="mt-3.5 flex flex-wrap items-center justify-between gap-3 border-t border-line pt-3">
                  <LeadStatusControl
                    leadId={lead.id}
                    current={lead.status}
                    labels={STATUS_LABEL}
                  />
                  {lead.contactedAt && (
                    <span className="text-[0.6875rem] text-faint">
                      First replied {formatDate(lead.contactedAt)}
                    </span>
                  )}
                </div>
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  );
}

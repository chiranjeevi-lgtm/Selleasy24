import Link from 'next/link';
import { ApiError } from '@/lib/api';
import { serverApi } from '@/lib/server-api';
import { WrongAccount } from '../wrong-account';
import { StatusBadge, StatusMeaning } from '@/components/status-badge';
import { formatAge, formatArea, formatRupees } from '@/lib/format';

export const dynamic = 'force-dynamic';

export default async function SellerListingsPage() {
  // A builder reaching this by typed URL gets an explanation rather than a 500.
  const [listings, me] = await Promise.all([
    serverApi.myListings().catch((error) => {
      if (error instanceof ApiError && error.status === 403) return null;
      throw error;
    }),
    serverApi.me().catch(() => null),
  ]);

  if (listings === null) {
    return (
      <WrongAccount
        what="Resale listings"
        goTo="/seller/projects"
        goToLabel="Go to your projects"
      />
    );
  }

  const needsPhoneVerification = me !== null && !me.isPhoneVerified;

  return (
    <div>
      {/*
        Surfaced before anything else. Submission is refused without a verified
        number, and finding that out at the end — after filling in five steps,
        photographs and documents — is the worst possible moment to learn it.
      */}
      {needsPhoneVerification && (
        <div className="mb-6 flex flex-wrap items-center justify-between gap-4 rounded-card border-l-[3px] border-verify bg-verify-soft px-5 py-4">
          <div>
            <p className="text-[0.9375rem] font-semibold text-ink">
              Verify your phone number
            </p>
            <p className="mt-1 text-[0.875rem] leading-relaxed text-muted">
              {me?.phone
                ? `We need to confirm ${me.phone} before a listing can go for review. Buyers reach you on this number.`
                : 'Add and confirm a number before a listing can go for review. Buyers reach you on it.'}
            </p>
          </div>
          <Link
            href="/seller/phone"
            className="shrink-0 rounded-control bg-action px-4 py-2.5 text-[0.875rem] font-semibold text-white transition-colors hover:bg-action-hover"
          >
            Verify now
          </Link>
        </div>
      )}

      <div className="flex flex-wrap items-baseline justify-between gap-4">
        <h2 className="label text-muted">
          {listings.length === 0
            ? 'No listings yet'
            : `${listings.length} ${listings.length === 1 ? 'listing' : 'listings'}`}
        </h2>
        <Link
          href="/seller/listings/new"
          className="bg-action px-4 py-2 text-[0.875rem] font-medium text-surface transition-colors hover:bg-action-hover"
        >
          Add a property
        </Link>
      </div>

      {listings.length === 0 ? (
        <div className="mt-6 border border-dashed border-line px-6 py-14 text-center">
          <p className="text-[0.9375rem] text-ink">List your first property</p>
          <p className="mx-auto mt-2 max-w-sm text-[0.8125rem] leading-relaxed text-muted">
            You will need at least three photos, the sale deed, an identity proof
            and a recent property tax receipt. An officer checks these before your
            listing goes live.
          </p>
          <Link
            href="/seller/listings/new"
            className="mt-5 inline-block bg-action px-4 py-2 text-[0.875rem] font-medium text-surface transition-colors hover:bg-action-hover"
          >
            Add a property
          </Link>
        </div>
      ) : (
        <ul className="mt-5 space-y-3">
          {listings.map((listing) => (
            <li key={listing.id} className="border border-line bg-surface">
              <Link
                href={`/seller/listings/${listing.id}`}
                className="block px-4 py-4 transition-colors hover:bg-canvas/40"
              >
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="truncate text-[0.9375rem] font-medium text-ink">
                      {listing.title}
                    </p>
                    <p className="mt-0.5 truncate text-[0.8125rem] text-muted">
                      {listing.property.address} · {listing.property.neighborhood.name}
                    </p>
                  </div>
                  <StatusBadge status={listing.status} />
                </div>

                <div className="mt-3 flex flex-wrap items-baseline gap-x-4 gap-y-1.5 border-t border-line pt-3 text-[0.75rem] text-muted">
                  <span className="tabular text-ink">
                    {formatRupees(Number(listing.price))}
                  </span>
                  <span className="tabular">{formatArea(listing.property.areaSqft)}</span>
                  <span className="tabular">
                    {listing._count.photos}/3 photos
                  </span>
                  <span className="tabular">
                    {listing._count.documents}/3 documents
                  </span>
                  {/* Views and enquiries are the seller's feedback loop. They are
                      deliberately not shown publicly. */}
                  {listing.status === 'APPROVED' && (
                    <>
                      <span className="tabular">{listing.viewsCount} views</span>
                      <span className="tabular">{listing.leadsCount} enquiries</span>
                    </>
                  )}
                  {listing.firstListedAt && (
                    <span>Listed {formatAge(listing.firstListedAt)}</span>
                  )}
                </div>

                <div className="mt-2.5">
                  <StatusMeaning status={listing.status} />
                </div>

                {listing.rejectionReason && (
                  <p className="mt-2.5 border-l-2 border-seal bg-seal-soft px-3 py-2 text-[0.8125rem] leading-relaxed text-ink">
                    {listing.rejectionReason}
                  </p>
                )}
                {listing.revisionNote && (
                  <p className="mt-2.5 border-l-2 border-action bg-surface px-3 py-2 text-[0.8125rem] leading-relaxed text-ink">
                    {listing.revisionNote}
                  </p>
                )}
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

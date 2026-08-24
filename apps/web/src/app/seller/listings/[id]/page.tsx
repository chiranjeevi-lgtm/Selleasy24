import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ApiError } from '@/lib/api';
import { serverApi, type SellerListingDetail } from '@/lib/server-api';
import { StatusBadge, StatusMeaning } from '@/components/status-badge';
import { formatArea, formatDate, formatRupees } from '@/lib/format';
import { MarketControls } from './market-controls';
import {
  ConfirmAvailability,
  DocumentUploader,
  PhotoUploader,
  SubmitForReview,
} from './upload-panels';

export const dynamic = 'force-dynamic';

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000';

function photoUrl(url: string): string {
  return url.startsWith('http') ? url : `${API_BASE}${url}`;
}

const REQUIRED_DOCUMENTS = [
  { kind: 'SALE_DEED', label: 'Sale deed' },
  { kind: 'ID_PROOF', label: 'Identity proof' },
  { kind: 'PROPERTY_TAX_RECEIPT', label: 'Property tax receipt' },
];

/**
 * What still stands between this listing and review.
 *
 * Computed here so the seller sees the same conditions the API will enforce at
 * submit time, rather than discovering them one rejection at a time.
 */
function submissionBlockers(listing: SellerListingDetail): string[] {
  const blockers: string[] = [];

  if (listing.photos.length < 3) {
    blockers.push(
      `Add ${3 - listing.photos.length} more ${listing.photos.length === 2 ? 'photo' : 'photos'} — three is the minimum.`,
    );
  }

  const present = new Set(listing.documents.map((doc) => doc.kind));
  for (const required of REQUIRED_DOCUMENTS) {
    if (!present.has(required.kind)) {
      blockers.push(`Upload the ${required.label.toLowerCase()}.`);
    }
  }

  return blockers;
}

export default async function SellerListingDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  let listing: SellerListingDetail;
  try {
    listing = await serverApi.myListing(id);
  } catch (error) {
    if (error instanceof ApiError && error.status === 404) {
      notFound();
    }
    throw error;
  }

  const isEditable = listing.status === 'DRAFT' || listing.status === 'REJECTED';
  const blockers = submissionBlockers(listing);
  const latestDecision = listing.verifications[0];

  return (
    <div className="max-w-3xl">
      <nav className="mb-5 text-[0.8125rem]">
        <Link href="/seller/listings" className="text-action hover:underline">
          Listings
        </Link>
        <span className="mx-2 text-faint" aria-hidden="true">
          /
        </span>
        <span className="text-muted">{listing.property.neighborhood.name}</span>
      </nav>

      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="font-display text-[1.375rem] font-extrabold leading-tight tracking-tight text-ink">
            {listing.title}
          </h2>
          <p className="mt-1 text-[0.875rem] text-muted">
            {listing.property.address} · {listing.property.neighborhood.name} ·{' '}
            <span className="tabular">{listing.property.pincode}</span>
          </p>
        </div>
        <StatusBadge status={listing.status} />
      </div>

      <div className="mt-3">
        <StatusMeaning status={listing.status} />
      </div>

      {/* The officer's reason, verbatim. A rejection without a usable reason is
          the behaviour buyers and sellers criticise incumbents for. */}
      {listing.rejectionReason && (
        <div className="mt-4 border-l-2 border-seal bg-seal-soft px-3.5 py-3">
          <p className="label text-seal">Why it was not approved</p>
          <p className="mt-1.5 text-[0.8125rem] leading-relaxed text-ink">
            {listing.rejectionReason}
          </p>
        </div>
      )}
      {listing.revisionNote && (
        <div className="mt-4 border-l-2 border-action bg-surface px-3.5 py-3">
          <p className="label text-action">Changes requested</p>
          <p className="mt-1.5 text-[0.8125rem] leading-relaxed text-ink">
            {listing.revisionNote}
          </p>
        </div>
      )}

      <dl className="mt-6 grid grid-cols-2 gap-px border border-line bg-line sm:grid-cols-4">
        {[
          { label: 'Asking price', value: formatRupees(Number(listing.price)) },
          { label: 'Area', value: formatArea(listing.property.areaSqft) },
          { label: 'Configuration', value: `${listing.property.bedrooms} BHK` },
          {
            label: 'Views',
            value: listing.status === 'APPROVED' ? String(listing.viewsCount) : '—',
          },
        ].map((item) => (
          <div key={item.label} className="bg-surface px-3.5 py-3">
            <dt className="label text-faint">{item.label}</dt>
            <dd className="mt-1.5 text-[0.875rem] text-ink tabular">{item.value}</dd>
          </div>
        ))}
      </dl>

      {/* ---------------- Photos ---------------- */}
      <section className="mt-8" aria-labelledby="photos-heading">
        <h3 id="photos-heading" className="label text-muted">
          Photos ({listing.photos.length})
        </h3>

        {listing.photos.length > 0 && (
          <ul className="mt-3 grid grid-cols-3 gap-2 sm:grid-cols-5">
            {listing.photos.map((photo) => (
              <li
                key={photo.id}
                className="aspect-square overflow-hidden border border-line bg-canvas-deep"
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={photoUrl(photo.url)}
                  alt=""
                  className="h-full w-full object-cover"
                  loading="lazy"
                />
              </li>
            ))}
          </ul>
        )}

        {isEditable ? (
          <div className="mt-4">
            <PhotoUploader listingId={listing.id} count={listing.photos.length} />
          </div>
        ) : (
          <p className="mt-3 text-[0.75rem] text-faint">
            Photos can only be changed while a listing is a draft or needs changes.
          </p>
        )}
      </section>

      {/* ---------------- Documents ---------------- */}
      <section className="mt-8 border-t border-line pt-6" aria-labelledby="docs-heading">
        <h3 id="docs-heading" className="label text-muted">
          Ownership documents ({listing.documents.length})
        </h3>

        {listing.documents.length > 0 && (
          <ul className="mt-3 divide-y divide-line border border-line bg-surface">
            {listing.documents.map((doc) => (
              <li
                key={doc.id}
                className="flex flex-wrap items-baseline justify-between gap-2 px-3.5 py-2.5"
              >
                <span className="text-[0.8125rem] text-ink">
                  {doc.kind.replace(/_/g, ' ').toLowerCase()}
                  {doc.idProofKind && (
                    <span className="text-muted"> · {doc.idProofKind.replace(/_/g, ' ').toLowerCase()}</span>
                  )}
                </span>
                <span className="text-[0.6875rem] text-faint tabular">
                  {doc.originalFilename} · {Math.ceil(doc.sizeBytes / 1024)} KB ·{' '}
                  {formatDate(doc.createdAt)}
                </span>
              </li>
            ))}
          </ul>
        )}

        {isEditable ? (
          <div className="mt-4">
            <DocumentUploader listingId={listing.id} documents={listing.documents} />
          </div>
        ) : (
          <p className="mt-3 text-[0.75rem] text-faint">
            Documents are locked while this listing is in review or live.
          </p>
        )}
      </section>

      {/* ---------------- Next step ---------------- */}
      {isEditable && (
        <section className="mt-8 border-t border-line pt-6">
          <SubmitForReview listingId={listing.id} blockers={blockers} />
        </section>
      )}

      {listing.status === 'APPROVED' && (
        <section className="mt-8 border-t border-line pt-6" aria-labelledby="avail-heading">
          <h3 id="avail-heading" className="label text-muted">
            Still available?
          </h3>
          <p className="mt-2 max-w-prose text-[0.8125rem] leading-relaxed text-muted">
            Buyers see when you last confirmed this, so keeping it current is
            worth doing. If it has gone, the panel below is the one to use.
          </p>
          <div className="mt-3">
            <ConfirmAvailability listingId={listing.id} />
          </div>
        </section>
      )}

      {/*
        Taking it off the market. Sits after "still available" deliberately —
        the two answer the same question, and a seller who has just been asked
        whether it is available should find "it sold" immediately below.
      */}
      <MarketControls
        listingId={listing.id}
        status={listing.status}
        askingPrice={Math.round(Number(listing.price))}
        pausedReason={listing.pausedReason ?? null}
      />

      {/* The sale record, once there is one. Shown back so the seller can see
          what we hold — and it is the only place these figures appear. */}
      {listing.status === 'SOLD' && (
        <section className="mt-8 border-t border-line pt-6" aria-labelledby="sold-heading">
          <h3 id="sold-heading" className="label text-muted">
            Sale
          </h3>
          <dl className="mt-3 space-y-1.5 text-[0.875rem]">
            <div className="flex justify-between gap-3">
              <dt className="text-muted">Marked sold</dt>
              <dd className="text-ink">{formatDate(listing.soldAt) ?? '—'}</dd>
            </div>
            <div className="flex justify-between gap-3">
              <dt className="text-muted">Asking price</dt>
              <dd className="text-ink tabular">
                {formatRupees(Math.round(Number(listing.price)))}
              </dd>
            </div>
            <div className="flex justify-between gap-3">
              <dt className="text-muted">Sold for</dt>
              <dd className="text-ink tabular">
                {listing.soldPrice === null || listing.soldPrice === undefined
                  ? 'You chose not to say'
                  : formatRupees(Math.round(Number(listing.soldPrice)))}
              </dd>
            </div>
            <div className="flex justify-between gap-3">
              <dt className="text-muted">Buyer from SellEasy24</dt>
              <dd className="text-ink">
                {listing.soldThroughPlatform === null ||
                listing.soldThroughPlatform === undefined
                  ? 'Not answered'
                  : listing.soldThroughPlatform
                    ? 'Yes'
                    : 'No'}
              </dd>
            </div>
          </dl>
          <p className="mt-3 max-w-prose text-[0.75rem] leading-relaxed text-faint">
            These figures are never shown against your listing or to any buyer.
            The sale price feeds the locality averages only in aggregate.
          </p>
        </section>
      )}

      {/* ---------------- Verification history ---------------- */}
      {latestDecision && (
        <section className="mt-8 border-t border-line pt-6" aria-labelledby="history-heading">
          <h3 id="history-heading" className="label text-muted">
            Latest verification
          </h3>
          <p className="mt-2 text-[0.8125rem] text-muted">
            {latestDecision.decision.toLowerCase().replace(/_/g, ' ')} on{' '}
            {formatDate(latestDecision.createdAt)}
          </p>
          {latestDecision.checks.length > 0 && (
            <ul className="mt-3 space-y-1.5">
              {latestDecision.checks.map((check) => (
                <li key={check.kind} className="flex gap-2 text-[0.8125rem]">
                  <span
                    aria-hidden="true"
                    className={check.passed ? 'text-seal' : 'text-faint'}
                  >
                    {check.passed ? '✓' : '—'}
                  </span>
                  <span className={check.passed ? 'text-ink' : 'text-muted'}>
                    {check.kind.replace(/_/g, ' ').toLowerCase()}
                    {check.note && (
                      <span className="block text-[0.75rem] text-faint">
                        {check.note}
                      </span>
                    )}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </section>
      )}
    </div>
  );
}

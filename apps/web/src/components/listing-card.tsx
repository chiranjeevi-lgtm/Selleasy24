import Link from 'next/link';
import type { ListingCard as Listing } from '@/lib/api';
import { CompareToggle } from '@/components/compare-controls';
import { SaveButton } from '@/components/save-button';
import {
  formatAge,
  formatArea,
  formatPerSqft,
  formatRupeesShort,
} from '@/lib/format';

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000';

function photoUrl(url: string): string {
  return url.startsWith('http') ? url : `${API_BASE}${url}`;
}

/**
 * Verification mark — Cross-Cutting Principle #4 realised.
 *
 * Renders "Verified · Nh ago · V-001" so the check is attributable and
 * dateable. Square Yards' passive badge has no timestamp and no officer
 * identity — this is a defensible marketing claim they cannot match
 * without breaking their own SLA. Sits on the photograph so it is the
 * first thing read on a card.
 */
function VerifiedMark({
  verifiedAt,
  officer,
}: {
  verifiedAt: string | null;
  officer: string | null;
}) {
  // Compact age label: "just now" under a minute, then "Nh ago" / "Nd ago" /
  // "Nmo ago". Keeps the pill short enough to sit at the corner of a card.
  const ageLabel = verifiedAt ? shortAge(verifiedAt) : null;

  return (
    /*
     * A filled navy pill rather than gold on white. Gold text on a light ground
     * measures about 2.8:1 and disappears entirely over a bright photograph;
     * on navy it clears contrast requirements and reads as a struck seal.
     */
    <span
      className="inline-flex items-center gap-1.5 rounded-full bg-verify-ink px-2.5 py-1 shadow-sm ring-1 ring-white/10"
      title={
        verifiedAt
          ? `Verified ${new Date(verifiedAt).toLocaleString('en-IN')}${officer ? ` by officer ${officer}` : ''}`
          : 'Verified'
      }
    >
      <svg viewBox="0 0 16 16" aria-hidden="true" className="h-3 w-3 text-verify">
        <path
          className="draw-check"
          d="M2.5 8.5 6 12l7.5-8"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
      <span className="label text-verify">Verified</span>
      {ageLabel && (
        <>
          <span aria-hidden="true" className="label text-verify/40">·</span>
          <span className="label text-verify/85 tabular">{ageLabel}</span>
        </>
      )}
      {officer && (
        <>
          <span aria-hidden="true" className="label text-verify/40">·</span>
          <span className="label text-verify/85 tabular">{officer}</span>
        </>
      )}
    </span>
  );
}

/**
 * "Nh ago", "Nd ago", "Nmo ago" — compact enough for a pill corner.
 * Different from formatAge() (which is verbose: "3 days ago"); this one
 * has to fit on a card photograph without wrapping.
 */
function shortAge(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime();
  if (ms < 60_000) return 'just now';
  const minutes = Math.floor(ms / 60_000);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}d ago`;
  const months = Math.floor(days / 30);
  if (months < 12) return `${months}mo ago`;
  const years = Math.floor(months / 12);
  return `${years}y ago`;
}

export function ListingCardItem({
  listing,
  isSaved = false,
}: {
  listing: Listing;
  /**
   * Resolved once per page by the server rather than fetched per card, so a
   * 24-result grid makes one request for saved state instead of 24.
   */
  isSaved?: boolean;
}) {
  const cover = listing.photos[0];
  const perSqft = formatPerSqft(listing.pricePerSqft);
  const listedAge = formatAge(listing.firstListedAt);
  const isOwner = listing.listedBy.kind === 'OWNER';
  const isRent = listing.kind === 'RENT';

  // Rentals show monthly rent + deposit-in-months as the headline pricing;
  // sale price is not shown (would confuse — some markets quote as "5 Cr
  // property, ₹80k/month"). Falls back to sale price only if rent isn't set,
  // which shouldn't happen given API validation but is a display safeguard.
  const headlinePrice =
    isRent && listing.monthlyRent !== null
      ? `${formatRupeesShort(listing.monthlyRent)}/mo`
      : formatRupeesShort(listing.price);

  const depositLabel =
    isRent && listing.depositMonths !== null
      ? `${listing.depositMonths} mo deposit`
      : null;

  return (
    /* `relative` anchors the save button, which has to sit over the photo while
       living outside the Link — a button nested in an anchor navigates rather
       than acting when clicked. */
    <article className="group relative">
      <Link href={`/listings/${listing.id}`} className="block">
        {/* Photography leads. 4:3 is the ratio interior photographs are
            usually shot at, so it crops the least. */}
        <div className="relative aspect-[4/3] overflow-hidden rounded-card bg-canvas-deep shadow-card ring-1 ring-line transition-all duration-300 group-hover:shadow-lift group-hover:ring-action/25">
          {cover ? (
            /* eslint-disable-next-line @next/next/no-img-element */
            <img
              src={photoUrl(cover.url)}
              alt=""
              className="h-full w-full object-cover transition-transform duration-500 ease-out group-hover:scale-[1.04]"
              loading="lazy"
            />
          ) : (
            <div className="flex h-full items-center justify-center">
              <span className="label text-faint">Photographs coming</span>
            </div>
          )}

          {listing.isVerified && (
            <div className="absolute left-3 top-3">
              <VerifiedMark
                verifiedAt={listing.verifiedAt}
                officer={listing.verifiedByOfficer}
              />
            </div>
          )}

          {listing.photos.length > 1 && (
            <span className="absolute bottom-3 right-3 rounded-full bg-ink/55 px-2 py-0.5 text-[0.6875rem] font-medium text-white backdrop-blur-sm tabular">
              {listing.photos.length} photos
            </span>
          )}
        </div>

        <div className="pt-3.5">
          {/* Price is the largest thing on the card — it is what a buyer scans
              for first, and size contrast is what the previous design lacked. */}
          <div className="flex items-baseline justify-between gap-3">
            <p className="display text-[1.5rem] leading-none tabular text-action">
              {headlinePrice}
            </p>
            {/*
              Owner-direct is a selling point on a market buyers believe is
              broker-dominated, so it is a filled mark rather than grey text.
            */}
            <span
              className={`label rounded-full px-2 py-0.5 ${
                isOwner ? 'bg-verify-soft text-verify-ink' : 'text-faint'
              }`}
            >
              {isOwner ? 'Owner' : 'Agent'}
            </span>
          </div>

          <h3 className="mt-2 text-[1rem] font-semibold leading-snug text-ink">
            {listing.property.bedrooms} BHK in {listing.property.locality}
          </h3>

          <p className="mt-1 truncate text-[0.875rem] text-muted">
            {listing.property.address}
          </p>

          <div className="mt-2.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-[0.8125rem] text-muted">
            <span className="tabular">{formatArea(listing.property.areaSqft)}</span>
            {/* Sale cards show ₹/sqft; rentals show deposit-in-months instead,
                because a buyer of a rental cares about the up-front cash. */}
            {!isRent && perSqft && (
              <>
                <span aria-hidden="true" className="text-line">&middot;</span>
                <span className="tabular">{perSqft}</span>
              </>
            )}
            {isRent && depositLabel && (
              <>
                <span aria-hidden="true" className="text-line">&middot;</span>
                <span className="tabular">{depositLabel}</span>
              </>
            )}
            {listedAge && (
              <>
                <span aria-hidden="true" className="text-line">&middot;</span>
                {/* From the immutable firstListedAt, so re-approving or bumping
                    a listing cannot make it look new again. */}
                <span>Listed {listedAge}</span>
              </>
            )}
            {/* Zero-brokerage is a Square Yards parity signal — Owner + zero
                brokerage together is the strongest owner-direct rental
                filter available. Only shown when the listing actually
                carries it, to keep the row uncluttered. */}
            {listing.zeroBrokerage && (
              <>
                <span aria-hidden="true" className="text-line">&middot;</span>
                <span className="rounded-full bg-verify-soft px-1.5 py-0.5 text-[0.6875rem] font-semibold text-verify-ink">
                  Zero brokerage
                </span>
              </>
            )}
          </div>
        </div>
      </Link>

      {/* Both controls live outside the Link: a button or checkbox nested in an
          anchor navigates on click instead of acting. */}
      <div className="absolute right-3 top-3">
        <SaveButton listingId={listing.id} initiallySaved={isSaved} variant="overlay" />
      </div>

      <div className="mt-2.5">
        <CompareToggle listingId={listing.id} title={listing.title} />
      </div>
    </article>
  );
}

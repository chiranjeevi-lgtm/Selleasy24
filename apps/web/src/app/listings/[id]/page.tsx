import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { api, ApiError } from '@/lib/api';
import { Endorsement } from '@/components/endorsement';
import { EnquiryForm } from '@/components/enquiry-form';
import { PropertyFacts } from '@/components/property-facts';
import { SaveButton } from '@/components/save-button';
import { CompareToggle } from '@/components/compare-controls';
import { serverApi } from '@/lib/server-api';
import {
  formatAge,
  formatArea,
  formatBenchmark,
  formatDate,
  formatFullAddress,
  formatPerSqft,
  formatRupees,
  formatRupeesShort,
} from '@/lib/format';

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000';

function photoUrl(url: string): string {
  return url.startsWith('http') ? url : `${API_BASE}${url}`;
}

interface PageProps {
  params: Promise<{ id: string }>;
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { id } = await params;
  try {
    const listing = await api.listing(id);
    return {
      title: `${listing.property.bedrooms} BHK in ${listing.property.locality} — ${formatRupeesShort(listing.price)}`,
      description: listing.description.slice(0, 155),
    };
  } catch {
    return { title: 'Home' };
  }
}

export default async function ListingPage({ params }: PageProps) {
  const { id } = await params;

  let listing;
  try {
    listing = await api.listing(id);
  } catch (error) {
    if (error instanceof ApiError && error.status === 404) notFound();
    throw error;
  }

  const verification = await api.verification(id).catch(() => null);

  // Signed-out visitors get `false` — no session is a normal state on a public
  // page, so the failure is expected rather than exceptional.
  const isSaved = await serverApi
    .savedIds()
    .then((result) => result.ids.includes(id))
    .catch(() => false);

  const perSqft = formatPerSqft(listing.pricePerSqft);
  const benchmark = formatBenchmark(
    listing.localityBenchmark.differencePercent,
    listing.localityBenchmark.medianPricePerSqft,
    listing.property.locality,
  );
  const listedAge = formatAge(listing.firstListedAt);
  const isOwner = listing.listedBy.kind === 'OWNER';

  const reduction = listing.priceHistory.find(
    (e) => e.previousPrice !== null && e.previousPrice > e.price,
  );

  const [cover, ...rest] = listing.photos;

  return (
    <div className="mx-auto max-w-[76rem] px-5 py-6 sm:px-8">
      <nav aria-label="Breadcrumb" className="mb-5 text-[0.875rem]">
        <Link href="/" className="text-muted transition-colors hover:text-ink">
          Homes
        </Link>
        <span className="mx-2 text-faint" aria-hidden="true">/</span>
        <span className="text-ink">{listing.property.locality}</span>
      </nav>

      {/* Gallery leads the page — a buyer decides from photographs first. */}
      {cover && (
        <div className="grid gap-2 overflow-hidden rounded-card sm:grid-cols-[2fr_1fr] sm:gap-2">
          <div className="relative aspect-[4/3] overflow-hidden bg-canvas-deep sm:aspect-[3/2]">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={photoUrl(cover.url)} alt="" className="h-full w-full object-cover" />
          </div>

          {rest.length > 0 && (
            /*
              `min-h-0` plus absolutely-positioned images below: the left cell's
              aspect ratio is what should set the row height. If these images sit
              in normal flow they contribute their own intrinsic height instead,
              and the column runs visibly past the bottom of the cover photo.
            */
            <div className="hidden min-h-0 grid-rows-2 gap-2 sm:grid">
              {rest.slice(0, 2).map((photo, i) => (
                <div key={photo.id} className="relative min-h-0 overflow-hidden bg-canvas-deep">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={photoUrl(photo.url)} alt="" className="absolute inset-0 h-full w-full object-cover" loading="lazy" />
                  {i === 1 && rest.length > 2 && (
                    <span className="absolute bottom-3 right-3 rounded-full bg-ink/60 px-3 py-1 text-[0.75rem] font-medium text-white backdrop-blur-sm tabular">
                      +{rest.length - 2} more
                    </span>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      <div className="mt-8 grid gap-10 lg:grid-cols-[1fr_22rem]">
        {/* ---------------- Main ---------------- */}
        <div className="min-w-0">
          <h1 className="display text-[1.75rem] text-ink sm:text-[2.125rem]">
            {listing.title}
          </h1>
          <p className="mt-2.5 text-[0.9375rem] text-muted">
            {formatFullAddress(listing.property.address, listing.property.locality)} ·{' '}
            <span className="tabular">{listing.property.pincode}</span>
          </p>

          <div className="mt-5 flex flex-wrap items-center gap-3">
            <SaveButton listingId={listing.id} initiallySaved={isSaved} variant="button" />
            <CompareToggle listingId={listing.id} title={listing.title} variant="button" />
          </div>

          <dl className="mt-7 grid grid-cols-2 gap-x-6 gap-y-5 border-y border-line py-6 sm:grid-cols-4">
            {[
              { label: 'Configuration', value: `${listing.property.bedrooms} BHK` },
              { label: 'Built-up area', value: formatArea(listing.property.areaSqft) },
              { label: 'Bathrooms', value: String(listing.property.bathrooms) },
              {
                label: 'Year built',
                value: listing.property.yearBuilt ? String(listing.property.yearBuilt) : '—',
              },
            ].map((item) => (
              <div key={item.label}>
                <dt className="label text-faint">{item.label}</dt>
                <dd className="mt-1.5 text-[1.0625rem] font-semibold text-ink tabular">
                  {item.value}
                </dd>
              </div>
            ))}
          </dl>

          <section className="mt-8" aria-labelledby="about">
            <h2 id="about" className="display text-[1.25rem] text-ink">
              About this home
            </h2>
            <p className="mt-3 max-w-prose whitespace-pre-line text-[1rem] leading-[1.7] text-ink/85">
              {listing.description}
            </p>
          </section>

          <PropertyFacts property={listing.property} />

          <section className="mt-10 rounded-card border border-line px-5 py-5" aria-labelledby="report">
            <h2 id="report" className="text-[0.9375rem] font-semibold text-ink">
              Something wrong with this listing?
            </h2>
            <p className="mt-1.5 max-w-prose text-[0.875rem] leading-relaxed text-muted">
              If it has already sold or the details are wrong, tell us. You get a
              reference number and can check what we did about it.
            </p>
            <Link
              href={`/listings/${listing.id}/report`}
              className="mt-3.5 inline-block rounded-control border border-line px-4 py-2 text-[0.875rem] font-medium text-ink transition-colors hover:bg-canvas-deep"
            >
              Report this listing
            </Link>
          </section>
        </div>

        {/* ---------------- Sidebar ---------------- */}
        <aside className="lg:sticky lg:top-24 lg:self-start">
          <div className="rounded-card bg-surface px-5 py-5 shadow-card">
            <p className="display text-[2.125rem] leading-none text-ink tabular">
              {formatRupees(listing.price)}
            </p>

            <div className="mt-2.5 flex flex-wrap items-baseline gap-x-3 gap-y-1">
              {perSqft && <span className="text-[0.875rem] text-muted tabular">{perSqft}</span>}
              {listing.priceNegotiable && (
                <span className="label text-ink">Negotiable</span>
              )}
            </div>

            {/*
              The locality comparison. 99acres computes this and puts it behind a
              paywall; showing it plainly costs nothing and is exactly the
              transparency this platform sells.
            */}
            {benchmark && (
              <div className="mt-4 rounded-control bg-canvas px-3.5 py-3">
                <p className="text-[0.875rem] leading-snug text-ink">{benchmark}</p>
                <p className="mt-1 text-[0.75rem] text-faint">
                  From {listing.localityBenchmark.sampleSize} verified homes in{' '}
                  {listing.property.locality}
                </p>
              </div>
            )}

            {reduction && (
              <p className="mt-3 text-[0.875rem] text-seal">
                Reduced from{' '}
                <span className="tabular line-through">
                  {formatRupeesShort(reduction.previousPrice!)}
                </span>{' '}
                on {formatDate(reduction.changedAt)}
              </p>
            )}

            <dl className="mt-4 space-y-2 border-t border-line pt-4 text-[0.875rem]">
              <div className="flex justify-between gap-3">
                <dt className="text-muted">Listed by</dt>
                <dd className="text-right font-medium text-ink">
                  {listing.listedBy.name}
                  <span className="ml-1.5 font-normal text-muted">
                    {isOwner ? 'Owner' : 'Agent'}
                  </span>
                </dd>
              </div>
              {listedAge && (
                <div className="flex justify-between gap-3">
                  <dt className="text-muted">First listed</dt>
                  <dd className="font-medium text-ink">{listedAge}</dd>
                </div>
              )}
            </dl>
          </div>

          {verification && (
            <div className="mt-4">
              <Endorsement record={verification} />
            </div>
          )}

          <div className="mt-4">
            <EnquiryForm listingId={listing.id} sellerName={listing.listedBy.name} />
          </div>
        </aside>
      </div>
    </div>
  );
}

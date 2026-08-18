import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { ApiError } from '@/lib/api';
import { serverApi, type SavedList } from '@/lib/server-api';
import { SaveButton } from '@/components/save-button';
import { formatAge, formatArea, formatRupeesShort } from '@/lib/format';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Saved homes',
  description: 'The homes you have shortlisted.',
};

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000';

function photoUrl(url: string): string {
  return url.startsWith('http') ? url : `${API_BASE}${url}`;
}

export default async function SavedPage() {
  let data: SavedList;

  try {
    data = await serverApi.savedListings();
  } catch (error) {
    // The shortlist is tied to an account, so there is nothing to show a signed
    // out visitor. Sent to sign in with a return path rather than an error page.
    if (error instanceof ApiError && (error.status === 401 || error.status === 403)) {
      redirect('/login?next=/saved');
    }
    throw error;
  }

  const items = data.items;

  return (
    <div className="mx-auto max-w-[76rem] px-5 py-8 sm:px-8">
      <nav aria-label="Breadcrumb" className="mb-5 text-[0.875rem]">
        <Link href="/" className="text-muted transition-colors hover:text-ink">
          Homes
        </Link>
        <span className="mx-2 text-faint" aria-hidden="true">/</span>
        <span className="text-ink">Saved</span>
      </nav>

      <h1 className="display text-[1.75rem] text-ink sm:text-[2.125rem]">Saved homes</h1>
      <p className="mt-2 max-w-prose text-[0.9375rem] text-muted">
        {items.length === 0
          ? 'Nothing here yet.'
          : `${items.length} ${items.length === 1 ? 'home' : 'homes'} on your shortlist. We tell you here if one is taken off the market.`}
      </p>

      {items.length === 0 ? (
        /* An empty screen is an invitation to act, not an apology. */
        <div className="mt-8 rounded-card border border-dashed border-line bg-surface px-6 py-16 text-center">
          <p className="text-[1.0625rem] font-medium text-ink">
            Shortlist the homes you are considering
          </p>
          <p className="mx-auto mt-2 max-w-sm text-[0.9375rem] leading-relaxed text-muted">
            Press Save on any home and it will be here on every device you sign
            in from — useful when you are comparing over a few weeks.
          </p>
          <Link
            href="/"
            className="mt-6 inline-block rounded-control bg-action px-5 py-2.5 text-[0.9375rem] font-semibold text-white transition-colors hover:bg-action-hover"
          >
            Browse homes
          </Link>
        </div>
      ) : (
        <ul className="mt-8 grid gap-x-6 gap-y-10 sm:grid-cols-2 lg:grid-cols-3">
          {items.map((item) => {
            const listing = item.listing;
            const cover = listing.photos[0];

            return (
              <li key={listing.id}>
                <article className={item.isAvailable ? '' : 'opacity-75'}>
                  <Link href={`/listings/${listing.id}`} className="block">
                    <div className="relative aspect-[4/3] overflow-hidden rounded-card bg-canvas-deep shadow-card">
                      {cover ? (
                        /* eslint-disable-next-line @next/next/no-img-element */
                        <img
                          src={photoUrl(cover.url)}
                          alt=""
                          className={`h-full w-full object-cover ${
                            // Desaturated rather than hidden: the buyer still
                            // needs to recognise which home it was.
                            item.isAvailable ? '' : 'grayscale'
                          }`}
                          loading="lazy"
                        />
                      ) : null}

                      {!item.isAvailable && (
                        <span className="absolute left-3 top-3 rounded-full bg-ink/80 px-2.5 py-1 text-[0.6875rem] font-semibold uppercase tracking-wider text-white backdrop-blur-sm">
                          No longer available
                        </span>
                      )}
                    </div>

                    <div className="pt-3.5">
                      <p className="display text-[1.5rem] leading-none tabular">
                        {formatRupeesShort(listing.price)}
                      </p>
                      <h2 className="mt-2 text-[1rem] font-semibold leading-snug text-ink">
                        {listing.property.bedrooms} BHK in {listing.property.locality}
                      </h2>
                      <p className="mt-1 truncate text-[0.875rem] text-muted">
                        {listing.property.address}
                      </p>
                      <p className="mt-2.5 text-[0.8125rem] text-muted tabular">
                        {formatArea(listing.property.areaSqft)}
                        {formatAge(item.savedAt) && (
                          <>
                            <span aria-hidden="true" className="mx-2 text-line">&middot;</span>
                            <span>Saved {formatAge(item.savedAt)}</span>
                          </>
                        )}
                      </p>
                    </div>
                  </Link>

                  {item.unavailableReason && (
                    <p className="mt-2.5 rounded-card border-l-2 border-seal bg-seal-soft px-3 py-2 text-[0.8125rem] text-ink">
                      {item.unavailableReason}
                    </p>
                  )}

                  <div className="mt-2.5">
                    <SaveButton listingId={listing.id} initiallySaved />
                  </div>
                </article>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

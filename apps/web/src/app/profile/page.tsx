import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { ApiError } from '@/lib/api';
import {
  serverApi,
  type CurrentUser,
  type MyReferralsResponse,
  type SavedList,
} from '@/lib/server-api';
import { formatArea, formatRupeesShort } from '@/lib/format';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = {
  title: 'Your profile',
  description:
    'Your SellEasy24 account — saved homes, saved searches, site visits and referral code, all in one place.',
};

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000';

function photoUrl(url: string): string {
  return url.startsWith('http') ? url : `${API_BASE}${url}`;
}

function firstName(fullName: string): string {
  return fullName.trim().split(/\s+/)[0] ?? 'You';
}

/**
 * User profile — the signed-in buyer's home.
 *
 * Consolidates the surfaces that were scattered across /saved,
 * /saved-searches, /visits and /refer. Saved properties render inline
 * as a grid (up to 6) with a "See all" link to the full /saved page.
 * The other surfaces stay as separate destinations, linked from a
 * "Quick links" strip; ripping their content into this page would make
 * one long scroll where a summary lives more comfortably.
 */
export default async function ProfilePage() {
  // Everything fetched in parallel so the profile page doesn't wait for
  // the slowest single call. Every branch fails soft — a missing referral
  // code or an errored saved-searches endpoint should not blank the
  // whole page.
  let user: CurrentUser | null = null;
  try {
    user = await serverApi.me();
  } catch (error) {
    if (error instanceof ApiError && (error.status === 401 || error.status === 403)) {
      redirect('/login?next=/profile');
    }
    throw error;
  }

  if (!user) {
    redirect('/login?next=/profile');
  }

  const [saved, savedSearches, myReferrals, referralCode] = await Promise.all([
    serverApi.savedListings().catch((): SavedList => ({ items: [] })),
    serverApi
      .mySavedSearches()
      .then((r) => r.items)
      .catch(() => []),
    serverApi.myReferrals().catch((): MyReferralsResponse => ({
      items: [],
      counts: { total: 0, pending: 0, qualified: 0, paid: 0 },
      rewards: { pendingRupees: 0, paidRupees: 0 },
    })),
    serverApi.myReferralCode().catch(() => null),
  ]);

  const savedItems = saved.items;

  return (
    <div className="mx-auto max-w-[76rem] px-5 py-10 sm:px-8 sm:py-14">
      <header className="max-w-2xl">
        <span aria-hidden="true" className="mb-3 block h-[3px] w-10 bg-verify" />
        <p className="label text-verify-ink">Your profile</p>
        <h1 className="mt-3 display text-[2rem] text-ink sm:text-[2.5rem]">
          Hi, {firstName(user.fullName)}
        </h1>
        <p className="mt-3 text-[0.9375rem] text-muted">
          {user.email}
          {user.role !== 'BUYER' && (
            <span className="ml-2 inline-block rounded-full bg-verify-soft px-2 py-0.5 text-[0.6875rem] font-semibold uppercase tracking-[0.08em] text-verify-ink">
              {user.role.toLowerCase().replace('_', ' ')}
            </span>
          )}
        </p>
      </header>

      {/* Quick-links strip — the four adjacent surfaces linked in one row */}
      <nav
        aria-label="Account areas"
        className="mt-8 grid gap-3 sm:grid-cols-2 lg:grid-cols-4"
      >
        <Link
          href="/saved"
          className="group rounded-card border border-line bg-surface p-4 transition-all duration-200 hover:-translate-y-0.5 hover:shadow-lift hover:ring-1 hover:ring-verify/25"
        >
          <p className="label text-verify">Saved</p>
          <p className="mt-2 display text-[1.5rem] tabular text-ink">{saved.items.length}</p>
          <p className="mt-0.5 text-[0.75rem] text-muted">Shortlisted homes</p>
        </Link>
        <Link
          href="/saved-searches"
          className="group rounded-card border border-line bg-surface p-4 transition-all duration-200 hover:-translate-y-0.5 hover:shadow-lift hover:ring-1 hover:ring-verify/25"
        >
          <p className="label text-verify">Searches</p>
          <p className="mt-2 display text-[1.5rem] tabular text-ink">{savedSearches.length}</p>
          <p className="mt-0.5 text-[0.75rem] text-muted">Saved filter sets</p>
        </Link>
        <Link
          href="/visits"
          className="group rounded-card border border-line bg-surface p-4 transition-all duration-200 hover:-translate-y-0.5 hover:shadow-lift hover:ring-1 hover:ring-verify/25"
        >
          <p className="label text-verify">Visits</p>
          <p className="mt-2 display text-[1.5rem] tabular text-ink">—</p>
          <p className="mt-0.5 text-[0.75rem] text-muted">Site-visit requests</p>
        </Link>
        <Link
          href="/refer"
          className="group rounded-card border border-line bg-surface p-4 transition-all duration-200 hover:-translate-y-0.5 hover:shadow-lift hover:ring-1 hover:ring-verify/25"
        >
          <p className="label text-verify">Referrals</p>
          <p className="mt-2 display text-[1.5rem] tabular text-ink">{myReferrals.counts.total}</p>
          <p className="mt-0.5 text-[0.75rem] text-muted">
            {referralCode ? `Code: ${referralCode.code}` : 'Get your code'}
          </p>
        </Link>
      </nav>

      {/* Saved properties — every shortlisted home rendered inline on the
          profile so this is the one place a buyer needs to look. The
          separate /saved page still exists as a direct URL. */}
      <section className="mt-12" aria-labelledby="saved-heading">
        <div className="flex flex-wrap items-baseline justify-between gap-3">
          <div>
            <span aria-hidden="true" className="mb-3 block h-[3px] w-10 bg-verify" />
            <h2 id="saved-heading" className="display text-[1.5rem] text-ink">
              Saved homes
            </h2>
            <p className="mt-1 text-[0.9375rem] text-muted">
              {savedItems.length === 0
                ? 'Shortlist homes with the Save button — they land here.'
                : `${savedItems.length} ${savedItems.length === 1 ? 'home' : 'homes'} on your shortlist. We flag any that come off the market.`}
            </p>
          </div>
        </div>

        {savedItems.length === 0 ? (
          <div className="mt-6 rounded-card border border-dashed border-line bg-surface px-6 py-14 text-center">
            <p className="text-[1rem] font-medium text-ink">Nothing saved yet</p>
            <p className="mx-auto mt-2 max-w-md text-[0.9375rem] leading-relaxed text-muted">
              Press <strong>Save</strong> on any home while browsing — it stays
              with you across devices when you sign in.
            </p>
            <Link
              href="/"
              className="mt-6 inline-block rounded-control bg-action px-5 py-2.5 text-[0.9375rem] font-semibold text-white transition-colors hover:bg-action-hover"
            >
              Browse verified homes
            </Link>
          </div>
        ) : (
          <ul className="mt-6 grid gap-x-6 gap-y-8 sm:grid-cols-2 lg:grid-cols-3">
            {savedItems.map((item) => {
              const listing = item.listing;
              const cover = listing.photos[0];
              return (
                <li key={listing.id}>
                  <Link
                    href={`/listings/${listing.id}`}
                    className={`block ${item.isAvailable ? '' : 'opacity-75'}`}
                  >
                    <div className="relative aspect-[4/3] overflow-hidden rounded-card bg-canvas-deep shadow-card">
                      {cover && (
                        /* eslint-disable-next-line @next/next/no-img-element */
                        <img
                          src={photoUrl(cover.url)}
                          alt=""
                          className={`h-full w-full object-cover transition-transform duration-300 hover:scale-[1.03] ${
                            item.isAvailable ? '' : 'grayscale'
                          }`}
                          loading="lazy"
                        />
                      )}
                      {!item.isAvailable && (
                        <span className="absolute left-3 top-3 rounded-full bg-ink/80 px-2.5 py-1 text-[0.6875rem] font-semibold uppercase tracking-wider text-white backdrop-blur-sm">
                          No longer available
                        </span>
                      )}
                    </div>
                    <div className="pt-3">
                      <p className="display text-[1.375rem] leading-none tabular">
                        {formatRupeesShort(listing.price)}
                      </p>
                      <p className="mt-2 text-[0.9375rem] font-semibold leading-snug text-ink">
                        {listing.property.bedrooms} BHK in {listing.property.locality}
                      </p>
                      <p className="mt-1 truncate text-[0.8125rem] text-muted">
                        {listing.property.address}
                      </p>
                      <p className="mt-1.5 text-[0.75rem] tabular text-faint">
                        {formatArea(listing.property.areaSqft)}
                      </p>
                      {item.unavailableReason && (
                        <p className="mt-2 rounded-control border-l-2 border-seal bg-seal-soft px-3 py-1.5 text-[0.75rem] text-ink">
                          {item.unavailableReason}
                        </p>
                      )}
                    </div>
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </div>
  );
}

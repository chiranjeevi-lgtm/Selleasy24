import Link from 'next/link';
import { redirect } from 'next/navigation';
import { ApiError } from '@/lib/api';
import { serverApi, type CurrentUser } from '@/lib/server-api';
import { signOut } from '../(auth)/actions';

/**
 * The selling shell — owners, agents and builders alike.
 *
 * One area rather than a separate console per kind of seller. A builder's
 * shell was previously its own near-identical copy of this file, and every
 * cross-cutting feature — enquiries, visits, performance — would have had to be
 * built twice and then kept in step. What actually differs between them is
 * which inventory they manage, which is one nav entry, not a second application.
 *
 * Middleware already redirects unauthenticated requests, but this layout
 * re-checks by actually calling the API. Middleware only sees whether a cookie
 * exists; the API is the only thing that knows whether the session is still
 * valid and whether this user is allowed to sell.
 */

/** Accounts that may reach this area at all. */
const SELLING_ROLES = ['OWNER', 'BROKER', 'BUILDER'] as const;

function accountLabel(user: CurrentUser): string {
  if (user.role === 'BUILDER') return 'Developer account';
  return user.sellerKind === 'BROKER' ? 'Agent account' : 'Owner account';
}

export default async function SellerLayout({ children }: { children: React.ReactNode }) {
  let user: CurrentUser;
  try {
    user = await serverApi.me();
  } catch (error) {
    if (error instanceof ApiError && (error.status === 401 || error.status === 403)) {
      redirect('/login?next=/seller/listings');
    }
    throw error;
  }

  const canSell = (SELLING_ROLES as readonly string[]).includes(user.role);
  const isBuilder = user.role === 'BUILDER';

  if (!canSell) {
    return (
      <div className="mx-auto max-w-lg px-5 py-16">
        <h1 className="font-display text-[1.5rem] font-extrabold tracking-tight text-ink">
          This area is for sellers
        </h1>
        <p className="mt-3 text-[0.875rem] leading-relaxed text-muted">
          Your account is set up for buying. To list a property, contact us and we
          will switch your account over.
        </p>
        <Link
          href="/"
          className="mt-5 inline-block rounded-control border border-action px-4 py-2 text-[0.875rem] text-action transition-colors hover:bg-action hover:text-surface"
        >
          Back to search
        </Link>
      </div>
    );
  }

  /*
   * Tabs follow what the account can actually do, not what the area contains.
   *
   * A builder has projects; an owner or agent has listings. Only the enquiry
   * inbox is genuinely shared — it takes both kinds, which is what the
   * polymorphic lead makes possible.
   *
   * Performance and Visits are listing-only today: the stats endpoint is scoped
   * to listings, and a visit request points at one. Offering a builder those
   * tabs would hand them a page the API refuses to serve.
   */
  const tabs = isBuilder
    ? [
        { href: '/seller/projects', label: 'Projects' },
        { href: '/seller/leads', label: 'Enquiries' },
      ]
    : [
        { href: '/seller/listings', label: 'Listings' },
        { href: '/seller/performance', label: 'Performance' },
        { href: '/seller/leads', label: 'Enquiries' },
        { href: '/seller/visits', label: 'Visits' },
      ];

  return (
    <div className="mx-auto max-w-5xl px-5 py-8">
      <div className="flex flex-wrap items-baseline justify-between gap-4 border-b border-line pb-4">
        <div>
          <p className="label text-faint">{accountLabel(user)}</p>
          {/* For a builder this is the trading name — what a buyer recognises
              and what appears on the RERA register. */}
          <h1 className="mt-1 font-display text-[1.5rem] font-extrabold leading-none tracking-tight text-ink">
            {user.fullName}
          </h1>
        </div>

        <nav className="flex flex-wrap items-center gap-1 text-[0.8125rem]">
          {tabs.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className="px-2.5 py-1.5 text-muted transition-colors hover:text-ink"
            >
              {item.label}
            </Link>
          ))}
          <form action={signOut}>
            <button
              type="submit"
              className="px-2.5 py-1.5 text-muted transition-colors hover:text-ink"
            >
              Sign out
            </button>
          </form>
        </nav>
      </div>

      {/*
        Nothing can be submitted for review without a verified number, and the
        API rejects it at submit time. Saying so here — before a long form — is
        the difference between a hint and a dead end.
      */}
      {!user.phone ? (
        <div className="mt-5 rounded-control border-l-2 border-seal bg-seal-soft px-3.5 py-3">
          <p className="text-[0.8125rem] leading-relaxed text-ink">
            Add a phone number to your profile before submitting{' '}
            {isBuilder ? 'a project' : 'a listing'}. Buyers reach you on that
            number, so we cannot publish without it.
          </p>
        </div>
      ) : (
        !user.isPhoneVerified && (
          <div className="mt-5 rounded-control border-l-2 border-seal bg-seal-soft px-3.5 py-3">
            <p className="text-[0.8125rem] leading-relaxed text-ink">
              Verify your phone number before submitting{' '}
              {isBuilder ? 'a project' : 'a listing'}.{' '}
              <Link href="/seller/phone" className="font-medium underline underline-offset-2">
                Verify it now
              </Link>
              .
            </p>
          </div>
        )
      )}

      <div className="mt-7">{children}</div>
    </div>
  );
}

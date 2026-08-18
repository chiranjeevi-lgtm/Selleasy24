import Link from 'next/link';
import { redirect } from 'next/navigation';
import { ApiError } from '@/lib/api';
import { serverApi, type CurrentUser } from '@/lib/server-api';
import { signOut } from '../(auth)/actions';

/**
 * Seller shell.
 *
 * Middleware already redirects unauthenticated requests, but this layout
 * re-checks by actually calling the API. Middleware only sees whether a cookie
 * exists; the API is the only thing that knows whether the session is still valid
 * and whether this user is allowed to sell.
 */
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

  const canSell = user.role === 'OWNER' || user.role === 'BROKER';

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
          className="mt-5 inline-block border border-action px-4 py-2 text-[0.875rem] text-action transition-colors hover:bg-action hover:text-surface"
        >
          Back to search
        </Link>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-5xl px-5 py-8">
      <div className="flex flex-wrap items-baseline justify-between gap-4 border-b border-line pb-4">
        <div>
          <p className="stamp-label text-faint">
            {user.sellerKind === 'BROKER' ? 'Agent account' : 'Owner account'}
          </p>
          <h1 className="mt-1 font-display text-[1.5rem] font-extrabold leading-none tracking-tight text-ink">
            {user.fullName}
          </h1>
        </div>

        <nav className="flex items-center gap-1 text-[0.8125rem]">
          <Link
            href="/seller/listings"
            className="px-2.5 py-1.5 text-muted transition-colors hover:text-ink"
          >
            Listings
          </Link>
          <Link
            href="/seller/leads"
            className="px-2.5 py-1.5 text-muted transition-colors hover:text-ink"
          >
            Enquiries
          </Link>
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
        A seller cannot submit a listing without a phone number, and the API
        rejects it at submit time. Saying so here — before they fill in a long
        form — is the difference between a hint and a dead end.
      */}
      {!user.phone && (
        <div className="mt-5 border-l-2 border-seal bg-seal-soft px-3.5 py-3">
          <p className="text-[0.8125rem] leading-relaxed text-ink">
            Add a phone number to your profile before submitting a listing. Buyers
            reach you on that number, so we cannot publish without it.
          </p>
        </div>
      )}

      <div className="mt-7">{children}</div>
    </div>
  );
}

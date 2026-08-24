import type { Metadata } from 'next';
import Link from 'next/link';

export const metadata: Metadata = {
  title: 'Confirm your email',
  robots: { index: false, follow: false },
};

export const dynamic = 'force-dynamic';

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000';

interface PageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

type Outcome = 'verified' | 'expired' | 'missing' | 'unreachable';

/**
 * Confirms the address from the link in the registration email.
 *
 * Done on the server as the page renders rather than behind a button. The token
 * is single-use and already in the URL — putting a "confirm" button in front of
 * it would add a step that protects nothing, and anyone who did not click it
 * would be left unverified for no reason.
 */
async function confirm(token: string): Promise<Outcome> {
  if (!token) {
    return 'missing';
  }

  try {
    const response = await fetch(`${API_BASE}/api/auth/verify-email`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token }),
      cache: 'no-store',
    });

    // Every rejection collapses to one outcome. Whether the token was expired,
    // already used or never real is not something the page needs to
    // distinguish, and the remedy is identical.
    return response.ok ? 'verified' : 'expired';
  } catch {
    return 'unreachable';
  }
}

export default async function VerifyEmailPage({ searchParams }: PageProps) {
  const params = await searchParams;
  const raw = params.token;
  const token = (Array.isArray(raw) ? raw[0] : raw) ?? '';

  const outcome = await confirm(token);

  const content: Record<Outcome, { title: string; body: string; cta: string; href: string }> = {
    verified: {
      title: 'Email confirmed',
      body: 'Thank you — your address is confirmed. You can sign in and carry on.',
      cta: 'Sign in',
      href: '/login',
    },
    expired: {
      title: 'This link has expired',
      body: 'Confirmation links are short-lived, and each one works only once. Sign in and we will send you a fresh one.',
      cta: 'Sign in',
      href: '/login',
    },
    missing: {
      title: 'This link is incomplete',
      body: 'The link seems to have been cut short — some email apps do that to long links. Try opening it again in full.',
      cta: 'Sign in',
      href: '/login',
    },
    unreachable: {
      title: 'We could not reach the server',
      body: 'Nothing is wrong with your link. Try again in a moment.',
      cta: 'Try again',
      href: `/verify-email?token=${encodeURIComponent(token)}`,
    },
  };

  const { title, body, cta, href } = content[outcome];
  const ok = outcome === 'verified';

  return (
    <div className="mx-auto max-w-sm px-5 py-16">
      <div className="rounded-card border border-line bg-surface p-6">
        <div className="flex items-start gap-3">
          <span
            aria-hidden="true"
            className={`mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-[0.8125rem] ${
              ok ? 'bg-action text-white' : 'bg-canvas-deep text-muted'
            }`}
          >
            {ok ? '✓' : '!'}
          </span>
          <div>
            <h1 className="text-[1.0625rem] font-semibold text-ink">{title}</h1>
            <p className="mt-1.5 text-[0.9375rem] leading-relaxed text-muted">{body}</p>
            <Link
              href={href}
              className="mt-4 inline-block rounded-control bg-action px-5 py-2.5 text-[0.9375rem] font-semibold text-white transition-colors hover:bg-action-hover"
            >
              {cta}
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}

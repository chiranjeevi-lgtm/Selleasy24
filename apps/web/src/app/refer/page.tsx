import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { ApiError } from '@/lib/api';
import { serverApi, type MyReferralsResponse } from '@/lib/server-api';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = {
  title: 'Refer a friend',
  description:
    'Share your code with friends. When they sign up on SellEasy24 and complete their first verified action, you both earn a reward.',
};

const STATUS_LABEL: Record<MyReferralsResponse['items'][number]['status'], string> = {
  PENDING: 'Pending',
  QUALIFIED: 'Qualified',
  PAID: 'Paid',
  VOIDED: 'Voided',
};

const STATUS_STYLE: Record<MyReferralsResponse['items'][number]['status'], string> = {
  PENDING: 'bg-canvas-deep text-muted',
  QUALIFIED: 'bg-verify-soft text-verify-ink',
  PAID: 'bg-verify text-verify-ink',
  VOIDED: 'bg-seal-soft text-seal',
};

function formatDate(iso: string): string {
  const d = new Date(iso);
  return `${d.getDate()} ${d.toLocaleString('en-IN', { month: 'short' })} ${d.getFullYear()}`;
}

export default async function ReferPage() {
  let code: { code: string };
  let referrals: MyReferralsResponse;
  try {
    [code, referrals] = await Promise.all([
      serverApi.myReferralCode(),
      serverApi.myReferrals(),
    ]);
  } catch (error) {
    if (error instanceof ApiError && (error.status === 401 || error.status === 403)) {
      redirect('/login?next=/refer');
    }
    throw error;
  }

  // Shareable link — pre-fills the referral field on signup (the field
  // itself is a follow-up; the link works today by embedding ?ref=<code>
  // in the URL that the future signup form will read).
  const shareUrl = `https://selleasy24.com/register?ref=${code.code}`;
  const whatsAppText = `Check out SellEasy24 — verified homes in Hyderabad. Use my code ${code.code} when you sign up: ${shareUrl}`;
  const whatsAppHref = `https://wa.me/?text=${encodeURIComponent(whatsAppText)}`;

  return (
    <div className="mx-auto max-w-[64rem] px-5 py-12 sm:px-8 sm:py-16">
      <header className="max-w-2xl">
        <span aria-hidden="true" className="mb-3 block h-[3px] w-10 bg-verify" />
        <h1 className="display text-[2.25rem] text-ink sm:text-[3rem]">
          Refer a friend, earn together
        </h1>
        <p className="mt-5 text-[1.0625rem] leading-relaxed text-muted">
          Share your referral code with friends looking to buy, rent, or
          list a property in Hyderabad. When they sign up and complete
          their first verified action, both of you earn a reward.
        </p>
      </header>

      <section
        aria-labelledby="code-heading"
        className="mt-10 rounded-card bg-action p-8 text-white sm:p-10"
      >
        <p id="code-heading" className="label text-verify">
          Your referral code
        </p>
        <p className="mt-3 tabular display text-[3rem] tracking-[0.2em] text-verify sm:text-[3.5rem]">
          {code.code}
        </p>
        <p className="mt-2 text-[0.875rem] text-white/70">
          Same code, always. Share it anywhere.
        </p>

        <div className="mt-6 flex flex-wrap items-center gap-3">
          <a
            href={whatsAppHref}
            target="_blank"
            rel="noopener noreferrer"
            className="rounded-control bg-verify px-4 py-2 text-[0.875rem] font-semibold text-verify-ink transition-transform duration-200 hover:-translate-y-px"
          >
            Share on WhatsApp
          </a>
          <a
            href={`mailto:?subject=Check%20out%20SellEasy24&body=${encodeURIComponent(whatsAppText)}`}
            className="rounded-control border border-white/30 px-4 py-2 text-[0.875rem] font-medium text-white transition-colors hover:bg-white/10"
          >
            Share by email
          </a>
        </div>

        <div className="mt-4 border-t border-white/10 pt-4">
          <p className="text-[0.75rem] uppercase tracking-[0.08em] text-white/50">
            Shareable link
          </p>
          <p className="mt-1 font-mono text-[0.8125rem] text-white/80">
            {shareUrl}
          </p>
        </div>
      </section>

      {/* Rewards summary — only rendered when the caller has actually earned
          something, so a brand-new referrer sees the "How it works" section
          first instead of a row of zeros that would read as "the program
          isn't working for me". Sums cover rewards earned as both the
          referrer AND the referred side. */}
      {(referrals.rewards.pendingRupees > 0 || referrals.rewards.paidRupees > 0) && (
        <section
          aria-labelledby="rewards-heading"
          className="mt-8 grid gap-4 sm:grid-cols-2"
        >
          <div className="rounded-card bg-surface p-6 shadow-card ring-1 ring-line">
            <p id="rewards-heading" className="label text-verify">
              Earned so far
            </p>
            <p className="mt-2 display text-[2rem] tabular text-ink">
              ₹{referrals.rewards.paidRupees.toLocaleString('en-IN')}
            </p>
            <p className="mt-1 text-[0.8125rem] text-muted">
              Credited across every referral that has been paid out.
            </p>
          </div>
          <div className="rounded-card bg-verify-soft p-6 ring-1 ring-verify/30">
            <p className="label text-verify-ink">Pending review</p>
            <p className="mt-2 display text-[2rem] tabular text-verify-ink">
              ₹{referrals.rewards.pendingRupees.toLocaleString('en-IN')}
            </p>
            <p className="mt-1 text-[0.8125rem] text-verify-ink/80">
              Qualifying event completed; awaiting admin payout batch.
            </p>
          </div>
        </section>
      )}

      <section aria-labelledby="how-heading" className="mt-16">
        <span aria-hidden="true" className="mb-3 block h-[3px] w-10 bg-verify" />
        <h2 id="how-heading" className="display text-[1.5rem] text-ink">
          How rewards work
        </h2>
        <ol className="mt-6 space-y-4">
          <li className="flex gap-4 rounded-card bg-surface p-5 shadow-card ring-1 ring-line">
            <span className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-action text-[0.8125rem] font-semibold text-white">
              1
            </span>
            <div>
              <p className="text-[1rem] font-semibold text-ink">Share your code</p>
              <p className="mt-1 text-[0.9375rem] leading-relaxed text-muted">
                WhatsApp, SMS, email — anywhere. The link above pre-fills
                the code on the signup page.
              </p>
            </div>
          </li>
          <li className="flex gap-4 rounded-card bg-surface p-5 shadow-card ring-1 ring-line">
            <span className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-action text-[0.8125rem] font-semibold text-white">
              2
            </span>
            <div>
              <p className="text-[1rem] font-semibold text-ink">Your friend signs up</p>
              <p className="mt-1 text-[0.9375rem] leading-relaxed text-muted">
                They create their SellEasy24 account and enter your code
                during registration. The referral is captured immediately;
                it starts as <strong>Pending</strong>.
              </p>
            </div>
          </li>
          <li className="flex gap-4 rounded-card bg-surface p-5 shadow-card ring-1 ring-line">
            <span className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-action text-[0.8125rem] font-semibold text-white">
              3
            </span>
            <div>
              <p className="text-[1rem] font-semibold text-ink">
                They complete their first verified action
              </p>
              <p className="mt-1 text-[0.9375rem] leading-relaxed text-muted">
                For buyers — first site visit request. For sellers — first
                listing verified. That&rsquo;s when it moves to{' '}
                <strong>Qualified</strong>.
              </p>
            </div>
          </li>
          <li className="flex gap-4 rounded-card bg-surface p-5 shadow-card ring-1 ring-line">
            <span className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-action text-[0.8125rem] font-semibold text-white">
              4
            </span>
            <div>
              <p className="text-[1rem] font-semibold text-ink">
                Both of you get the reward
              </p>
              <p className="mt-1 text-[0.9375rem] leading-relaxed text-muted">
                Reward structure is finalised at launch — likely a Featured
                listing credit for sellers, and a discounted valuation report
                for buyers. Referral moves to <strong>Paid</strong> once
                credited.
              </p>
            </div>
          </li>
        </ol>
      </section>

      <section aria-labelledby="mine-heading" className="mt-16">
        <span aria-hidden="true" className="mb-3 block h-[3px] w-10 bg-verify" />
        <h2 id="mine-heading" className="display text-[1.5rem] text-ink">
          Your referrals
        </h2>
        <p className="mt-1.5 text-[0.9375rem] text-muted">
          {referrals.counts.total} total — {referrals.counts.pending} pending,{' '}
          {referrals.counts.qualified} qualified, {referrals.counts.paid} paid
        </p>

        {referrals.items.length === 0 ? (
          <div className="mt-6 rounded-card border border-dashed border-line bg-surface px-6 py-12 text-center">
            <p className="text-[1rem] font-medium text-ink">No referrals yet</p>
            <p className="mx-auto mt-2 max-w-md text-[0.9375rem] leading-relaxed text-muted">
              Share your code with the WhatsApp button above. Every friend
              who signs up with it appears here.
            </p>
          </div>
        ) : (
          <ul className="mt-6 divide-y divide-line-soft rounded-card border border-line bg-surface">
            {referrals.items.map((r) => (
              <li
                key={r.id}
                className="flex items-baseline justify-between gap-4 px-5 py-4"
              >
                <div>
                  <p className="text-[0.9375rem] font-medium text-ink">
                    {r.referredFirstName}
                  </p>
                  <p className="mt-0.5 text-[0.75rem] text-faint">
                    Joined {formatDate(r.createdAt)}
                    {r.qualifiedAt && ` · Qualified ${formatDate(r.qualifiedAt)}`}
                  </p>
                </div>
                <span
                  className={`rounded-full px-2.5 py-0.5 text-[0.6875rem] font-semibold uppercase tracking-[0.08em] ${STATUS_STYLE[r.status]}`}
                >
                  {STATUS_LABEL[r.status]}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section
        aria-labelledby="close-heading"
        className="mt-16 rounded-card bg-verify-soft p-8 ring-1 ring-verify/25"
      >
        <p className="label text-verify-ink">Fine print</p>
        <h2 id="close-heading" className="mt-3 display text-[1.25rem] text-ink">
          Rewards, in writing
        </h2>
        <ul className="mt-4 space-y-2 text-[0.9375rem] text-ink/85">
          <li>Self-referrals don&rsquo;t count — the same account cannot both refer and redeem.</li>
          <li>Each new account can redeem at most one referral code, ever.</li>
          <li>Reward payment happens after the referred user completes a qualifying action, not at signup.</li>
          <li>Fraud (fake accounts, cash-back schemes, code trading) voids the referral and the account.</li>
        </ul>
        <div className="mt-6">
          <Link
            href="/"
            className="inline-block rounded-control bg-action px-5 py-2.5 text-[0.9375rem] font-semibold text-white transition-colors hover:bg-action-hover"
          >
            Browse SellEasy24
          </Link>
        </div>
      </section>
    </div>
  );
}

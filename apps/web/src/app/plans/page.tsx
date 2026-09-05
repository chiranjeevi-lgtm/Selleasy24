import type { Metadata } from 'next';
import Link from 'next/link';

export const metadata: Metadata = {
  title: 'Listing plans · Free and Featured tiers for property sellers',
  description:
    'Two ways to list on SellEasy24 — a free tier that reaches every verified-only buyer, and a Featured tier that puts you at the top of search results.',
};

/**
 * Owner plans page.
 *
 * The revenue-side companion to /seller/listings. Featured is real inventory
 * placement, not a badge-for-badge's-sake: sellers on Featured show up in the
 * top three search positions for their locality + configuration, get an
 * enquiry-priority indicator on the moderator dashboard, and keep the listing
 * live for six months instead of three.
 *
 * No payment integration wired yet — the CTA routes into the existing seller
 * flow. When Razorpay is in (Phase 6), the upgrade button will flip to a
 * checkout without changing this page's copy.
 */

interface PlanRow {
  label: string;
  free: string | boolean;
  featured: string | boolean;
}

const COMPARISON: PlanRow[] = [
  { label: 'Listing duration', free: '3 months', featured: '6 months' },
  { label: 'Unlimited listings', free: true, featured: true },
  { label: 'Human verification before publish', free: true, featured: true },
  { label: 'Fraud-report handling', free: true, featured: true },
  { label: 'Buyer enquiries forwarded to you', free: true, featured: true },
  { label: 'Position in search results', free: 'Standard', featured: 'Top of locality' },
  { label: 'Featured badge on card', free: false, featured: true },
  { label: 'Enquiry priority for buyers', free: false, featured: true },
  { label: 'Ranked in the recommendations strip', free: false, featured: true },
  { label: 'Photo re-shoot support (once per listing)', free: false, featured: true },
];

function Check({ on }: { on: boolean }) {
  return on ? (
    <svg viewBox="0 0 16 16" aria-label="Included" className="h-4 w-4 text-verify">
      <path
        d="M3 8.5 6.5 12 13 4.5"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  ) : (
    <svg viewBox="0 0 16 16" aria-label="Not included" className="h-4 w-4 text-faint">
      <path d="M4 12 12 4M4 4l8 8" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
    </svg>
  );
}

function Cell({ value }: { value: string | boolean }) {
  if (typeof value === 'boolean') {
    return (
      <div className="flex items-center justify-center">
        <Check on={value} />
      </div>
    );
  }
  return <span className="text-[0.9375rem] text-ink">{value}</span>;
}

export default function PlansPage() {
  return (
    <div className="mx-auto max-w-[64rem] px-5 py-12 sm:px-8 sm:py-16">
      <header className="max-w-2xl">
        <span aria-hidden="true" className="mb-3 block h-[3px] w-10 bg-verify" />
        <h1 className="display text-[2.25rem] text-ink sm:text-[3rem]">
          Two ways to list. Same verification.
        </h1>
        <p className="mt-5 text-[1.0625rem] leading-relaxed text-muted">
          Every listing on SellEasy24 — free or Featured — goes through the
          same officer-reviewed verification before it appears. Featured is
          about reach: putting the listing at the top of search results for
          the buyers most likely to close.
        </p>
      </header>

      <section aria-label="Plan comparison" className="mt-12 grid gap-6 lg:grid-cols-2">
        <article className="flex flex-col rounded-card bg-surface p-8 shadow-card ring-1 ring-line">
          <p className="label text-faint">Free</p>
          <p className="mt-6 text-[0.9375rem] leading-relaxed text-muted">
            Everything you need to sell a home on SellEasy24. Verified,
            searchable, and forwarded to every buyer who asks. Listing stays
            live for three months; extend it any time before it expires.
          </p>
          <Link
            href="/seller/listings"
            className="mt-8 self-start rounded-control border border-line bg-surface px-5 py-2.5 text-[0.9375rem] font-medium text-ink transition-colors hover:border-muted"
          >
            List for free
          </Link>
        </article>

        <article className="relative flex flex-col rounded-card bg-action p-8 text-white shadow-lift ring-1 ring-verify/40">
          <span
            aria-hidden="true"
            className="absolute -top-3 right-6 rounded-full bg-verify px-3 py-1 text-[0.6875rem] font-semibold uppercase tracking-[0.14em] text-verify-ink"
          >
            Featured
          </span>
          <p className="label text-verify">Featured</p>
          <p className="mt-6 text-[0.9375rem] leading-relaxed text-white/80">
            Top-of-locality placement, an enquiry-priority mark, and a slot in
            the recommendations strip on the home page. For homes where the
            first two weeks matter and standing out from thirty similar
            listings makes the difference.
          </p>
          <Link
            href="/seller/listings"
            className="mt-8 self-start rounded-control bg-verify px-5 py-2.5 text-[0.9375rem] font-semibold text-verify-ink transition-transform duration-200 hover:-translate-y-px"
          >
            Upgrade a listing
          </Link>
        </article>
      </section>

      <section aria-label="Detailed comparison" className="mt-16">
        <span aria-hidden="true" className="mb-3 block h-[3px] w-10 bg-verify" />
        <h2 className="display text-[1.5rem] text-ink">What each plan includes</h2>

        <div className="mt-6 overflow-hidden rounded-card border border-line">
          <table className="w-full">
            <thead className="bg-canvas-deep">
              <tr>
                <th scope="col" className="px-5 py-4 text-left text-[0.75rem] font-semibold uppercase tracking-[0.1em] text-muted">
                  Feature
                </th>
                <th scope="col" className="px-5 py-4 text-center text-[0.75rem] font-semibold uppercase tracking-[0.1em] text-muted">
                  Free
                </th>
                <th scope="col" className="px-5 py-4 text-center text-[0.75rem] font-semibold uppercase tracking-[0.1em] text-muted">
                  Featured
                </th>
              </tr>
            </thead>
            <tbody className="bg-surface">
              {COMPARISON.map((row, index) => (
                <tr
                  key={row.label}
                  className={index === 0 ? '' : 'border-t border-line-soft'}
                >
                  <th scope="row" className="px-5 py-3.5 text-left text-[0.9375rem] font-medium text-ink">
                    {row.label}
                  </th>
                  <td className="px-5 py-3.5 text-center">
                    <Cell value={row.free} />
                  </td>
                  <td className="px-5 py-3.5 text-center">
                    <Cell value={row.featured} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section
        aria-labelledby="commitment-heading"
        className="mt-16 rounded-card bg-verify-soft p-8 ring-1 ring-verify/25 sm:p-10"
      >
        <p className="label text-verify-ink">Our commitment</p>
        <h2 id="commitment-heading" className="mt-3 display text-[1.5rem] text-ink">
          Every discount or refund promise, in writing
        </h2>
        <p className="mt-4 text-[0.9375rem] leading-relaxed text-ink/85">
          If a representative offers you a cashback, discount, or refund
          window on Featured, it is captured as a signed PDF in your account
          before it takes effect. Verbal promises are not enforceable — for
          your protection, not ours. If it is not on paper, it is not real.
        </p>
      </section>

      <section aria-labelledby="faq-heading" className="mt-16">
        <span aria-hidden="true" className="mb-3 block h-[3px] w-10 bg-verify" />
        <h2 id="faq-heading" className="display text-[1.5rem] text-ink">Common questions</h2>

        <dl className="mt-6 divide-y divide-line-soft">
          {[
            {
              q: 'Does Featured skip verification?',
              a: 'No. Verification is the whole point of the site — no listing skips it. Featured decides placement after verification passes, not before.',
            },
            {
              q: 'What happens after six months?',
              a: 'The Featured slot ends and the listing continues on the Free tier for the remainder of its listing period. You can renew Featured at any time.',
            },
            {
              q: 'Can I move a listing between tiers?',
              a: 'Yes, at any time. Upgrading is prorated from the day you upgrade. Downgrading takes effect at the end of the current Featured period.',
            },
            {
              q: 'How is my payment handled?',
              a: 'All Featured payments flow through Razorpay to a company account. We never accept payment to personal accounts. Every invoice is downloadable from your dashboard for GST purposes.',
            },
          ].map((item) => (
            <div key={item.q} className="py-5">
              <dt className="text-[1rem] font-semibold text-ink">{item.q}</dt>
              <dd className="mt-2 text-[0.9375rem] leading-relaxed text-muted">{item.a}</dd>
            </div>
          ))}
        </dl>
      </section>
    </div>
  );
}

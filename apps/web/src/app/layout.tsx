import type { Metadata } from 'next';
import { Bricolage_Grotesque, Public_Sans } from 'next/font/google';
import Link from 'next/link';
import { CompareBar } from '@/components/compare-controls';
import './globals.css';

const bricolage = Bricolage_Grotesque({
  subsets: ['latin'],
  variable: '--font-bricolage',
  display: 'swap',
  weight: ['500', '600', '700', '800'],
});

/**
 * Public Sans for body and labels — a typeface commissioned for government
 * public-service use. On a product about official land records, that lineage is
 * the reason for the choice.
 */
const publicSans = Public_Sans({
  subsets: ['latin'],
  variable: '--font-public-sans',
  display: 'swap',
});

export const metadata: Metadata = {
  title: {
    default: 'SellEasy24 — verified homes in Telangana',
    template: '%s · SellEasy24',
  },
  description:
    'Every home on SellEasy24 is checked against its ownership documents by a person before it appears. See exactly what was verified, and on what date.',
};

function Header() {
  return (
    /*
      Navy, not paper. The header is the one element on every page, so it is
      where the brand has to live — a near-white bar with dark text reads as an
      unstyled document rather than a product.
    */
    <header className="sticky top-0 z-40 bg-action text-white shadow-[0_1px_0_rgb(255_255_255/0.08)]">
      <div className="mx-auto flex max-w-[76rem] items-center justify-between gap-6 px-5 py-3.5 sm:px-8">
        <Link href="/" className="group flex items-baseline gap-2.5">
          <span className="display text-[1.1875rem] text-white">SellEasy24</span>
          <span className="hidden label text-verify/90 sm:inline">Hyderabad</span>
        </Link>

        {/*
          The text links are hidden below `md` deliberately. Nothing in this row
          wraps or shrinks, so it overflows and widens the document once the
          content no longer fits: logo + three links + the button measure roughly
          570px, which cleared 600px at `sm` but not with a fourth link added.
          Rather than dropping a destination, the reveal moved up a breakpoint.
          Every link stays reachable below it from the footer.
        */}
        <nav className="flex items-center gap-1 text-[0.875rem]">
          {[
            { href: '/', label: 'Buy' },
            { href: '/projects', label: 'New projects' },
            { href: '/saved', label: 'Saved' },
            { href: '/seller/listings', label: 'List your property' },
          ].map((item) => (
            <Link
              key={item.href}
              href={item.href}
              /* Gold underline grows from the left on hover — the accent doing
                 quiet work rather than sitting only on the badge. */
              className="group relative hidden rounded-control px-3 py-2 text-white/75 transition-colors hover:text-white md:inline-flex"
            >
              {item.label}
              <span
                aria-hidden="true"
                className="absolute inset-x-3 bottom-1 h-px origin-left scale-x-0 bg-verify transition-transform duration-300 group-hover:scale-x-100"
              />
            </Link>
          ))}
          <Link
            href="/login"
            className="ml-2 rounded-control bg-verify px-4 py-2 font-semibold text-verify-ink transition-transform duration-200 hover:-translate-y-px hover:bg-verify/90"
          >
            Sign in
          </Link>
        </nav>
      </div>
    </header>
  );
}

function Footer() {
  return (
    /*
      Deep navy, so the page ends on something solid rather than fading into the
      same paper it started on. The gold rule at the top is the accent's third
      and last appearance: badge, header hover, and here.
    */
    <footer className="mt-24 bg-action text-white">
      <div aria-hidden="true" className="h-[3px] bg-verify" />

      <div className="mx-auto max-w-[76rem] px-5 py-14 sm:px-8">
        <div className="grid gap-10 sm:grid-cols-2 lg:grid-cols-[1.4fr_1fr_1fr]">
          <div className="max-w-md">
            <p className="display text-[1.25rem] text-white">SellEasy24</p>
            <p className="mt-3 text-[0.9375rem] leading-relaxed text-white/70">
              Residential property in Telangana. Nothing appears here until a
              verification officer has compared the seller&rsquo;s ownership
              documents against the listing.
            </p>
            {/* The operating company. Named here rather than in the header, so
                the site people arrive at matches the domain they typed. */}
            <p className="mt-5 text-[0.8125rem] text-white/45">A Kamala Infra company</p>
          </div>

          <div>
            <p className="label text-verify">Our promise</p>
            <p className="mt-3 text-[0.9375rem] leading-relaxed text-white/70">
              Your phone number goes to the one seller you contact. We never pass
              it to other sellers, agents, or anyone else.
            </p>
          </div>

          {/* Carries the links the header drops on small screens, so the seller
              path is never unreachable on a phone. */}
          <nav className="text-[0.9375rem]" aria-label="Footer">
            <p className="label text-verify">Go to</p>
            <ul className="mt-3 space-y-2.5">
              {[
                { href: '/', label: 'Buy a home' },
                { href: '/projects', label: 'New projects' },
                { href: '/saved', label: 'Saved homes' },
                { href: '/visits', label: 'Your visits' },
                { href: '/seller/listings', label: 'List your property' },
                { href: '/login', label: 'Sign in' },
              ].map((item) => (
                <li key={item.href}>
                  <Link
                    href={item.href}
                    className="text-white/70 underline-offset-4 transition-colors hover:text-verify hover:underline"
                  >
                    {item.label}
                  </Link>
                </li>
              ))}
            </ul>
          </nav>
        </div>
      </div>
    </footer>
  );
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en-IN" className={`${bricolage.variable} ${publicSans.variable}`}>
      <body className="min-h-screen">
        <a
          href="#main"
          className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-50 focus:rounded-control focus:bg-surface focus:px-4 focus:py-2.5 focus:text-ink focus:shadow-float"
        >
          Skip to content
        </a>
        <Header />
        <main id="main">{children}</main>
        <Footer />
        {/* Fixed to the viewport, so it belongs at the document level rather
            than inside any one page. Renders nothing when nothing is picked. */}
        <CompareBar />
      </body>
    </html>
  );
}

import Link from 'next/link';

/**
 * Site footer.
 *
 * Reorganised from the flat "Go to" list into four categorised columns —
 * Buy / Sell / Tools & Insights / Content & Trust. The flat list grew past
 * ten items during Phase 1 and 2 and stopped being scannable; grouping by
 * intent restores the footer's role as the mobile navigation layer
 * (the header collapses below `md`).
 *
 * The brand + promise columns from the previous footer stay, on the left
 * — the operating-company disclosure and the phone-number-privacy promise
 * are both trust surfaces we don't want to lose.
 */

interface FooterLink {
  href: string;
  label: string;
}

interface FooterColumn {
  heading: string;
  links: FooterLink[];
}

const COLUMNS: FooterColumn[] = [
  {
    heading: 'Buy & rent',
    links: [
      { href: '/', label: 'Verified homes' },
      { href: '/projects', label: 'New projects' },
      { href: '/builders', label: 'Builders' },
      { href: '/rent', label: 'Rent a home' },
      { href: '/map', label: 'Map view' },
      { href: '/nearby', label: 'Near me' },
    ],
  },
  {
    heading: 'Sell',
    links: [
      { href: '/sell', label: 'Sell your property' },
      { href: '/seller/listings', label: 'Create a listing' },
      { href: '/plans', label: 'Listing plans' },
      { href: '/tools/valuation', label: 'Estimate your value' },
      { href: '/become-an-agent', label: 'Become an agent' },
    ],
  },
  {
    heading: 'Tools & guides',
    links: [
      { href: '/tools/valuation', label: 'Property valuation' },
      { href: '/tools/emi-calculator', label: 'EMI calculator' },
      { href: '/localities', label: 'Locality guides' },
      { href: '/blog', label: 'Notes & guides' },
    ],
  },
  {
    heading: 'Account & trust',
    links: [
      { href: '/saved', label: 'Saved homes' },
      { href: '/saved-searches', label: 'Saved searches' },
      { href: '/visits', label: 'Your visits' },
      { href: '/refer', label: 'Refer a friend' },
      { href: '/login', label: 'Sign in' },
      { href: '/fraud-help', label: 'Report fraud' },
    ],
  },
];

export function SiteFooter() {
  return (
    <footer className="mt-24 bg-action text-white">
      <div aria-hidden="true" className="h-[3px] bg-verify" />

      <div className="mx-auto max-w-[76rem] px-5 py-14 sm:px-8">
        <div className="grid gap-10 sm:grid-cols-2 lg:grid-cols-[1.4fr_1fr_1fr_1fr_1fr]">
          <div className="max-w-md">
            <p className="display text-[1.25rem] text-white">SellEasy24</p>
            <p className="mt-3 text-[0.9375rem] leading-relaxed text-white/70">
              Residential property in Telangana. Nothing appears here until a
              verification officer has compared the seller&rsquo;s ownership
              documents against the listing.
            </p>
            <p className="mt-5 text-[0.8125rem] text-white/45">
              A Kamala Infra company
            </p>

            {/*
              The old "Our promise" column, kept but tucked into the brand
              column since the phone-privacy commitment lives thematically
              with the brand copy rather than under any of the four
              categories to the right.
            */}
            <p className="mt-6 label text-verify">Our promise</p>
            <p className="mt-2 text-[0.875rem] leading-relaxed text-white/70">
              Your phone number goes to the one seller you contact. We never
              pass it to other sellers, agents, or anyone else.
            </p>
          </div>

          {COLUMNS.map((column) => (
            <nav key={column.heading} className="text-[0.9375rem]" aria-label={column.heading}>
              <p className="label text-verify">{column.heading}</p>
              <ul className="mt-3 space-y-2.5">
                {column.links.map((link) => (
                  <li key={link.href}>
                    <Link
                      href={link.href}
                      className="text-white/70 underline-offset-4 transition-colors hover:text-verify hover:underline"
                    >
                      {link.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </nav>
          ))}
        </div>
      </div>
    </footer>
  );
}

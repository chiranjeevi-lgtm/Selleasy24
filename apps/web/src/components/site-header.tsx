import Link from 'next/link';
import { signOut } from '@/app/(auth)/actions';
import { ApiError } from '@/lib/api';
import { serverApi, type CurrentUser } from '@/lib/server-api';

/**
 * Site header.
 *
 * Grouped into five dropdowns (Buy / Rent / Tools / Localities / Blog) so
 * the flat nav that grew across Phase 1 doesn't overflow into two rows.
 * Matches Square Yards' pattern of collapsing a large surface into a
 * handful of top-level categories.
 *
 * Dropdowns use pure CSS (`group-hover` + `group-focus-within`) rather than
 * JavaScript — the whole header stays a server component, works without JS
 * for keyboard/tap users, and doesn't add a single byte to the client
 * bundle. Trade-off: no click-outside-to-close on desktop, but hover-out
 * closes naturally and the mobile fallback uses focus-within.
 *
 * Below `md` the group nav collapses entirely — the header shows only
 * logo + Sell + Sign in. Full navigation lives in the footer on phones,
 * which is a deliberate reuse of the same pattern the original Header
 * used before Phase 2 grew the nav.
 *
 * Signed-in state: fetches `serverApi.me()` at request time and swaps the
 * "Sign in" button for a small user chip + Sign-out form. Sign-out is a
 * server action rather than a client fetch so a user without JS can still
 * end their session; the form posts, the cookie clears, redirect fires.
 */

interface NavItem {
  href: string;
  label: string;
  description?: string;
}

interface NavGroup {
  label: string;
  items: NavItem[];
}

const NAV_GROUPS: NavGroup[] = [
  {
    label: 'Buy',
    items: [
      { href: '/', label: 'Verified homes', description: 'Every home checked before it appears' },
      { href: '/projects', label: 'New projects', description: 'Under-construction and ready-to-move builder projects' },
      { href: '/builders', label: 'Builders', description: 'Every developer with a project on SellEasy24' },
    ],
  },
  {
    label: 'Tools',
    items: [
      { href: '/tools/valuation', label: 'Property valuation', description: 'Estimate a home\'s value from verified comparables' },
      { href: '/tools/emi-calculator', label: 'EMI calculator', description: 'Plan your loan — monthly EMI + eligibility' },
      { href: '/map', label: 'Map view', description: 'Interactive Hyderabad map with locality inventory' },
      { href: '/nearby', label: 'Near me', description: 'Homes closest to where you are right now' },
    ],
  },
];

const SIMPLE_LINKS: NavItem[] = [
  { href: '/rent', label: 'Rent' },
  { href: '/localities', label: 'Localities' },
  { href: '/blog', label: 'Blog' },
  { href: '/become-an-agent', label: 'Become an agent' },
];

function ChevronDown() {
  return (
    <svg
      viewBox="0 0 12 12"
      aria-hidden="true"
      className="h-2.5 w-2.5 transition-transform group-hover:rotate-180 group-focus-within:rotate-180"
    >
      <path
        d="M1.5 4 6 8.5 10.5 4"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function DropdownGroup({ group }: { group: NavGroup }) {
  return (
    <div className="group relative">
      <button
        type="button"
        aria-haspopup="true"
        className="inline-flex items-center gap-1 rounded-control px-3 py-2 text-[0.875rem] text-white/75 transition-colors hover:text-white group-focus-within:text-white"
      >
        <span>{group.label}</span>
        <ChevronDown />
      </button>

      {/*
        The dropdown sits absolutely below the trigger. `pt-2` inside the
        wrapper gives the mouse a corridor between button and panel so a
        diagonal drift toward the first item doesn't close the menu.
      */}
      <div
        role="menu"
        aria-label={group.label}
        className="invisible absolute left-0 top-full z-50 pt-2 opacity-0 transition-opacity duration-150 group-hover:visible group-hover:opacity-100 group-focus-within:visible group-focus-within:opacity-100"
      >
        <div className="w-72 rounded-card bg-surface p-2 shadow-float ring-1 ring-line">
          {group.items.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              role="menuitem"
              className="block rounded-control px-4 py-3 transition-colors hover:bg-canvas-deep"
            >
              <span className="block text-[0.9375rem] font-semibold text-ink">{item.label}</span>
              {item.description && (
                <span className="mt-0.5 block text-[0.8125rem] leading-snug text-muted">
                  {item.description}
                </span>
              )}
            </Link>
          ))}
        </div>
      </div>
    </div>
  );
}

/**
 * Where a signed-in user's account chip should route on click.
 *
 * Buyer / other → the buyer's saved-homes surface. Owner / broker → their
 * seller inventory. Builder → their projects. Staff (verifier, admin,
 * moderator) go to the admin console at /admin.
 *
 * Matches the same role-based landing decision used by the sign-in flow
 * (see /apps/web/src/app/(auth)/actions.ts::safeRedirectTarget). Keeping
 * both in sync manually because two roles + a small file is cheaper than
 * a shared helper for now.
 */
function accountHrefFor(role: string): string {
  if (role === 'BUILDER') return '/seller/projects';
  if (role === 'OWNER' || role === 'BROKER') return '/seller/listings';
  // FIELD_AGENT lands on their own status page (pending / active /
  // suspended). AGENT_APPLICANT has no other capability yet, so also here.
  if (role === 'FIELD_AGENT' || role === 'AGENT_APPLICANT') return '/agent/status';
  if (role === 'VERIFIER' || role === 'ADMIN' || role === 'SUPER_ADMIN' || role === 'MODERATOR') {
    return '/admin';
  }
  // Buyer default — the profile hub aggregates saved homes, saved
  // searches, visits and referrals. Direct link to /saved was the
  // pre-profile behaviour and is preserved as one of the tiles inside.
  return '/profile';
}

function firstName(fullName: string): string {
  return fullName.trim().split(/\s+/)[0] ?? 'You';
}

export async function SiteHeader() {
  // Auth state is looked up at request time. Failures (401 = signed out,
  // network = API down) fall through to the signed-out header rather than
  // 500-ing the page — the header must render for everyone.
  let user: CurrentUser | null = null;
  try {
    user = await serverApi.me();
  } catch (error) {
    if (!(error instanceof ApiError)) {
      // Network / DNS failure — log for visibility, render signed-out.
      // A signed-in header when the API is unreachable would look worse
      // than a signed-out one (buttons that do nothing on click).
    }
    user = null;
  }

  return (
    <header className="sticky top-0 z-[1000] bg-action text-white shadow-[0_1px_0_rgb(255_255_255/0.08)]">
      <div className="mx-auto flex max-w-[76rem] items-center justify-between gap-4 px-5 py-3.5 sm:px-8">
        <Link href="/" className="group flex items-baseline gap-2.5">
          <span className="display text-[1.1875rem] text-white">SellEasy24</span>
          <span className="hidden label text-verify/90 sm:inline">Hyderabad</span>
        </Link>

        <nav className="hidden items-center gap-1 text-[0.875rem] md:flex" aria-label="Primary">
          {NAV_GROUPS.map((group) => (
            <DropdownGroup key={group.label} group={group} />
          ))}
          {SIMPLE_LINKS.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              className="group relative rounded-control px-3 py-2 text-white/75 transition-colors hover:text-white"
            >
              {link.label}
              <span
                aria-hidden="true"
                className="absolute inset-x-3 bottom-1 h-px origin-left scale-x-0 bg-verify transition-transform duration-300 group-hover:scale-x-100"
              />
            </Link>
          ))}
        </nav>

        <div className="flex items-center gap-2">
          {user ? (
            <>
              {/*
                Account chip — role-aware landing page. Displays "Hi, Rahul"
                on desktop; collapses to just the initial on very narrow
                widths so the row doesn't overflow.
              */}
              <Link
                href={accountHrefFor(user.role)}
                className="inline-flex items-center gap-2 rounded-control border border-white/25 px-3 py-2 text-[0.875rem] font-medium text-white transition-colors hover:bg-white/10"
                title={`Signed in as ${user.email} (${user.role})`}
              >
                <span
                  aria-hidden="true"
                  className="grid h-6 w-6 shrink-0 place-items-center rounded-full bg-verify text-[0.75rem] font-semibold text-verify-ink"
                >
                  {firstName(user.fullName).charAt(0).toUpperCase()}
                </span>
                <span className="hidden sm:inline">Hi, {firstName(user.fullName)}</span>
              </Link>

              {/*
                Sign-out is a form + server action rather than a client fetch
                — a session end must work even without JS, and preserving
                the server-action pattern avoids a second auth surface.
              */}
              <form action={signOut}>
                <button
                  type="submit"
                  className="rounded-control bg-verify px-4 py-2 text-[0.875rem] font-semibold text-verify-ink transition-transform duration-200 hover:-translate-y-px hover:bg-verify/90"
                >
                  Sign out
                </button>
              </form>
            </>
          ) : (
            <>
              <Link
                href="/seller/listings"
                className="hidden rounded-control border border-white/30 px-4 py-2 text-[0.875rem] font-medium text-white transition-colors hover:bg-white/10 sm:inline-block"
              >
                Sell
              </Link>
              <Link
                href="/login"
                className="rounded-control bg-verify px-4 py-2 text-[0.875rem] font-semibold text-verify-ink transition-transform duration-200 hover:-translate-y-px hover:bg-verify/90"
              >
                Sign in
              </Link>
            </>
          )}
        </div>
      </div>
    </header>
  );
}

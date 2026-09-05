import type { Metadata } from 'next';
import { Bricolage_Grotesque, Public_Sans } from 'next/font/google';
import { CompareBar } from '@/components/compare-controls';
import { PWARegister } from '@/components/pwa-register';
import { PWAInstallPrompt } from '@/components/pwa-install-prompt';
import { SiteFooter } from '@/components/site-footer';
import { SiteHeader } from '@/components/site-header';
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

/**
 * Header and Footer live in their own components since Phase 2 —
 * the flat nav that grew across Phase 1 became a two-line surface on
 * desktop and an eleven-item list in the footer. Grouping into categorized
 * dropdowns + a four-column footer restored the site to something you can
 * scan. See components/site-header.tsx and components/site-footer.tsx for
 * the actual structure.
 */
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
        <SiteHeader />
        <main id="main">{children}</main>
        <SiteFooter />
        {/* Fixed to the viewport, so it belongs at the document level rather
            than inside any one page. Renders nothing when nothing is picked. */}
        <CompareBar />
        {/* PWA plumbing — the register mounts a service worker for offline
            shell caching; the prompt intercepts the browser's install banner
            so the ask matches the site rather than the browser chrome. */}
        <PWARegister />
        <PWAInstallPrompt />
      </body>
    </html>
  );
}

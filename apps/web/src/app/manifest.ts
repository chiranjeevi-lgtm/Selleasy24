import type { MetadataRoute } from 'next';

/**
 * PWA manifest.
 *
 * Next.js serves this file at /manifest.webmanifest automatically and links
 * to it from every page's <head>. No layout changes needed — the browser
 * picks it up on its own and, on Chrome/Edge/Android, shows the install
 * affordance in the address bar once the site is served over HTTPS.
 *
 * The colours mirror the design tokens in globals.css so the OS chrome
 * (splash screen, task-switcher tint) reads as the site rather than as a
 * generic web view.
 */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'SellEasy24 — verified homes in Telangana',
    short_name: 'SellEasy24',
    description:
      'Every home on SellEasy24 is checked against its ownership documents by a person before it appears.',
    id: '/',
    start_url: '/',
    scope: '/',
    display: 'standalone',
    orientation: 'portrait',
    theme_color: '#16324f',
    background_color: '#f7f6f3',
    lang: 'en-IN',
    dir: 'ltr',
    categories: ['business', 'lifestyle', 'shopping'],
    icons: [
      {
        src: '/icon.svg',
        sizes: 'any',
        type: 'image/svg+xml',
        purpose: 'any',
      },
      {
        src: '/icon-maskable.svg',
        sizes: 'any',
        type: 'image/svg+xml',
        purpose: 'maskable',
      },
    ],
    shortcuts: [
      {
        name: 'Saved homes',
        short_name: 'Saved',
        description: 'Homes you have shortlisted',
        url: '/saved',
      },
      {
        name: 'New projects',
        short_name: 'Projects',
        description: 'Browse new construction',
        url: '/projects',
      },
      {
        name: 'List your property',
        short_name: 'Sell',
        description: 'Put your home on the market',
        url: '/seller/listings',
      },
    ],
  };
}

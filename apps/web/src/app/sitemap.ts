import type { MetadataRoute } from 'next';
import { KNOWN_LOCALITIES, localitySlug } from '@/lib/hyderabad-localities';
import { posts } from './blog/posts';

/**
 * Sitemap.
 *
 * Next.js serves this automatically at /sitemap.xml. Static evaluation at
 * build time is intentional — sitemaps that require a database round-trip
 * per crawl are how sites end up rate-limited by their own search-engine
 * traffic.
 *
 * Priorities are relative signals to crawlers, not commitments; the
 * homepage sits at 1.0 as the site's anchor, and the SEO-templated
 * locality / rate pages get 0.7 because they are where organic traffic
 * is expected to land.
 */

const SITE_URL =
  process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/$/, '') ?? 'https://selleasy24.com';

export default function sitemap(): MetadataRoute.Sitemap {
  const now = new Date();

  const staticRoutes: MetadataRoute.Sitemap = [
    { url: SITE_URL, lastModified: now, changeFrequency: 'daily', priority: 1.0 },
    { url: `${SITE_URL}/rent`, lastModified: now, changeFrequency: 'weekly', priority: 0.7 },
    { url: `${SITE_URL}/projects`, lastModified: now, changeFrequency: 'daily', priority: 0.9 },
    { url: `${SITE_URL}/builders`, lastModified: now, changeFrequency: 'weekly', priority: 0.7 },
    { url: `${SITE_URL}/localities`, lastModified: now, changeFrequency: 'weekly', priority: 0.8 },
    { url: `${SITE_URL}/tools/emi-calculator`, lastModified: now, changeFrequency: 'monthly', priority: 0.6 },
    { url: `${SITE_URL}/tools/valuation`, lastModified: now, changeFrequency: 'monthly', priority: 0.7 },
    { url: `${SITE_URL}/map`, lastModified: now, changeFrequency: 'daily', priority: 0.6 },
    { url: `${SITE_URL}/nearby`, lastModified: now, changeFrequency: 'monthly', priority: 0.4 },
    { url: `${SITE_URL}/blog`, lastModified: now, changeFrequency: 'weekly', priority: 0.6 },
    { url: `${SITE_URL}/plans`, lastModified: now, changeFrequency: 'monthly', priority: 0.5 },
    { url: `${SITE_URL}/fraud-help`, lastModified: now, changeFrequency: 'monthly', priority: 0.5 },
  ];

  const localityRoutes: MetadataRoute.Sitemap = KNOWN_LOCALITIES.flatMap((locality) => {
    const slug = localitySlug(locality.name);
    return [
      {
        url: `${SITE_URL}/localities/${slug}`,
        lastModified: now,
        changeFrequency: 'weekly' as const,
        priority: 0.7,
      },
      {
        url: `${SITE_URL}/property-rates/${slug}`,
        lastModified: now,
        changeFrequency: 'weekly' as const,
        priority: 0.7,
      },
    ];
  });

  const blogRoutes: MetadataRoute.Sitemap = posts.map((post) => ({
    url: `${SITE_URL}/blog/${post.slug}`,
    lastModified: new Date(post.publishedAt),
    changeFrequency: 'monthly' as const,
    priority: 0.5,
  }));

  return [...staticRoutes, ...localityRoutes, ...blogRoutes];
}

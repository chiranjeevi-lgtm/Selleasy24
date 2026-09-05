import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { api, type Locality, type ProjectCard } from '@/lib/api';
import { LocalityReviews } from '@/components/locality-reviews';
import { ProjectCardItem } from '@/components/project-card';
import {
  KNOWN_LOCALITIES,
  distanceKm,
  findLocalityBySlug,
  localitySlug,
} from '@/lib/hyderabad-localities';
import { localityContent } from '@/lib/locality-content';
import { jsonLdScript, localityPlaceLd } from '@/lib/structured-data';

export const dynamic = 'force-dynamic';

interface PageProps {
  params: Promise<{ slug: string }>;
}

/**
 * Locality overview page.
 *
 * The template is the same for every locality; the density of the render
 * scales with what data is available. A locality with hand-seeded editorial
 * gets a full essay treatment; one without still gets a functional page
 * (name, projects, rate, "browse inventory" CTA). Nothing renders as
 * "coming soon" if the section is meaningful without editorial.
 *
 * Data flow:
 *   1. Curated coordinates + name from KNOWN_LOCALITIES (via slug lookup)
 *   2. Median rate + neighborhoodId from the Locality API (matched by name)
 *   3. Top projects from the projects API (locality param)
 *   4. Editorial from locality-content.ts (may be undefined)
 *
 * Everything failing soft: an API error swallows into an empty state,
 * because a locality page half-rendered is still useful; a locality page
 * that errors out is worthless.
 */

function formatRate(value: string | number | null | undefined): string | null {
  if (value === null || value === undefined) return null;
  const n = typeof value === 'string' ? Number(value) : value;
  if (!Number.isFinite(n) || n <= 0) return null;
  return `₹${Math.round(n).toLocaleString('en-IN')}`;
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { slug } = await params;
  const locality = findLocalityBySlug(slug);
  if (!locality) return { title: 'Locality not found' };
  const content = localityContent(slug);
  return {
    title: `${locality.name}, Hyderabad · Price trends, projects, buyer guide`,
    description:
      content?.positioning?.slice(0, 155) ??
      `${locality.name} in Hyderabad — verified home inventory, price rates, connectivity, and buyer guidance.`,
  };
}

export default async function LocalityOverviewPage({ params }: PageProps) {
  const { slug } = await params;
  const locality = findLocalityBySlug(slug);
  if (!locality) notFound();

  const [apiLocalities, projectResults] = await Promise.all([
    api.localities('Hyderabad').catch((): Locality[] => []),
    api
      .searchProjects({ locality: locality.name, limit: '12' })
      .catch(() => ({ total: 0, items: [] as ProjectCard[], limit: 12, offset: 0 })),
  ]);

  const apiMatch = apiLocalities.find(
    (l) => l.name.toLowerCase() === locality.name.toLowerCase(),
  );
  const rateNumber = formatRate(apiMatch?.medianPricePerSqft);
  const sampleSize = apiMatch?.medianSampleSize ?? null;

  const content = localityContent(slug);
  const projects = projectResults.items;

  // Five nearest curated localities by Haversine distance, dropping the
  // current one. Gives the buyer a lateral browse option on the same page.
  const nearby = KNOWN_LOCALITIES.filter((l) => l.name !== locality.name)
    .map((l) => ({ ...l, km: distanceKm(locality, l) }))
    .sort((a, b) => a.km - b.km)
    .slice(0, 5);

  return (
    <div className="mx-auto max-w-[76rem] px-5 py-8 sm:px-8">
      {/* Place schema — declares this locality with its coordinates and the
          Hyderabad parent. Editorial positioning fills the description when
          hand-seeded content exists, otherwise the tag is still valid and
          helps crawlers link locality pages together. */}
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: jsonLdScript(
            localityPlaceLd(
              { name: locality.name, lat: locality.lat, lng: locality.lng },
              content ? { positioning: content.positioning } : undefined,
            ),
          ),
        }}
      />
      <nav aria-label="Breadcrumb" className="mb-5 text-[0.875rem]">
        <Link
          href="/localities"
          className="text-muted underline-offset-4 hover:text-ink hover:underline"
        >
          ← All localities
        </Link>
      </nav>

      <header className="rounded-card bg-surface p-8 shadow-card ring-1 ring-line sm:p-10">
        <span aria-hidden="true" className="mb-3 block h-[3px] w-10 bg-verify" />
        <h1 className="display text-[2.5rem] text-ink sm:text-[3rem]">
          {locality.name}, Hyderabad
        </h1>
        {content?.headline && (
          <p className="mt-4 text-[1.125rem] leading-snug text-muted">
            {content.headline}
          </p>
        )}

        <dl className="mt-8 grid gap-6 border-t border-line-soft pt-6 sm:grid-cols-3">
          <div>
            <dt className="label text-faint">Median rate</dt>
            <dd className="mt-1.5 tabular display text-[1.5rem] text-ink">
              {rateNumber ? (
                <>
                  {rateNumber}
                  <span className="text-[0.875rem] font-normal text-muted"> /sqft</span>
                </>
              ) : (
                <span className="text-[0.9375rem] font-normal text-muted">
                  Awaiting inventory
                </span>
              )}
            </dd>
            {sampleSize !== null && sampleSize > 0 && (
              <dd className="mt-1 text-[0.75rem] text-faint">
                From {sampleSize} verified listing{sampleSize === 1 ? '' : 's'}
              </dd>
            )}
          </div>
          <div>
            <dt className="label text-faint">Active projects</dt>
            <dd className="mt-1.5 tabular display text-[1.5rem] text-ink">
              {projects.length}
            </dd>
          </div>
          <div>
            <dt className="label text-faint">Deep-dive</dt>
            <dd className="mt-1.5">
              <Link
                href={`/property-rates/${slug}`}
                className="inline-flex items-center gap-1 text-[0.9375rem] font-medium text-verify underline-offset-4 hover:underline"
              >
                See price rate detail →
              </Link>
            </dd>
          </div>
        </dl>
      </header>

      {content && (
        <section aria-labelledby="positioning-heading" className="mt-12 max-w-[46rem]">
          <span aria-hidden="true" className="mb-3 block h-[3px] w-10 bg-verify" />
          <h2 id="positioning-heading" className="display text-[1.625rem] text-ink">
            What buying in {locality.name} actually looks like
          </h2>
          <p className="mt-4 text-[1.0625rem] leading-relaxed text-muted">
            {content.positioning}
          </p>
        </section>
      )}

      {content && (
        <section aria-labelledby="prosCons-heading" className="mt-12">
          <span aria-hidden="true" className="mb-3 block h-[3px] w-10 bg-verify" />
          <h2 id="prosCons-heading" className="display text-[1.5rem] text-ink">
            The trade-offs, honestly
          </h2>

          <div className="mt-6 grid gap-6 lg:grid-cols-2">
            <div className="rounded-card bg-surface p-6 shadow-card ring-1 ring-line">
              <p className="label text-verify">What works</p>
              <ul className="mt-3 space-y-2.5">
                {content.pros.map((pro) => (
                  <li
                    key={pro}
                    className="flex items-start gap-2.5 text-[0.9375rem] leading-relaxed text-ink"
                  >
                    <span
                      aria-hidden="true"
                      className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-verify"
                    />
                    {pro}
                  </li>
                ))}
              </ul>
            </div>
            <div className="rounded-card bg-surface p-6 shadow-card ring-1 ring-line">
              <p className="label text-seal">What doesn&rsquo;t</p>
              <ul className="mt-3 space-y-2.5">
                {content.cons.map((con) => (
                  <li
                    key={con}
                    className="flex items-start gap-2.5 text-[0.9375rem] leading-relaxed text-ink"
                  >
                    <span
                      aria-hidden="true"
                      className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-seal"
                    />
                    {con}
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </section>
      )}

      {content?.connectivity && (
        <section aria-labelledby="connectivity-heading" className="mt-12 max-w-[46rem]">
          <span aria-hidden="true" className="mb-3 block h-[3px] w-10 bg-verify" />
          <h2 id="connectivity-heading" className="display text-[1.5rem] text-ink">
            How you get in and out
          </h2>
          <p className="mt-4 text-[1.0625rem] leading-relaxed text-muted">
            {content.connectivity}
          </p>
        </section>
      )}

      {content?.buyerProfile && (
        <section
          aria-labelledby="buyer-heading"
          className="mt-12 rounded-card bg-verify-soft p-8 ring-1 ring-verify/25"
        >
          <p className="label text-verify-ink">Who buys here</p>
          <h2 id="buyer-heading" className="mt-3 display text-[1.25rem] text-ink">
            {locality.name}&rsquo;s typical buyer
          </h2>
          <p className="mt-3 text-[1rem] leading-relaxed text-ink/85">
            {content.buyerProfile}
          </p>
        </section>
      )}

      {apiMatch && (
        <section aria-labelledby="reviews-heading" className="mt-16">
          <span aria-hidden="true" className="mb-3 block h-[3px] w-10 bg-verify" />
          <h2 id="reviews-heading" className="display text-[1.5rem] text-ink">
            What residents say
          </h2>
          <p className="mt-1.5 text-[0.9375rem] text-muted">
            Reviews from people who&rsquo;ve lived in {locality.name}. Every
            review is moderated before it appears.
          </p>

          <div className="mt-8">
            <LocalityReviews neighborhoodId={apiMatch.id} />
          </div>
        </section>
      )}

      {projects.length > 0 && (
        <section aria-labelledby="projects-heading" className="mt-16">
          <span aria-hidden="true" className="mb-3 block h-[3px] w-10 bg-verify" />
          <h2 id="projects-heading" className="display text-[1.5rem] text-ink">
            New projects in {locality.name}
          </h2>
          <p className="mt-1.5 text-[0.9375rem] text-muted">
            Verified by SellEasy24 officers against RERA + builder documents.
          </p>

          <ul className="mt-8 grid gap-x-6 gap-y-10 sm:grid-cols-2 lg:grid-cols-3">
            {projects.map((project) => (
              <li key={project.id}>
                <ProjectCardItem project={project} />
              </li>
            ))}
          </ul>
        </section>
      )}

      <section aria-labelledby="cta-heading" className="mt-16 rounded-card bg-action p-8 text-white sm:p-10">
        <h2 id="cta-heading" className="display text-[1.5rem] text-white">
          Browse every verified home in {locality.name}
        </h2>
        <p className="mt-3 text-[0.9375rem] leading-relaxed text-white/80">
          Every listing is checked against ownership documents by a person
          before it appears. Filter by budget, configuration, and amenities
          on the next screen.
        </p>
        <div className="mt-6 flex flex-wrap gap-3">
          {apiMatch && (
            <Link
              href={`/?neighborhoodId=${apiMatch.id}`}
              className="rounded-control bg-verify px-5 py-2.5 text-[0.9375rem] font-semibold text-verify-ink transition-transform duration-200 hover:-translate-y-px"
            >
              See homes in {locality.name}
            </Link>
          )}
          <Link
            href="/map"
            className="rounded-control border border-white/30 px-5 py-2.5 text-[0.9375rem] font-medium text-white transition-colors hover:bg-white/10"
          >
            Open the map
          </Link>
        </div>
      </section>

      {nearby.length > 0 && (
        <section aria-labelledby="nearby-heading" className="mt-16">
          <span aria-hidden="true" className="mb-3 block h-[3px] w-10 bg-verify" />
          <h2 id="nearby-heading" className="display text-[1.5rem] text-ink">
            Nearby localities
          </h2>
          <ul className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
            {nearby.map((n) => (
              <li key={n.name}>
                <Link
                  href={`/localities/${localitySlug(n.name)}`}
                  className="flex items-center justify-between rounded-control border border-line bg-surface px-4 py-2.5 text-[0.9375rem] text-ink transition-colors hover:border-muted"
                >
                  <span>{n.name}</span>
                  <span className="text-[0.75rem] text-faint">{n.km.toFixed(1)} km</span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}

import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { api, type ProjectCard } from '@/lib/api';
import { ProjectCardItem } from '@/components/project-card';

export const dynamic = 'force-dynamic';

interface PageProps {
  params: Promise<{ slug: string }>;
}

/**
 * Individual builder profile.
 *
 * The slug embeds the last eight characters of the builder id (see
 * ../page.tsx `slugFor`), so we recover the id from the slug rather than
 * searching by name — which would collide the moment two builders share
 * a first word.
 */
function idFromSlug(slug: string): string {
  const parts = slug.split('-');
  const last = parts[parts.length - 1];
  return last ?? '';
}

async function findBuilder(slug: string) {
  const idFragment = idFromSlug(slug);
  if (!idFragment) return null;

  // Server-side cap on `limit` is 50; see builders/page.tsx for the
  // pagination follow-up note.
  const results = await api
    .searchProjects({ limit: '50' })
    .catch(() => ({ total: 0, items: [] as ProjectCard[], limit: 50, offset: 0 }));

  const projects = results.items.filter(
    (project) => project.builder.id.startsWith(idFragment),
  );

  if (projects.length === 0) return null;

  const first = projects[0]!;
  const active = projects.filter((p) => p.stage !== 'DELIVERED');
  const delivered = projects.filter((p) => p.stage === 'DELIVERED');
  const localities = Array.from(new Set(projects.map((p) => p.locality))).sort();

  return {
    id: first.builder.id,
    name: first.builder.name,
    reraNumber: first.builder.reraNumber,
    projects,
    active,
    delivered,
    localities,
  };
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { slug } = await params;
  const builder = await findBuilder(slug);
  if (!builder) return { title: 'Builder not found' };
  return {
    title: `${builder.name} · Projects in Hyderabad`,
    description: `${builder.active.length} active and ${builder.delivered.length} delivered projects by ${builder.name} in Hyderabad. Every project verified against RERA.`,
  };
}

export default async function BuilderProfilePage({ params }: PageProps) {
  const { slug } = await params;
  const builder = await findBuilder(slug);
  if (!builder) notFound();

  return (
    <div className="mx-auto max-w-[76rem] px-5 py-8 sm:px-8">
      <nav aria-label="Breadcrumb" className="mb-5 text-[0.875rem]">
        <Link
          href="/builders"
          className="text-muted underline-offset-4 hover:text-ink hover:underline"
        >
          ← All builders
        </Link>
      </nav>

      <header className="rounded-card bg-surface p-8 shadow-card ring-1 ring-line sm:p-10">
        <span aria-hidden="true" className="mb-3 block h-[3px] w-10 bg-verify" />
        <h1 className="display text-[2.25rem] text-ink sm:text-[2.75rem]">
          {builder.name}
        </h1>
        {builder.reraNumber && (
          <p className="mt-3 text-[0.9375rem] text-muted">
            RERA registration:{' '}
            <span className="font-medium text-ink">{builder.reraNumber}</span>
          </p>
        )}

        <dl className="mt-8 grid gap-4 border-t border-line-soft pt-6 sm:grid-cols-3">
          <div>
            <dt className="label text-faint">Active projects</dt>
            <dd className="mt-1.5 tabular display text-[1.75rem] text-ink">
              {builder.active.length}
            </dd>
          </div>
          <div>
            <dt className="label text-faint">Delivered projects</dt>
            <dd className="mt-1.5 tabular display text-[1.75rem] text-ink">
              {builder.delivered.length}
            </dd>
          </div>
          <div>
            <dt className="label text-faint">Localities</dt>
            <dd className="mt-1.5 display text-[1.125rem] text-ink">
              {builder.localities.length === 0
                ? '—'
                : builder.localities.slice(0, 3).join(', ') +
                  (builder.localities.length > 3
                    ? ` +${builder.localities.length - 3}`
                    : '')}
            </dd>
          </div>
        </dl>
      </header>

      {builder.active.length > 0 && (
        <section
          aria-labelledby="active-heading"
          className="mt-14"
        >
          <span aria-hidden="true" className="mb-3 block h-[3px] w-10 bg-verify" />
          <h2 id="active-heading" className="display text-[1.5rem] text-ink">
            Active projects
          </h2>
          <p className="mt-1.5 text-[0.9375rem] text-muted">
            Available to enquire, verified against RERA and ownership documents.
          </p>

          <ul className="mt-8 grid gap-x-6 gap-y-10 sm:grid-cols-2 lg:grid-cols-3">
            {builder.active.map((project) => (
              <li key={project.id}>
                <ProjectCardItem project={project} />
              </li>
            ))}
          </ul>
        </section>
      )}

      {builder.delivered.length > 0 && (
        <section
          aria-labelledby="delivered-heading"
          className="mt-16"
        >
          <span aria-hidden="true" className="mb-3 block h-[3px] w-10 bg-verify" />
          <h2 id="delivered-heading" className="display text-[1.5rem] text-ink">
            Delivered projects
          </h2>
          <p className="mt-1.5 text-[0.9375rem] text-muted">
            Track record — projects handed over to residents.
          </p>

          <ul className="mt-8 grid gap-x-6 gap-y-10 sm:grid-cols-2 lg:grid-cols-3">
            {builder.delivered.map((project) => (
              <li key={project.id}>
                <ProjectCardItem project={project} />
              </li>
            ))}
          </ul>
        </section>
      )}

      <section
        aria-labelledby="verification-heading"
        className="mt-16 rounded-card bg-verify-soft p-8 ring-1 ring-verify/25"
      >
        <p className="label text-verify-ink">How this profile is verified</p>
        <h2 id="verification-heading" className="mt-3 display text-[1.25rem] text-ink">
          Every project counted here has been checked
        </h2>
        <p className="mt-4 text-[0.9375rem] leading-relaxed text-ink/85">
          Each project attributed to {builder.name} has been reviewed by a
          SellEasy24 verification officer, cross-referenced against the RERA
          record on file, and confirmed against the promoter&rsquo;s
          documentation. Delivery status is updated when residents take
          possession, not when the developer announces it.
        </p>
      </section>
    </div>
  );
}

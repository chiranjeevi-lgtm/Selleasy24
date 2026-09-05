import type { Metadata } from 'next';
import Link from 'next/link';
import { api, type ProjectCard } from '@/lib/api';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Builders in Hyderabad · Verified project portfolios',
  description:
    'Every builder listing new projects on SellEasy24, with their RERA registration and complete project portfolio.',
};

/**
 * Builders index.
 *
 * Aggregated from the projects the site already carries — one row per
 * distinct builder, with project counts and a delivered-vs-active split.
 * A dedicated `/builders/{slug}` page is generated for each; the slug is
 * derived from the builder id rather than the name so it is stable when a
 * builder rebrands.
 *
 * Ordering: most active builders first (open projects, not lifetime count),
 * because a buyer visiting this page is looking for inventory they can act
 * on, not a hall of fame.
 */

interface BuilderSummary {
  id: string;
  slug: string;
  name: string;
  reraNumber: string | null;
  totalProjects: number;
  activeProjects: number;
  deliveredProjects: number;
  localities: Set<string>;
}

function slugFor(id: string, name: string): string {
  const namePart = name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '')
    .slice(0, 60);
  return `${namePart}-${id.slice(0, 8)}`;
}

function isActive(stage: ProjectCard['stage']): boolean {
  return stage !== 'DELIVERED';
}

export default async function BuildersIndexPage() {
  // The search endpoint caps `limit` at 50 server-side. Fifty projects is
  // enough to seed the directory for launch; pagination is a follow-up once
  // Hyderabad inventory grows past that.
  const results = await api
    .searchProjects({ limit: '50' })
    .catch(() => ({ total: 0, items: [] as ProjectCard[], limit: 50, offset: 0 }));

  const summaries = new Map<string, BuilderSummary>();

  for (const project of results.items) {
    const key = project.builder.id;
    const existing = summaries.get(key);
    if (existing) {
      existing.totalProjects += 1;
      if (isActive(project.stage)) existing.activeProjects += 1;
      else existing.deliveredProjects += 1;
      existing.localities.add(project.locality);
      continue;
    }
    summaries.set(key, {
      id: project.builder.id,
      slug: slugFor(project.builder.id, project.builder.name),
      name: project.builder.name,
      reraNumber: project.builder.reraNumber,
      totalProjects: 1,
      activeProjects: isActive(project.stage) ? 1 : 0,
      deliveredProjects: isActive(project.stage) ? 0 : 1,
      localities: new Set([project.locality]),
    });
  }

  const builders = Array.from(summaries.values()).sort((a, b) => {
    if (b.activeProjects !== a.activeProjects) return b.activeProjects - a.activeProjects;
    return a.name.localeCompare(b.name);
  });

  return (
    <div className="mx-auto max-w-[76rem] px-5 py-12 sm:px-8 sm:py-16">
      <header className="max-w-2xl">
        <span aria-hidden="true" className="mb-3 block h-[3px] w-10 bg-verify" />
        <h1 className="display text-[2.25rem] text-ink sm:text-[3rem]">
          Builders in Hyderabad
        </h1>
        <p className="mt-5 text-[1.0625rem] leading-relaxed text-muted">
          Every developer with a project on SellEasy24. Each name links to
          their complete portfolio — active projects, delivered projects, and
          the RERA registration on file for each.
        </p>
      </header>

      {builders.length === 0 ? (
        <div className="mt-12 rounded-card border border-dashed border-line bg-surface px-6 py-16 text-center">
          <p className="text-[1.0625rem] font-medium text-ink">
            No builders in the directory yet
          </p>
          <p className="mx-auto mt-2 max-w-sm text-[0.9375rem] leading-relaxed text-muted">
            Builders appear here as soon as their first project is verified.
            In the meantime, browse resale homes across Hyderabad.
          </p>
          <Link
            href="/"
            className="mt-6 inline-block rounded-control bg-action px-5 py-2.5 text-[0.9375rem] font-semibold text-white transition-colors hover:bg-action-hover"
          >
            Browse homes
          </Link>
        </div>
      ) : (
        <ul className="mt-12 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {builders.map((builder) => (
            <li key={builder.id}>
              <Link
                href={`/builders/${builder.slug}`}
                className="group flex h-full flex-col rounded-card bg-surface p-6 shadow-card ring-1 ring-line transition-all duration-300 hover:-translate-y-0.5 hover:shadow-lift"
              >
                <p className="display text-[1.125rem] text-ink">{builder.name}</p>
                {builder.reraNumber && (
                  <p className="mt-1 text-[0.75rem] text-faint">
                    RERA {builder.reraNumber}
                  </p>
                )}

                <div className="mt-5 grid grid-cols-3 gap-3 border-t border-line-soft pt-4 text-center">
                  <div>
                    <p className="tabular text-[1.125rem] font-semibold text-ink">
                      {builder.activeProjects}
                    </p>
                    <p className="mt-0.5 text-[0.6875rem] uppercase tracking-[0.08em] text-muted">
                      Active
                    </p>
                  </div>
                  <div>
                    <p className="tabular text-[1.125rem] font-semibold text-ink">
                      {builder.deliveredProjects}
                    </p>
                    <p className="mt-0.5 text-[0.6875rem] uppercase tracking-[0.08em] text-muted">
                      Delivered
                    </p>
                  </div>
                  <div>
                    <p className="tabular text-[1.125rem] font-semibold text-ink">
                      {builder.localities.size}
                    </p>
                    <p className="mt-0.5 text-[0.6875rem] uppercase tracking-[0.08em] text-muted">
                      {builder.localities.size === 1 ? 'Area' : 'Areas'}
                    </p>
                  </div>
                </div>

                <span className="mt-5 inline-flex items-center gap-1 text-[0.8125rem] text-verify transition-transform duration-300 group-hover:translate-x-0.5">
                  See projects →
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

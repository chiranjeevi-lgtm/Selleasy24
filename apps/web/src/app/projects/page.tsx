import type { Metadata } from 'next';
import Link from 'next/link';
import { api, type ProjectSearchParams } from '@/lib/api';
import { ProjectCardItem } from '@/components/project-card';
import { PROJECT_STAGE_LABEL } from '@/lib/format';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'New projects in Hyderabad',
  description:
    'Verified builder projects across Hyderabad, with the RERA registration shown on every one.',
};

/**
 * Filters kept deliberately few.
 *
 * Stage and configuration are the two questions a buyer actually asks about new
 * construction — can I move in, and does it come in the size I want. The resale
 * search carries a dozen more filters because a resale buyer is comparing
 * specific properties; someone browsing projects is comparing developments.
 */
const STAGES = [
  'READY_TO_MOVE',
  'NEARING_POSSESSION',
  'UNDER_CONSTRUCTION',
  'PRE_LAUNCH',
  'DELIVERED',
] as const;

const BEDROOMS = [2, 3, 4] as const;

interface PageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

function single(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

export default async function ProjectsPage({ searchParams }: PageProps) {
  const params = await searchParams;

  const query: ProjectSearchParams = {
    ...(single(params.stage) && { stage: single(params.stage) }),
    ...(single(params.bedrooms) && { bedrooms: single(params.bedrooms) }),
    limit: '24',
  };

  const results = await api.searchProjects(query);

  const activeStage = single(params.stage);
  const activeBedrooms = single(params.bedrooms);

  /** Keeps the other filter intact when one is changed or cleared. */
  const href = (next: Partial<Record<'stage' | 'bedrooms', string | undefined>>): string => {
    const merged = new URLSearchParams();
    const stage = 'stage' in next ? next.stage : activeStage;
    const bedrooms = 'bedrooms' in next ? next.bedrooms : activeBedrooms;
    if (stage) merged.set('stage', stage);
    if (bedrooms) merged.set('bedrooms', bedrooms);
    const queryString = merged.toString();
    return queryString ? `/projects?${queryString}` : '/projects';
  };

  return (
    <div className="mx-auto max-w-[76rem] px-5 py-8 sm:px-8">
      <nav aria-label="Breadcrumb" className="mb-5 text-[0.875rem]">
        <Link href="/" className="text-muted transition-colors hover:text-ink">
          Homes
        </Link>
        <span className="mx-2 text-faint" aria-hidden="true">/</span>
        <span className="text-ink">New projects</span>
      </nav>

      <header className="max-w-prose">
        <h1 className="display text-[1.75rem] text-ink sm:text-[2.25rem]">
          New projects in Hyderabad
        </h1>
        <p className="mt-3 text-[1rem] leading-relaxed text-muted">
          Every project here has had its TS-RERA registration, sanctioned plan
          and land title checked by a person before it appeared. The registration
          number is on each one — you can look it up yourself.
        </p>
      </header>

      {/* --- Filters --- */}
      <div className="mt-8 space-y-3 border-y border-line py-5">
        <FilterRow label="Stage">
          <FilterChip href={href({ stage: undefined })} active={!activeStage}>
            Any
          </FilterChip>
          {STAGES.map((stage) => (
            <FilterChip
              key={stage}
              href={href({ stage: activeStage === stage ? undefined : stage })}
              active={activeStage === stage}
            >
              {PROJECT_STAGE_LABEL[stage]}
            </FilterChip>
          ))}
        </FilterRow>

        <FilterRow label="Configuration">
          <FilterChip href={href({ bedrooms: undefined })} active={!activeBedrooms}>
            Any
          </FilterChip>
          {BEDROOMS.map((count) => (
            <FilterChip
              key={count}
              href={href({
                bedrooms: activeBedrooms === String(count) ? undefined : String(count),
              })}
              active={activeBedrooms === String(count)}
            >
              {count} BHK
            </FilterChip>
          ))}
        </FilterRow>
      </div>

      <p className="mt-5 text-[0.875rem] text-muted">
        {results.total === 0
          ? 'Nothing matches those filters.'
          : `${results.total} ${results.total === 1 ? 'project' : 'projects'}`}
      </p>

      {results.items.length === 0 ? (
        <div className="mt-6 rounded-card border border-dashed border-line px-6 py-16 text-center">
          <p className="text-[1.0625rem] font-medium text-ink">No projects to show</p>
          <p className="mx-auto mt-2 max-w-sm text-[0.875rem] leading-relaxed text-muted">
            Try clearing the filters, or look at resale homes instead — there are
            considerably more of those on the platform today.
          </p>
          <div className="mt-6 flex flex-wrap justify-center gap-3">
            <Link
              href="/projects"
              className="rounded-control border border-line px-4 py-2 text-[0.875rem] font-medium text-ink transition-colors hover:bg-canvas-deep"
            >
              Clear filters
            </Link>
            <Link
              href="/"
              className="rounded-control bg-action px-4 py-2 text-[0.875rem] font-semibold text-white transition-colors hover:bg-action-hover"
            >
              Browse homes
            </Link>
          </div>
        </div>
      ) : (
        <div className="mt-6 grid gap-x-6 gap-y-9 sm:grid-cols-2 lg:grid-cols-3">
          {results.items.map((project) => (
            <ProjectCardItem key={project.id} project={project} />
          ))}
        </div>
      )}
    </div>
  );
}

function FilterRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
      <span className="label w-24 shrink-0 text-faint">{label}</span>
      <div className="flex flex-wrap gap-2">{children}</div>
    </div>
  );
}

/**
 * Links rather than form controls, so a filtered view is a real URL — one a
 * buyer can bookmark or send to whoever they are buying with.
 */
function FilterChip({
  href,
  active,
  children,
}: {
  href: string;
  active: boolean;
  children: React.ReactNode;
}) {
  return (
    <Link
      href={href}
      aria-current={active ? 'true' : undefined}
      className={`rounded-full px-3.5 py-1.5 text-[0.8125rem] font-medium transition-colors ${
        active
          ? 'bg-action text-white'
          : 'border border-line text-ink hover:border-action/40 hover:bg-canvas-deep'
      }`}
    >
      {children}
    </Link>
  );
}

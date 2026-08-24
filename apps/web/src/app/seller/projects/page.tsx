import Link from 'next/link';
import { ApiError } from '@/lib/api';
import { serverApi, type BuilderProjectSummary } from '@/lib/server-api';
import { WrongAccount } from '../wrong-account';
import { StatusBadge, StatusMeaning } from '@/components/status-badge';
import {
  PROJECT_STAGE_LABEL,
  formatConfigurations,
  formatPossession,
  formatRupeesShort,
} from '@/lib/format';

export const dynamic = 'force-dynamic';

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000';

function photoUrl(url: string): string {
  return url.startsWith('http') ? url : `${API_BASE}${url}`;
}

/** "1 photo", "4 photos". Every noun here is regular, so a bare "s" is enough. */
function plural(count: number, noun: string): string {
  return `${count} ${noun}${count === 1 ? '' : 's'}`;
}

/**
 * The builder's portfolio.
 *
 * Split into what is selling and what has been delivered, rather than one list
 * ordered by date. A builder's delivered work is not stale inventory to be
 * scrolled past — it is the record buyers judge the current projects on, so it
 * gets its own section instead of sinking to the bottom.
 */
export default async function BuilderProjectsPage() {
  // An owner or agent reaching this by typed URL gets an explanation rather
  // than a 500 — the mirror of the guard on the listings page.
  const projects = await serverApi.myProjects().catch((error) => {
    if (error instanceof ApiError && error.status === 403) return null;
    throw error;
  });

  if (projects === null) {
    return (
      <WrongAccount
        what="Projects"
        goTo="/seller/listings"
        goToLabel="Go to your listings"
      />
    );
  }

  const delivered = projects.filter((project) => project.stage === 'DELIVERED');
  const active = projects.filter((project) => project.stage !== 'DELIVERED');

  const totalViews = projects.reduce((sum, project) => sum + project.viewsCount, 0);
  const live = projects.filter((project) => project.status === 'APPROVED').length;

  return (
    <div>
      <div className="flex flex-wrap items-baseline justify-between gap-3">
        <h2 className="label text-muted">
          {projects.length === 0
            ? 'No projects yet'
            : `${projects.length} ${projects.length === 1 ? 'project' : 'projects'}`}
        </h2>
        <Link
          href="/seller/projects/new"
          className="rounded-control bg-action px-4 py-2 text-[0.875rem] font-semibold text-white transition-colors hover:bg-action-hover"
        >
          Add a project
        </Link>
      </div>

      {projects.length === 0 ? (
        <div className="mt-6 rounded-card border border-dashed border-line px-6 py-14 text-center">
          <p className="text-[0.9375rem] text-ink">Your projects appear here</p>
          <p className="mx-auto mt-2 max-w-md text-[0.8125rem] leading-relaxed text-muted">
            Add a project with its TS-RERA registration, the sanctioned plan and
            at least one configuration. An officer checks all three against the
            public registers before buyers see it.
          </p>
          <Link
            href="/seller/projects/new"
            className="mt-5 inline-block rounded-control border border-action px-4 py-2 text-[0.875rem] text-action transition-colors hover:bg-action hover:text-surface"
          >
            Add your first project
          </Link>
        </div>
      ) : (
        <>
          {/* Two figures only. A dashboard of twelve numbers is one nobody
              reads; these are the two a builder acts on. */}
          <dl className="mt-5 grid grid-cols-2 gap-3 sm:max-w-sm">
            <div className="rounded-card border border-line bg-surface px-4 py-3">
              <dt className="label text-faint">Live</dt>
              <dd className="mt-1 text-[1.5rem] font-semibold leading-none text-ink tabular">
                {live}
              </dd>
            </div>
            <div className="rounded-card border border-line bg-surface px-4 py-3">
              <dt className="label text-faint">Views, 30 days</dt>
              <dd className="mt-1 text-[1.5rem] font-semibold leading-none text-ink tabular">
                {totalViews}
              </dd>
            </div>
          </dl>

          {active.length > 0 && (
            <ul className="mt-7 space-y-3">
              {active.map((project) => (
                <ProjectRow key={project.id} project={project} />
              ))}
            </ul>
          )}

          {delivered.length > 0 && (
            <section className="mt-10">
              <h3 className="label text-faint">Delivered</h3>
              <p className="mt-1.5 max-w-prose text-[0.8125rem] leading-relaxed text-muted">
                Kept on the platform after handover. Buyers looking at your
                current projects can see what you have already finished.
              </p>
              <ul className="mt-3 space-y-3">
                {delivered.map((project) => (
                  <ProjectRow key={project.id} project={project} />
                ))}
              </ul>
            </section>
          )}
        </>
      )}
    </div>
  );
}

function ProjectRow({ project }: { project: BuilderProjectSummary }) {
  const configurations = formatConfigurations([
    ...new Set(project.units.map((unit) => unit.bedrooms)),
  ].sort((a, b) => a - b));
  const possession = formatPossession(project.possessionDate, project.deliveredOn);
  const priceFrom = project.priceFrom === null ? null : Number(project.priceFrom);

  const needsAttention = project.status === 'REJECTED' || project.status === 'DRAFT';

  return (
    <li className="overflow-hidden rounded-card border border-line bg-surface">
      <Link
        href={`/seller/projects/${project.id}`}
        className="flex gap-4 px-4 py-4 transition-colors hover:bg-canvas"
      >
        <div className="hidden h-20 w-28 shrink-0 overflow-hidden rounded-control bg-canvas-deep sm:block">
          {project.coverUrl ? (
            /* eslint-disable-next-line @next/next/no-img-element */
            <img
              src={photoUrl(project.coverUrl)}
              alt=""
              className="h-full w-full object-cover"
              loading="lazy"
            />
          ) : (
            <span className="flex h-full items-center justify-center text-[0.6875rem] text-faint">
              No photo
            </span>
          )}
        </div>

        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div className="min-w-0">
              <p className="text-[0.9375rem] font-semibold text-ink">{project.name}</p>
              <p className="mt-0.5 text-[0.8125rem] text-muted">
                {PROJECT_STAGE_LABEL[project.stage] ?? project.stage} ·{' '}
                {project.neighborhood.name}
              </p>
            </div>
            <StatusBadge status={project.status} kind="project" />
          </div>

          <div className="mt-2 flex flex-wrap items-center gap-x-2.5 gap-y-1 text-[0.8125rem] text-muted">
            {priceFrom !== null && (
              <span className="font-medium tabular text-ink">
                from {formatRupeesShort(priceFrom)}
              </span>
            )}
            {configurations && <span>{configurations}</span>}
            {possession && <span>{possession}</span>}
          </div>

          <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-[0.75rem] text-faint tabular">
            <span>{plural(project.viewsCount, 'view')}</span>
            <span>{plural(project._count.units, 'configuration')}</span>
            <span>{plural(project._count.photos, 'photo')}</span>
            {/*
              Null means no configuration recorded availability, which is not the
              same as sold out. Saying "none left" for silence would tell buyers
              the project is finished when nobody claimed that.
            */}
            {project.availableUnits !== null && (
              <span>
                {project.availableUnits === 0
                  ? 'nothing available'
                  : `${project.availableUnits} available`}
              </span>
            )}
          </div>
        </div>
      </Link>

      {needsAttention && (
        <div className="border-t border-line bg-canvas px-4 py-2.5">
          <StatusMeaning status={project.status} kind="project" />
          {project.rejectionReason && (
            <p className="mt-1.5 text-[0.8125rem] leading-relaxed text-ink">
              {project.rejectionReason}
            </p>
          )}
        </div>
      )}
    </li>
  );
}

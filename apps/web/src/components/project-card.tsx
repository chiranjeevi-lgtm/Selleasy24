import Link from 'next/link';
import type { ProjectCard as Project } from '@/lib/api';
import {
  PROJECT_STAGE_LABEL,
  formatConfigurations,
  formatPossession,
  formatPriceRange,
} from '@/lib/format';

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000';

function photoUrl(url: string): string {
  return url.startsWith('http') ? url : `${API_BASE}${url}`;
}

/**
 * Stage treatment.
 *
 * Ready-to-move gets the filled mark because it is the state a buyer can act on
 * today; delivered is deliberately quiet, since those projects are track record
 * rather than inventory and should not compete for attention with what is for
 * sale.
 */
const STAGE_STYLE: Record<string, string> = {
  READY_TO_MOVE: 'bg-action text-white',
  NEARING_POSSESSION: 'bg-verify-soft text-verify-ink ring-1 ring-verify/40',
  UNDER_CONSTRUCTION: 'bg-white/90 text-ink ring-1 ring-line',
  PRE_LAUNCH: 'bg-white/90 text-ink ring-1 ring-line',
  DELIVERED: 'bg-ink/70 text-white/90',
};

export function ProjectCardItem({ project }: { project: Project }) {
  const cover = project.photos[0];
  const price = formatPriceRange(project.priceFrom, project.priceTo);
  const configurations = formatConfigurations(project.bedrooms);
  const possession = formatPossession(project.possessionDate, project.deliveredOn);

  return (
    <article className="group">
      <Link href={`/projects/${project.id}`} className="block">
        <div className="relative aspect-[4/3] overflow-hidden rounded-card bg-canvas-deep shadow-card ring-1 ring-line transition-all duration-300 group-hover:shadow-lift group-hover:ring-action/25">
          {cover ? (
            /* eslint-disable-next-line @next/next/no-img-element */
            <img
              src={photoUrl(cover.url)}
              alt=""
              className="h-full w-full object-cover transition-transform duration-500 ease-out group-hover:scale-[1.04]"
              loading="lazy"
            />
          ) : (
            <div className="flex h-full items-center justify-center">
              <span className="label text-faint">Photographs coming</span>
            </div>
          )}

          <span
            className={`label absolute left-3 top-3 rounded-full px-2.5 py-1 backdrop-blur-sm ${
              STAGE_STYLE[project.stage] ?? 'bg-white/90 text-ink ring-1 ring-line'
            }`}
          >
            {PROJECT_STAGE_LABEL[project.stage] ?? project.stage}
          </span>

          {/*
            A render is not a photograph, and a buyer looking at an unbuilt
            project deserves to know which one they are looking at. Saying so on
            the image is the honest place for it.
          */}
          {cover?.isRender && (
            <span className="absolute bottom-3 left-3 rounded-full bg-ink/55 px-2 py-0.5 text-[0.6875rem] font-medium text-white backdrop-blur-sm">
              Artist’s impression
            </span>
          )}

          {project.photos.length > 1 && (
            <span className="absolute bottom-3 right-3 rounded-full bg-ink/55 px-2 py-0.5 text-[0.6875rem] font-medium text-white backdrop-blur-sm tabular">
              {project.photos.length} photos
            </span>
          )}
        </div>

        <div className="pt-3.5">
          {price && (
            <p className="display text-[1.375rem] leading-none tabular text-action">{price}</p>
          )}

          <h3 className="mt-2 text-[1.0625rem] font-semibold leading-snug text-ink">
            {project.name}
          </h3>

          <p className="mt-1 truncate text-[0.875rem] text-muted">
            {configurations ? `${configurations} · ` : ''}
            {project.locality}
          </p>

          <div className="mt-2.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-[0.8125rem] text-muted">
            {possession && <span>{possession}</span>}
            {project.totalUnits !== null && (
              <>
                {possession && (
                  <span aria-hidden="true" className="text-line">&middot;</span>
                )}
                <span className="tabular">{project.totalUnits} units</span>
              </>
            )}
          </div>

          {/*
            The RERA number, in plain sight. MagicBricks puts exactly this data
            behind an "Unlock Now" lead-capture wall; it is a public register
            entry, and showing it is the whole proposition.
          */}
          <p className="mt-2 truncate text-[0.75rem] text-faint tabular">
            TS-RERA {project.reraNumber}
          </p>
        </div>
      </Link>
    </article>
  );
}

import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ApiError } from '@/lib/api';
import { serverApi, type BuilderProjectDetail } from '@/lib/server-api';
import { StatusBadge, StatusMeaning } from '@/components/status-badge';
import { WrongAccount } from '../../wrong-account';
import {
  PROJECT_STAGE_LABEL,
  formatAcres,
  formatArea,
  formatDate,
  formatPossession,
  formatRupees,
} from '@/lib/format';
import {
  ProjectDocumentUploader,
  ProjectPhotoUploader,
  SubmitProject,
  UnitsEditor,
  type ProjectDocumentSlot,
} from './project-panels';

export const dynamic = 'force-dynamic';

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000';

function photoUrl(url: string): string {
  return url.startsWith('http') ? url : `${API_BASE}${url}`;
}

/** Stages at which the project claims to be finished. */
const COMPLETED_STAGES = ['READY_TO_MOVE', 'DELIVERED'];

/**
 * Document slots, in the order an officer reviews them.
 *
 * The occupancy certificate is required only once the builder claims the
 * project is finished — it is the document that makes "ready to move" true, and
 * demanding it from a pre-launch project would make an honest submission
 * impossible.
 */
function documentSlots(stage: string): ProjectDocumentSlot[] {
  const completed = COMPLETED_STAGES.includes(stage);

  return [
    {
      value: 'RERA_CERTIFICATE',
      label: 'TS-RERA registration certificate',
      inSentence: 'TS-RERA registration certificate',
      hint: 'The project registration, not your promoter registration. Advertising an unregistered project is an offence in Telangana, so this is checked first.',
      required: true,
    },
    {
      value: 'APPROVED_PLAN',
      label: 'Sanctioned building plan',
      inSentence: 'sanctioned building plan',
      hint: 'The permit issued by GHMC, HMDA or DTCP, showing towers, floors and unit count.',
      required: true,
    },
    {
      value: 'OCCUPANCY_CERTIFICATE',
      label: 'Occupancy certificate',
      inSentence: 'occupancy certificate',
      hint: completed
        ? 'Required, because this project says buyers can move in. It is the document that makes that true.'
        : 'Add this once the certificate has been issued. Not needed while the project is unfinished.',
      required: completed,
    },
    {
      value: 'NOC',
      label: 'No-objection certificates',
      inSentence: 'no-objection certificates',
      hint: 'Fire, environment, airport height clearance and similar, where they apply.',
      required: false,
    },
  ];
}

/**
 * Verification checks in the same words the buyer sees on the public page.
 *
 * Deliberately identical wording: a builder should be able to read what was
 * checked and know exactly what a buyer is being told about their project.
 */
const CHECK_LABEL: Record<string, string> = {
  PROJECT_RERA_VALID: 'Registered with TS-RERA and the registration is current',
  PROJECT_PLAN_SANCTIONED: 'Building plan sanctioned by the competent authority',
  PROJECT_COMMENCEMENT_CERTIFICATE: 'Commencement certificate issued',
  PROJECT_LAND_TITLE_CLEAR: 'Land title clear and development rights held',
  PROJECT_OCCUPANCY_CERTIFICATE: 'Occupancy certificate issued',
};

/** Document kinds as a person writes them, for the read-only list. */
const DOCUMENT_LABEL: Record<string, string> = {
  RERA_CERTIFICATE: 'TS-RERA certificate',
  APPROVED_PLAN: 'Sanctioned plan',
  OCCUPANCY_CERTIFICATE: 'Occupancy certificate',
  COMPLETION_CERTIFICATE: 'Completion certificate',
  NOC: 'No-objection certificate',
};

/**
 * What still stands between this project and review.
 *
 * Computed here so the builder sees the same conditions the API enforces at
 * submit time, rather than discovering them one rejection at a time.
 */
function submissionBlockers(project: BuilderProjectDetail): string[] {
  const blockers: string[] = [];

  if (project.units.length === 0) {
    blockers.push('Add at least one unit configuration.');
  }

  if (project.photos.length < 3) {
    const missing = 3 - project.photos.length;
    blockers.push(`Add ${missing} more ${missing === 1 ? 'photo' : 'photos'} — three is the minimum.`);
  }

  const present = new Set(project.documents.map((doc) => doc.kind));
  for (const slot of documentSlots(project.stage)) {
    if (slot.required && !present.has(slot.value)) {
      blockers.push(`Upload the ${slot.inSentence}.`);
    }
  }

  return blockers;
}

export default async function BuilderProjectPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  let project: BuilderProjectDetail;
  try {
    project = await serverApi.myProject(id);
  } catch (error) {
    if (error instanceof ApiError) {
      if (error.status === 404) notFound();
      // An owner or agent following a stale link, rather than a fault.
      if (error.status === 403) {
        return (
          <WrongAccount
            what="Projects"
            goTo="/seller/listings"
            goToLabel="Go to your listings"
          />
        );
      }
    }
    throw error;
  }

  const editable = project.status === 'DRAFT' || project.status === 'REJECTED';
  const blockers = submissionBlockers(project);
  const possession = formatPossession(project.possessionDate, project.deliveredOn);

  const documentsByKind: Record<string, string[]> = {};
  for (const doc of project.documents) {
    documentsByKind[doc.kind] = [...(documentsByKind[doc.kind] ?? []), doc.originalFilename];
  }

  const latestDecision = project.verifications[0];

  return (
    <div>
      <nav aria-label="Breadcrumb" className="mb-5 text-[0.8125rem]">
        <Link href="/seller/projects" className="text-muted transition-colors hover:text-ink">
          Projects
        </Link>
        <span className="mx-2 text-faint" aria-hidden="true">/</span>
        <span className="text-ink">{project.name}</span>
      </nav>

      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="font-display text-[1.375rem] font-extrabold tracking-tight text-ink">
            {project.name}
          </h2>
          <p className="mt-1 text-[0.875rem] text-muted">
            {PROJECT_STAGE_LABEL[project.stage] ?? project.stage} ·{' '}
            {project.neighborhood.name} · <span className="tabular">{project.reraNumber}</span>
          </p>
        </div>
        <div className="flex items-center gap-3">
          <StatusBadge status={project.status} kind="project" />
          {project.status === 'APPROVED' && (
            <Link
              href={`/projects/${project.id}`}
              className="text-[0.8125rem] text-action underline underline-offset-2"
            >
              View public page
            </Link>
          )}
        </div>
      </div>

      <div className="mt-3">
        <StatusMeaning status={project.status} kind="project" />
      </div>

      {/* The officer's reason, where there is one. Shown before anything else a
          builder might do, because it is what they need to act on. */}
      {(project.rejectionReason ?? project.revisionNote) && (
        <div className="mt-4 rounded-control border-l-2 border-seal bg-seal-soft px-3.5 py-3">
          <p className="label text-seal">What needs fixing</p>
          <p className="mt-1.5 text-[0.875rem] leading-relaxed text-ink">
            {project.rejectionReason ?? project.revisionNote}
          </p>
          {latestDecision && (
            <p className="mt-1.5 text-[0.75rem] text-muted">
              Reviewed {formatDate(latestDecision.createdAt)}
            </p>
          )}
        </div>
      )}

      {/* --- Overview --- */}
      <dl className="mt-7 grid grid-cols-2 gap-x-6 gap-y-5 border-y border-line py-5 sm:grid-cols-4">
        {[
          { label: 'Possession', value: possession ?? '—' },
          { label: 'Land area', value: formatAcres(project.landAreaAcres === null ? null : Number(project.landAreaAcres)) ?? '—' },
          { label: 'Towers', value: project.totalTowers === null ? '—' : String(project.totalTowers) },
          { label: 'Views', value: String(project.viewsCount) },
        ].map((item) => (
          <div key={item.label}>
            <dt className="label text-faint">{item.label}</dt>
            <dd className="mt-1.5 text-[0.9375rem] font-semibold text-ink tabular">
              {item.value}
            </dd>
          </div>
        ))}
      </dl>

      {/* --- Configurations --- */}
      <section className="mt-8" aria-labelledby="configurations">
        <h3 id="configurations" className="text-[1rem] font-semibold text-ink">
          Configurations
        </h3>
        <p className="mt-1 max-w-prose text-[0.8125rem] leading-relaxed text-muted">
          What this project offers, and what it starts at.
        </p>

        <div className="mt-4">
          <UnitsEditor
            projectId={project.id}
            editable={editable}
            initial={project.units.map((unit) => ({
              bedrooms: String(unit.bedrooms),
              bathrooms: String(unit.bathrooms),
              areaSqft: String(unit.areaSqft),
              carpetAreaSqft: unit.carpetAreaSqft === null ? '' : String(unit.carpetAreaSqft),
              priceFrom: String(Math.round(Number(unit.priceFrom))),
              totalUnits: unit.totalUnits === null ? '' : String(unit.totalUnits),
              availableUnits: unit.availableUnits === null ? '' : String(unit.availableUnits),
            }))}
          />
        </div>

        {!editable && project.units.length > 0 && (
          <div className="mt-4 overflow-x-auto rounded-card border border-line">
            <table className="w-full min-w-[30rem] border-collapse text-[0.8125rem]">
              <thead>
                <tr className="border-b border-line bg-canvas">
                  {['Configuration', 'Built-up', 'From', 'Available'].map((heading) => (
                    <th key={heading} scope="col" className="label px-4 py-2.5 text-left text-faint">
                      {heading}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {project.units.map((unit) => (
                  <tr key={unit.id} className="border-b border-line last:border-0">
                    <th scope="row" className="px-4 py-3 text-left font-medium text-ink">
                      {unit.bedrooms} BHK
                    </th>
                    <td className="px-4 py-3 tabular text-muted">{formatArea(unit.areaSqft)}</td>
                    <td className="px-4 py-3 font-semibold tabular text-ink">
                      {formatRupees(Math.round(Number(unit.priceFrom)))}
                    </td>
                    <td className="px-4 py-3 tabular text-muted">
                      {unit.availableUnits === null
                        ? 'Not stated'
                        : unit.availableUnits === 0
                          ? 'Sold out'
                          : unit.availableUnits}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* --- Photos --- */}
      <section className="mt-9" aria-labelledby="photos">
        <h3 id="photos" className="text-[1rem] font-semibold text-ink">
          Photographs{' '}
          <span className="font-normal text-faint tabular">({project.photos.length})</span>
        </h3>

        {project.photos.length > 0 && (
          <ul className="mt-3 grid grid-cols-3 gap-2 sm:grid-cols-5">
            {project.photos.map((photo) => (
              <li
                key={photo.id}
                className="relative aspect-[4/3] overflow-hidden rounded-control bg-canvas-deep"
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={photoUrl(photo.url)}
                  alt=""
                  className="h-full w-full object-cover"
                  loading="lazy"
                />
                {photo.isRender && (
                  <span className="absolute bottom-1 left-1 rounded-full bg-ink/60 px-1.5 py-0.5 text-[0.625rem] text-white">
                    Render
                  </span>
                )}
              </li>
            ))}
          </ul>
        )}

        {editable ? (
          <div className="mt-4">
            <ProjectPhotoUploader projectId={project.id} count={project.photos.length} />
          </div>
        ) : (
          <p className="mt-3 text-[0.8125rem] text-muted">
            Photographs cannot be added or removed once a project is in review or
            live — an officer checked the set that is here.
          </p>
        )}
      </section>

      {/* --- Documents --- */}
      <section className="mt-9" aria-labelledby="documents">
        <h3 id="documents" className="text-[1rem] font-semibold text-ink">
          Statutory documents
        </h3>
        <p className="mt-1 max-w-prose text-[0.8125rem] leading-relaxed text-muted">
          These are what the officer checks against the public registers. They are
          never shown to buyers.
        </p>

        <div className="mt-4">
          {editable ? (
            <ProjectDocumentUploader
              projectId={project.id}
              slots={documentSlots(project.stage)}
              present={documentsByKind}
            />
          ) : (
            <ul className="space-y-1.5">
              {project.documents.map((doc) => (
                <li key={doc.id} className="text-[0.8125rem] text-muted">
                  <span className="text-ink">{DOCUMENT_LABEL[doc.kind] ?? doc.kind}</span> —{' '}
                  {doc.originalFilename}
                </li>
              ))}
            </ul>
          )}
        </div>
      </section>

      {/* --- Submit --- */}
      {editable && (
        <section className="mt-9 rounded-card border border-line bg-surface px-5 py-5">
          <h3 className="text-[1rem] font-semibold text-ink">Send for verification</h3>
          <p className="mt-1 max-w-prose text-[0.8125rem] leading-relaxed text-muted">
            An officer checks the RERA registration against the register, the
            sanctioned plan against the authority that issued it, and the land
            title. Buyers see the result on the project page.
          </p>
          <div className="mt-4">
            <SubmitProject projectId={project.id} blockers={blockers} />
          </div>
        </section>
      )}

      {/* --- What was checked --- */}
      {latestDecision && latestDecision.checks.length > 0 && (
        <section className="mt-9" aria-labelledby="checks">
          <h3 id="checks" className="text-[1rem] font-semibold text-ink">
            What we checked
          </h3>
          <ul className="mt-3 space-y-2">
            {latestDecision.checks.map((check) => (
              <li key={check.kind} className="flex gap-2 text-[0.8125rem]">
                <span
                  aria-hidden="true"
                  className={check.passed ? 'text-verify-ink' : 'text-faint'}
                >
                  {check.passed ? '✓' : '–'}
                </span>
                <span className={check.passed ? 'text-ink' : 'text-muted'}>
                  {CHECK_LABEL[check.kind] ?? check.kind}
                  {check.note && <span className="block text-faint">{check.note}</span>}
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}

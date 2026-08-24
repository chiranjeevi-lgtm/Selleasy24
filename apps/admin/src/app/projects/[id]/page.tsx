import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { adminApi, ApiError, projectDocumentUrl, type ReviewProject } from '@/lib/api';
import { ConsoleShell } from '@/components/console-shell';
import { formatArea, formatDate, formatRupees } from '@/lib/format';
import { ProjectDecisionForm, type ProjectCheckSpec } from './project-decision-form';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Project review' };

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000';

function photoUrl(url: string): string {
  return url.startsWith('http') ? url : `${API_BASE}${url}`;
}

const DOC_LABEL: Record<string, string> = {
  RERA_CERTIFICATE: 'TS-RERA certificate',
  APPROVED_PLAN: 'Sanctioned building plan',
  OCCUPANCY_CERTIFICATE: 'Occupancy certificate',
  COMPLETION_CERTIFICATE: 'Completion certificate',
  NOC: 'No-objection certificate',
  SOCIETY_NOC: 'Society NOC',
};

const STAGE_LABEL: Record<string, string> = {
  PRE_LAUNCH: 'Pre-launch',
  UNDER_CONSTRUCTION: 'Under construction',
  NEARING_POSSESSION: 'Nearing possession',
  READY_TO_MOVE: 'Ready to move',
  DELIVERED: 'Delivered',
};

/** "1 tower", "3 towers". Both nouns here are regular. */
function plural(count: number, noun: string): string {
  return `${count} ${noun}${count === 1 ? '' : 's'}`;
}

/**
 * Pairs each check with the claim it tests and the document that settles it.
 *
 * Which checks are *mandatory* comes from `requiredChecks` on the API response,
 * not from a rule repeated here. The API decides that from the project's stage
 * and refuses an approval that does not satisfy it — a second copy of the rule
 * in this file could disagree, and the officer would be the one caught out.
 */
function buildChecks(project: ReviewProject): ProjectCheckSpec[] {
  const kinds = new Set(project.documents.map((doc) => doc.kind));
  const has = (kind: string) => kinds.has(kind);
  const required = new Set(project.requiredChecks);

  const location = `${project.address}, ${project.neighborhood.name} ${project.pincode}`;

  const specs: Array<Omit<ProjectCheckSpec, 'mandatory'>> = [
    {
      kind: 'PROJECT_RERA_VALID',
      label: 'Registered with TS-RERA and the registration is current',
      // The number itself, so the officer can copy it into the register rather
      // than reading it off a different screen.
      claim: project.reraNumber,
      evidence: ['TS-RERA certificate'],
      evidenceAvailable: has('RERA_CERTIFICATE'),
    },
    {
      kind: 'PROJECT_PLAN_SANCTIONED',
      label: 'Building plan sanctioned by the competent authority',
      claim: project.approvingAuthority
        ? [
            project.approvingAuthority,
            project.totalTowers && plural(project.totalTowers, 'tower'),
            project.totalUnits && plural(project.totalUnits, 'unit'),
          ]
            .filter(Boolean)
            .join(' · ')
        : 'No authority stated',
      evidence: ['Sanctioned building plan'],
      evidenceAvailable: has('APPROVED_PLAN'),
    },
    {
      kind: 'PROJECT_LAND_TITLE_CLEAR',
      label: 'Land title clear and development rights held',
      claim: location,
      evidence: ['Sanctioned building plan', 'TS-RERA certificate'],
      evidenceAvailable: has('APPROVED_PLAN') || has('RERA_CERTIFICATE'),
    },
    {
      kind: 'PROJECT_COMMENCEMENT_CERTIFICATE',
      label: 'Commencement certificate issued',
      claim: STAGE_LABEL[project.stage] ?? project.stage,
      evidence: ['Sanctioned building plan'],
      evidenceAvailable: has('APPROVED_PLAN'),
    },
    {
      kind: 'PROJECT_OCCUPANCY_CERTIFICATE',
      label: 'Occupancy certificate issued',
      claim: project.deliveredOn
        ? `Handed over ${formatDate(project.deliveredOn)}`
        : (STAGE_LABEL[project.stage] ?? project.stage),
      evidence: ['Occupancy certificate'],
      evidenceAvailable: has('OCCUPANCY_CERTIFICATE'),
    },
  ];

  return (
    specs
      .map((spec) => ({ ...spec, mandatory: required.has(spec.kind) }))
      /*
       * A check that is neither required at this stage nor has a document is
       * noise on the worksheet — an officer reviewing a pre-launch project does
       * not need an occupancy row they can only mark N/A.
       */
      .filter((spec) => spec.mandatory || spec.evidenceAvailable)
  );
}

export default async function ProjectReviewPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  let user;
  let project: ReviewProject;
  try {
    [user, project] = await Promise.all([adminApi.me(), adminApi.reviewProject(id)]);
  } catch (error) {
    if (error instanceof ApiError) {
      if (error.status === 401 || error.status === 403) redirect('/login');
      if (error.status === 404) notFound();
    }
    throw error;
  }

  const checks = buildChecks(project);
  const decidable = project.status === 'PENDING_REVIEW';

  return (
    <ConsoleShell user={user} active="projects">
      <nav className="mb-5 text-[0.8125rem]">
        <Link href="/projects" className="text-indigo hover:underline">
          Projects
        </Link>
        <span className="mx-2 text-graphite-light" aria-hidden="true">
          /
        </span>
        <span className="text-graphite">{project.name}</span>
      </nav>

      <div className="grid gap-8 lg:grid-cols-[1fr_20rem]">
        {/* ---------------- Left: evidence and decision ---------------- */}
        <div className="min-w-0">
          <h1 className="font-display text-[1.375rem] font-extrabold leading-tight tracking-tight text-ink">
            {project.name}
          </h1>
          <p className="mt-1.5 text-[0.875rem] text-graphite">
            Submitted {formatDate(project.submittedAt)} · status{' '}
            {project.status.toLowerCase().replace('_', ' ')}
          </p>

          {!decidable && (
            <div className="mt-4 border-l-2 border-indigo bg-paper px-3.5 py-3">
              <p className="text-[0.8125rem] leading-relaxed text-ink">
                This project is not awaiting a decision. Only submissions in
                review can be approved or rejected.
              </p>
            </div>
          )}

          <section className="mt-7" aria-labelledby="docs-heading">
            <h2 id="docs-heading" className="stamp-label text-graphite">
              Documents ({project.documents.length})
            </h2>
            <p className="mt-2 text-[0.75rem] text-graphite-light">
              Opening a document is recorded against your account.
            </p>

            {project.documents.length === 0 ? (
              <p className="mt-3 text-[0.8125rem] text-seal">
                No documents were supplied. This cannot be approved.
              </p>
            ) : (
              <ul className="mt-3 divide-y divide-paper-edge border border-paper-edge bg-paper">
                {project.documents.map((doc) => (
                  <li
                    key={doc.id}
                    className="flex flex-wrap items-center justify-between gap-3 px-3.5 py-2.5"
                  >
                    <div className="min-w-0">
                      <p className="text-[0.8125rem] text-ink">
                        {DOC_LABEL[doc.kind] ?? doc.kind}
                      </p>
                      <p className="text-[0.6875rem] text-graphite-light tabular">
                        {doc.originalFilename} · {Math.ceil(doc.sizeBytes / 1024)} KB
                      </p>
                    </div>
                    <a
                      href={projectDocumentUrl(doc.id)}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="shrink-0 border border-indigo px-3 py-1 text-[0.75rem] text-indigo transition-colors hover:bg-indigo hover:text-paper"
                    >
                      Open
                    </a>
                  </li>
                ))}
              </ul>
            )}
          </section>

          {/* What the builder is claiming to sell. Sits above the decision so
              the configuration table and the sanctioned plan can be compared. */}
          <section className="mt-8" aria-labelledby="units-heading">
            <h2 id="units-heading" className="stamp-label text-graphite">
              Configurations ({project.units.length})
            </h2>
            <div className="mt-3 overflow-x-auto border border-paper-edge bg-paper">
              <table className="w-full min-w-[30rem] border-collapse text-[0.8125rem]">
                <thead>
                  <tr className="border-b border-paper-edge">
                    {['Configuration', 'Built-up', 'Carpet', 'From', 'Units'].map((heading) => (
                      <th
                        key={heading}
                        scope="col"
                        className="stamp-label px-3.5 py-2 text-left text-graphite-light"
                      >
                        {heading}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {project.units.map((unit) => (
                    <tr key={unit.id} className="border-b border-paper-edge last:border-0">
                      <th scope="row" className="px-3.5 py-2.5 text-left font-medium text-ink">
                        {unit.bedrooms} BHK
                      </th>
                      <td className="px-3.5 py-2.5 tabular text-graphite">
                        {formatArea(unit.areaSqft)}
                      </td>
                      <td className="px-3.5 py-2.5 tabular text-graphite">
                        {unit.carpetAreaSqft === null ? '—' : formatArea(unit.carpetAreaSqft)}
                      </td>
                      <td className="px-3.5 py-2.5 tabular text-ink">
                        {formatRupees(Math.round(Number(unit.priceFrom)))}
                      </td>
                      <td className="px-3.5 py-2.5 tabular text-graphite">
                        {unit.totalUnits ?? '—'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          {decidable && (
            <div className="mt-8 border-t border-paper-edge pt-7">
              <ProjectDecisionForm projectId={project.id} checks={checks} />
            </div>
          )}

          {project.verifications.length > 0 && (
            <section
              className="mt-8 border-t border-paper-edge pt-6"
              aria-labelledby="prior-heading"
            >
              <h2 id="prior-heading" className="stamp-label text-graphite">
                Decision history
              </h2>
              <ul className="mt-3 space-y-3">
                {project.verifications.map((decision) => (
                  <li key={decision.id} className="border border-paper-edge bg-paper px-3.5 py-3">
                    <p className="text-[0.8125rem] text-ink">
                      {decision.decision.toLowerCase().replace(/_/g, ' ')} by{' '}
                      {decision.verifier.fullName} · {formatDate(decision.createdAt)}
                    </p>
                    {decision.reason && (
                      <p className="mt-1.5 text-[0.75rem] text-graphite">
                        Told the builder: {decision.reason}
                      </p>
                    )}
                    {decision.internalNotes && (
                      <p className="mt-1 text-[0.75rem] text-graphite-light">
                        Internal: {decision.internalNotes}
                      </p>
                    )}
                  </li>
                ))}
              </ul>
            </section>
          )}
        </div>

        {/* ---------------- Right: the claims being tested ---------------- */}
        <aside className="min-w-0 space-y-6">
          <section aria-labelledby="builder-heading">
            <h2 id="builder-heading" className="stamp-label text-graphite">
              Builder
            </h2>
            <dl className="mt-3 space-y-2 border border-paper-edge bg-paper px-3.5 py-3 text-[0.8125rem]">
              <Row label="Name" value={project.builder.fullName} />
              <Row label="Email" value={project.builder.email} />
              <Row label="Phone" value={project.builder.phone ?? 'None'} />
              <Row
                label="Promoter RERA"
                value={project.builder.reraNumber ?? 'Not supplied'}
                alert={!project.builder.reraNumber}
              />
              <Row
                label="Phone verified"
                value={project.builder.isPhoneVerified ? 'Yes' : 'No'}
                alert={!project.builder.isPhoneVerified}
              />
              {/* Prior submissions are a signal worth having in view: a first
                  project from an unknown promoter deserves more scrutiny. */}
              <Row
                label="Projects filed"
                value={String(project.builder._count.builderProjects)}
              />
              <Row label="Account since" value={formatDate(project.builder.createdAt) ?? '—'} />
            </dl>
          </section>

          <section aria-labelledby="claims-heading">
            <h2 id="claims-heading" className="stamp-label text-graphite">
              What is claimed
            </h2>
            <dl className="mt-3 space-y-2 border border-paper-edge bg-paper px-3.5 py-3 text-[0.8125rem]">
              <Row label="Project RERA" value={project.reraNumber} />
              <Row label="Stage" value={STAGE_LABEL[project.stage] ?? project.stage} />
              <Row label="Authority" value={project.approvingAuthority ?? 'Not stated'} />
              <Row label="Address" value={project.address} />
              <Row label="Pincode" value={project.pincode} />
              <Row
                label="Possession"
                value={
                  project.deliveredOn
                    ? `Delivered ${formatDate(project.deliveredOn)}`
                    : (formatDate(project.possessionDate) ?? 'Not stated')
                }
              />
              <Row label="Towers" value={project.totalTowers === null ? '—' : String(project.totalTowers)} />
              <Row label="Units" value={project.totalUnits === null ? '—' : String(project.totalUnits)} />
              <Row
                label="Land"
                value={project.landAreaAcres === null ? '—' : `${Number(project.landAreaAcres)} acres`}
              />
            </dl>
          </section>

          {project.photos.length > 0 && (
            <section aria-labelledby="photos-heading">
              <h2 id="photos-heading" className="stamp-label text-graphite">
                Photographs ({project.photos.length})
              </h2>
              <ul className="mt-3 grid grid-cols-3 gap-1.5">
                {project.photos.map((photo) => (
                  <li key={photo.id} className="relative aspect-[4/3] overflow-hidden bg-console">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={photoUrl(photo.url)}
                      alt=""
                      className="h-full w-full object-cover"
                      loading="lazy"
                    />
                    {/* Whether an image is a render is a claim the builder made
                        at upload, and it is published to buyers — so it is one
                        more thing to check rather than take on trust. */}
                    {photo.isRender && (
                      <span className="absolute bottom-0.5 left-0.5 bg-ink/70 px-1 text-[0.5625rem] text-paper">
                        render
                      </span>
                    )}
                  </li>
                ))}
              </ul>
            </section>
          )}
        </aside>
      </div>
    </ConsoleShell>
  );
}

function Row({ label, value, alert }: { label: string; value: string; alert?: boolean }) {
  return (
    <div className="flex justify-between gap-3">
      <dt className="shrink-0 text-graphite-light">{label}</dt>
      <dd className={`min-w-0 break-words text-right ${alert ? 'text-seal' : 'text-ink'}`}>
        {value}
      </dd>
    </div>
  );
}

import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { api, ApiError } from '@/lib/api';
import { ProjectContactPanel } from '@/components/project-contact-panel';
import { ProjectEndorsement } from '@/components/project-endorsement';
import { serverApi } from '@/lib/server-api';
import {
  PROJECT_STAGE_LABEL,
  formatAcres,
  formatArea,
  formatConfigurations,
  formatDate,
  formatPossession,
  formatPriceRange,
  formatRupeesShort,
} from '@/lib/format';

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000';

function photoUrl(url: string): string {
  return url.startsWith('http') ? url : `${API_BASE}${url}`;
}

/** Amenity enum values written the way a brochure writes them. */
const AMENITY_LABEL: Record<string, string> = {
  LIFT: 'Lift',
  POWER_BACKUP: 'Power backup',
  SECURITY: '24×7 security',
  CCTV: 'CCTV',
  GATED_COMMUNITY: 'Gated community',
  GYM: 'Gym',
  SWIMMING_POOL: 'Swimming pool',
  CLUBHOUSE: 'Clubhouse',
  CHILDRENS_PLAY_AREA: 'Children’s play area',
  PARK: 'Park',
  WATER_SUPPLY_24_7: '24×7 water supply',
  BOREWELL: 'Borewell',
  RAINWATER_HARVESTING: 'Rainwater harvesting',
  SOLAR_WATER_HEATER: 'Solar water heater',
  INTERCOM: 'Intercom',
  FIRE_SAFETY: 'Fire safety',
  VISITOR_PARKING: 'Visitor parking',
  MAINTENANCE_STAFF: 'Maintenance staff',
  WASTE_DISPOSAL: 'Waste disposal',
  VAASTU_COMPLIANT: 'Vaastu compliant',
};

interface PageProps {
  params: Promise<{ id: string }>;
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { id } = await params;
  try {
    const project = await api.project(id);
    const configurations = formatConfigurations(project.bedrooms);
    return {
      title: `${project.name} — ${configurations ?? 'New project'} in ${project.locality}`,
      description: project.description.slice(0, 155),
    };
  } catch {
    return { title: 'Project' };
  }
}

export default async function ProjectPage({ params }: PageProps) {
  const { id } = await params;

  let project;
  try {
    project = await api.project(id);
  } catch (error) {
    if (error instanceof ApiError && error.status === 404) notFound();
    throw error;
  }

  // Null for a signed-out visitor, which is a normal state on a public page —
  // browsing projects works perfectly well without an account.
  const [verification, me] = await Promise.all([
    api.projectVerification(id).catch(() => null),
    serverApi.me().catch(() => null),
  ]);

  const price = formatPriceRange(project.priceFrom, project.priceTo);
  const configurations = formatConfigurations(project.bedrooms);
  const possession = formatPossession(project.possessionDate, project.deliveredOn);
  const isDelivered = project.stage === 'DELIVERED';

  /*
   * Remaining inventory across the whole project. Null when no configuration
   * records it — "we did not say" and "none left" are different claims, and
   * showing the second for the first would tell a buyer the project is sold out
   * when nobody said that.
   */
  const available = project.units.some((unit) => unit.availableUnits !== null)
    ? project.units.reduce((sum, unit) => sum + (unit.availableUnits ?? 0), 0)
    : null;

  const [cover, ...rest] = project.photos;

  return (
    <div className="mx-auto max-w-[76rem] px-5 py-6 sm:px-8">
      <nav aria-label="Breadcrumb" className="mb-5 text-[0.875rem]">
        <Link href="/" className="text-muted transition-colors hover:text-ink">
          Homes
        </Link>
        <span className="mx-2 text-faint" aria-hidden="true">/</span>
        <Link href="/projects" className="text-muted transition-colors hover:text-ink">
          New projects
        </Link>
        <span className="mx-2 text-faint" aria-hidden="true">/</span>
        <span className="text-ink">{project.locality}</span>
      </nav>

      {cover && (
        <div className="grid gap-2 overflow-hidden rounded-card sm:grid-cols-[2fr_1fr] sm:gap-2">
          <div className="relative aspect-[4/3] overflow-hidden bg-canvas-deep sm:aspect-[3/2]">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={photoUrl(cover.url)} alt="" className="h-full w-full object-cover" />
            {cover.isRender && (
              <span className="absolute bottom-3 left-3 rounded-full bg-ink/60 px-3 py-1 text-[0.75rem] font-medium text-white backdrop-blur-sm">
                Artist’s impression
              </span>
            )}
          </div>

          {rest.length > 0 && (
            <div className="hidden min-h-0 grid-rows-2 gap-2 sm:grid">
              {rest.slice(0, 2).map((photo, i) => (
                <div key={photo.id} className="relative min-h-0 overflow-hidden bg-canvas-deep">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={photoUrl(photo.url)}
                    alt=""
                    className="absolute inset-0 h-full w-full object-cover"
                    loading="lazy"
                  />
                  {i === 1 && rest.length > 2 && (
                    <span className="absolute bottom-3 right-3 rounded-full bg-ink/60 px-3 py-1 text-[0.75rem] font-medium text-white backdrop-blur-sm tabular">
                      +{rest.length - 2} more
                    </span>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      <div className="mt-8 grid gap-10 lg:grid-cols-[1fr_22rem]">
        {/* ---------------- Main ---------------- */}
        <div className="min-w-0">
          <span className="label rounded-full bg-canvas-deep px-2.5 py-1 text-ink">
            {PROJECT_STAGE_LABEL[project.stage] ?? project.stage}
          </span>

          <h1 className="mt-3 display text-[1.75rem] text-ink sm:text-[2.125rem]">
            {project.name}
          </h1>
          <p className="mt-2.5 text-[0.9375rem] text-muted">
            {project.address} · <span className="tabular">{project.pincode}</span>
          </p>

          <dl className="mt-7 grid grid-cols-2 gap-x-6 gap-y-5 border-y border-line py-6 sm:grid-cols-4">
            {[
              { label: 'Configurations', value: configurations ?? '—' },
              {
                label: 'Land area',
                value: formatAcres(project.landAreaAcres) ?? '—',
              },
              {
                label: 'Towers',
                value: project.totalTowers === null ? '—' : String(project.totalTowers),
              },
              {
                label: 'Total units',
                value: project.totalUnits === null ? '—' : String(project.totalUnits),
              },
            ].map((item) => (
              <div key={item.label}>
                <dt className="label text-faint">{item.label}</dt>
                <dd className="mt-1.5 text-[1.0625rem] font-semibold text-ink tabular">
                  {item.value}
                </dd>
              </div>
            ))}
          </dl>

          <section className="mt-8" aria-labelledby="about">
            <h2 id="about" className="display text-[1.25rem] text-ink">
              About this project
            </h2>
            <p className="mt-3 max-w-prose whitespace-pre-line text-[1rem] leading-[1.7] text-ink/85">
              {project.description}
            </p>
          </section>

          {/* --- Configurations --- */}
          <section className="mt-10" aria-labelledby="units">
            <h2 id="units" className="display text-[1.25rem] text-ink">
              What is available
            </h2>
            <p className="mt-2 max-w-prose text-[0.875rem] leading-relaxed text-muted">
              Prices start from the figures below. Where a unit sits in the tower
              — its floor, facing and view — changes the final number, which is
              why a builder quotes a starting price rather than one price.
            </p>

            {/* Scrolls inside itself rather than widening the page on a phone. */}
            <div className="mt-4 overflow-x-auto rounded-card border border-line">
              <table className="w-full min-w-[34rem] border-collapse text-[0.875rem]">
                <thead>
                  <tr className="border-b border-line bg-canvas">
                    <th scope="col" className="label px-4 py-3 text-left text-faint">
                      Configuration
                    </th>
                    <th scope="col" className="label px-4 py-3 text-right text-faint">
                      Built-up
                    </th>
                    <th scope="col" className="label px-4 py-3 text-right text-faint">
                      Carpet
                    </th>
                    <th scope="col" className="label px-4 py-3 text-right text-faint">
                      From
                    </th>
                    <th scope="col" className="label px-4 py-3 text-right text-faint">
                      Available
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {project.units.map((unit) => (
                    <tr key={unit.id} className="border-b border-line last:border-0">
                      <th scope="row" className="px-4 py-3.5 text-left font-medium text-ink">
                        {unit.bedrooms} BHK
                        <span className="ml-1.5 font-normal text-muted">
                          {unit.bathrooms} bath
                        </span>
                      </th>
                      <td className="px-4 py-3.5 text-right tabular text-ink">
                        {formatArea(unit.areaSqft)}
                      </td>
                      <td className="px-4 py-3.5 text-right tabular text-muted">
                        {unit.carpetAreaSqft === null ? '—' : formatArea(unit.carpetAreaSqft)}
                      </td>
                      <td className="px-4 py-3.5 text-right font-semibold tabular text-action">
                        {formatRupeesShort(unit.priceFrom)}
                      </td>
                      <td className="px-4 py-3.5 text-right tabular">
                        {unit.availableUnits === null ? (
                          <span className="text-faint">—</span>
                        ) : unit.availableUnits === 0 ? (
                          <span className="text-muted">Sold out</span>
                        ) : (
                          <span className="text-ink">
                            {unit.availableUnits}
                            {unit.totalUnits !== null && (
                              <span className="text-faint"> of {unit.totalUnits}</span>
                            )}
                          </span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          {project.amenities.length > 0 && (
            <section className="mt-10" aria-labelledby="amenities">
              <h2 id="amenities" className="display text-[1.25rem] text-ink">
                Amenities
              </h2>
              <ul className="mt-4 flex flex-wrap gap-2">
                {project.amenities.map((amenity) => (
                  <li
                    key={amenity}
                    className="rounded-full border border-line px-3 py-1.5 text-[0.8125rem] text-ink"
                  >
                    {AMENITY_LABEL[amenity] ?? amenity}
                  </li>
                ))}
              </ul>
            </section>
          )}
        </div>

        {/* ---------------- Sidebar ---------------- */}
        <aside className="lg:sticky lg:top-24 lg:self-start">
          <div className="rounded-card bg-surface px-5 py-5 shadow-card">
            {price ? (
              <p className="display text-[1.875rem] leading-none text-ink tabular">{price}</p>
            ) : (
              <p className="text-[1rem] text-muted">Price on request</p>
            )}

            {possession && (
              <p className="mt-2.5 text-[0.875rem] text-muted">{possession}</p>
            )}

            <dl className="mt-4 space-y-2 border-t border-line pt-4 text-[0.875rem]">
              <div className="flex justify-between gap-3">
                <dt className="text-muted">Built by</dt>
                <dd className="text-right font-medium text-ink">{project.builder.name}</dd>
              </div>
              {project.approvingAuthority && (
                <div className="flex justify-between gap-3">
                  <dt className="text-muted">Approved by</dt>
                  <dd className="font-medium text-ink">{project.approvingAuthority}</dd>
                </div>
              )}
              {available !== null && (
                <div className="flex justify-between gap-3">
                  <dt className="text-muted">Units left</dt>
                  <dd className="font-medium text-ink tabular">
                    {available === 0 ? 'None' : available}
                  </dd>
                </div>
              )}
              {project.firstListedAt && (
                <div className="flex justify-between gap-3">
                  <dt className="text-muted">On SellEasy24 since</dt>
                  <dd className="font-medium text-ink">{formatDate(project.firstListedAt)}</dd>
                </div>
              )}
            </dl>

            {/*
              A delivered project with nothing left is track record, not stock,
              so it says so rather than offering a form that leads nowhere.
            */}
            {(isDelivered || available === 0) && (
              <p className="mt-4 rounded-control bg-canvas px-3.5 py-3 text-[0.875rem] leading-relaxed text-muted">
                Nothing is available in this project. It appears here as
                completed work by {project.builder.name} — the record a buyer
                judges their current projects on.
              </p>
            )}
          </div>

          {/* Contacting the builder. Absent until now, which meant a buyer could
              read everything here and have nowhere to go. */}
          {!isDelivered && available !== 0 && (
            <div className="mt-4">
              <ProjectContactPanel
                projectId={project.id}
                projectName={project.name}
                builderName={project.builder.name}
                isSignedIn={me !== null}
                units={project.units.map((unit) => ({
                  id: unit.id,
                  bedrooms: unit.bedrooms,
                  areaSqft: unit.areaSqft,
                  priceFrom: unit.priceFrom,
                  availableUnits: unit.availableUnits,
                }))}
                {...(me?.fullName && { buyerName: me.fullName })}
                {...(me?.phone !== undefined && { buyerPhone: me.phone })}
              />
            </div>
          )}

          {verification && (
            <div className="mt-4">
              <ProjectEndorsement record={verification} />
            </div>
          )}
        </aside>
      </div>
    </div>
  );
}

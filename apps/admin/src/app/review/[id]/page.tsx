import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { adminApi, ApiError, documentUrl, type ReviewListing } from '@/lib/api';
import { ConsoleShell } from '@/components/console-shell';
import { formatArea, formatDate, formatRupees } from '@/lib/format';
import { DecisionForm, type CheckSpec } from './decision-form';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Review' };

const DOC_LABEL: Record<string, string> = {
  SALE_DEED: 'Sale deed',
  ID_PROOF: 'Identity proof',
  PROPERTY_TAX_RECEIPT: 'Property tax receipt',
  ENCUMBRANCE_CERTIFICATE: 'Encumbrance certificate',
  NOC: 'NOC',
  APPROVED_PLAN: 'Approved plan',
  RERA_CERTIFICATE: 'RERA certificate',
  OCCUPANCY_CERTIFICATE: 'Occupancy certificate',
  COMPLETION_CERTIFICATE: 'Completion certificate',
  SOCIETY_NOC: 'Society NOC',
};

/**
 * Pairs each check with the claim it tests and the documents that settle it.
 *
 * Built from the listing so the panel reflects what was actually supplied — a
 * check whose document is missing is presented as such, rather than as something
 * the verifier can simply tick.
 */
function buildChecks(listing: ReviewListing): CheckSpec[] {
  const kinds = new Set(listing.documents.map((doc) => doc.kind));
  const has = (kind: string) => kinds.has(kind);

  const location = `${listing.property.address}, ${listing.property.neighborhood.name} ${listing.property.pincode}`;

  const specs: CheckSpec[] = [
    {
      kind: 'OWNER_NAME_MATCHES_DEED',
      label: 'Owner name on identity proof matches the sale deed',
      claim: listing.seller.fullName,
      evidence: ['Identity proof', 'Sale deed'],
      mandatory: true,
      evidenceAvailable: has('ID_PROOF') && has('SALE_DEED'),
    },
    {
      kind: 'DEED_REGISTERED_AND_STAMPED',
      label: 'Sale deed is registered and properly stamped',
      claim: null,
      evidence: ['Sale deed'],
      mandatory: true,
      evidenceAvailable: has('SALE_DEED'),
    },
    {
      kind: 'PROPERTY_TAX_CURRENT',
      label: 'Property tax is paid and current',
      claim: null,
      evidence: ['Property tax receipt'],
      mandatory: true,
      evidenceAvailable: has('PROPERTY_TAX_RECEIPT'),
    },
    {
      kind: 'LOCATION_MATCHES_DOCUMENTS',
      label: 'Address matches the location recorded in the documents',
      claim: location,
      evidence: ['Sale deed'],
      mandatory: true,
      evidenceAvailable: has('SALE_DEED'),
    },
    {
      kind: 'NO_ENCUMBRANCE_FOUND',
      label: 'No mortgage, lien or legal dispute on the encumbrance certificate',
      claim: null,
      evidence: ['Encumbrance certificate'],
      mandatory: false,
      evidenceAvailable: has('ENCUMBRANCE_CERTIFICATE'),
    },
  ];

  // RERA is only relevant when an agent is listing on someone's behalf.
  if (listing.seller.sellerKind === 'BROKER') {
    specs.push({
      kind: 'RERA_REGISTERED',
      label: 'Agent is RERA-registered',
      claim: listing.seller.reraNumber ?? 'No number supplied',
      evidence: ['RERA certificate'],
      mandatory: false,
      evidenceAvailable: has('RERA_CERTIFICATE'),
    });
  }

  return specs;
}

export default async function ReviewPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  let user;
  let listing: ReviewListing;
  try {
    [user, listing] = await Promise.all([adminApi.me(), adminApi.review(id)]);
  } catch (error) {
    if (error instanceof ApiError) {
      if (error.status === 401 || error.status === 403) redirect('/login');
      if (error.status === 404) notFound();
    }
    throw error;
  }

  const checks = buildChecks(listing);
  const decidable = listing.status === 'PENDING_REVIEW';
  const priorDecisions = listing.verifications;

  return (
    <ConsoleShell user={user} active="queue">
      <nav className="mb-5 text-[0.8125rem]">
        <Link href="/queue" className="text-indigo hover:underline">
          Review queue
        </Link>
        <span className="mx-2 text-graphite-light" aria-hidden="true">
          /
        </span>
        <span className="text-graphite">{listing.property.neighborhood.name}</span>
      </nav>

      <div className="grid gap-8 lg:grid-cols-[1fr_20rem]">
        {/* ---------------- Left: claims + evidence + decision ---------------- */}
        <div className="min-w-0">
          <h1 className="font-display text-[1.375rem] font-extrabold leading-tight tracking-tight text-ink">
            {listing.title}
          </h1>
          <p className="mt-1.5 text-[0.875rem] text-graphite">
            Submitted {formatDate(listing.submittedAt)} · status{' '}
            {listing.status.toLowerCase().replace('_', ' ')}
          </p>

          {!decidable && (
            <div className="mt-4 border-l-2 border-indigo bg-paper px-3.5 py-3">
              <p className="text-[0.8125rem] leading-relaxed text-ink">
                This listing is not awaiting a decision. Only submissions in review
                can be approved or rejected.
              </p>
            </div>
          )}

          {/* Documents first: they are the thing the verifier actually works from. */}
          <section className="mt-7" aria-labelledby="docs-heading">
            <h2 id="docs-heading" className="stamp-label text-graphite">
              Documents ({listing.documents.length})
            </h2>
            <p className="mt-2 text-[0.75rem] text-graphite-light">
              Opening a document is recorded against your account.
            </p>

            {listing.documents.length === 0 ? (
              <p className="mt-3 text-[0.8125rem] text-seal">
                No documents were supplied. This cannot be approved.
              </p>
            ) : (
              <ul className="mt-3 divide-y divide-paper-edge border border-paper-edge bg-paper">
                {listing.documents.map((doc) => (
                  <li
                    key={doc.id}
                    className="flex flex-wrap items-center justify-between gap-3 px-3.5 py-2.5"
                  >
                    <div className="min-w-0">
                      <p className="text-[0.8125rem] text-ink">
                        {DOC_LABEL[doc.kind] ?? doc.kind}
                        {doc.idProofKind && (
                          <span className="text-graphite">
                            {' '}
                            · {doc.idProofKind.replace(/_/g, ' ').toLowerCase()}
                          </span>
                        )}
                      </p>
                      <p className="text-[0.6875rem] text-graphite-light tabular">
                        {doc.originalFilename} · {Math.ceil(doc.sizeBytes / 1024)} KB
                      </p>
                    </div>
                    <a
                      href={documentUrl(doc.id)}
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

          {decidable && (
            <div className="mt-8 border-t border-paper-edge pt-7">
              <DecisionForm listingId={listing.id} checks={checks} />
            </div>
          )}

          {priorDecisions.length > 0 && (
            <section className="mt-8 border-t border-paper-edge pt-6" aria-labelledby="prior-heading">
              <h2 id="prior-heading" className="stamp-label text-graphite">
                Decision history
              </h2>
              <ul className="mt-3 space-y-3">
                {priorDecisions.map((decision) => (
                  <li key={decision.id} className="border border-paper-edge bg-paper px-3.5 py-3">
                    <p className="text-[0.8125rem] text-ink">
                      {decision.decision.toLowerCase().replace(/_/g, ' ')} by{' '}
                      {decision.verifier.fullName} · {formatDate(decision.createdAt)}
                    </p>
                    {decision.reason && (
                      <p className="mt-1.5 text-[0.75rem] text-graphite">
                        Told the seller: {decision.reason}
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

        {/* ---------------- Right: what the seller claims ---------------- */}
        <aside className="lg:sticky lg:top-6 lg:self-start">
          <section className="border border-paper-edge bg-paper px-4 py-4" aria-labelledby="claims-heading">
            <h2 id="claims-heading" className="stamp-label text-graphite">
              What the seller states
            </h2>
            <dl className="mt-3 space-y-2 text-[0.8125rem]">
              {[
                ['Name', listing.seller.fullName],
                ['Listing as', listing.seller.sellerKind === 'BROKER' ? 'Agent' : 'Owner'],
                ['RERA number', listing.seller.reraNumber ?? '—'],
                ['Phone', listing.seller.phone ?? '—'],
                ['Email', listing.seller.email],
                ['Email verified', listing.seller.isEmailVerified ? 'Yes' : 'No'],
                ['Address', listing.property.address],
                ['Locality', `${listing.property.neighborhood.name} ${listing.property.pincode}`],
                ['Asking price', formatRupees(Number(listing.price))],
                ['Area', formatArea(listing.property.areaSqft)],
                ['Configuration', `${listing.property.bedrooms} BHK`],
                [
                  'Year built',
                  listing.property.yearBuilt ? String(listing.property.yearBuilt) : '—',
                ],
              ].map(([label, value]) => (
                <div key={label} className="flex justify-between gap-3">
                  <dt className="shrink-0 text-graphite">{label}</dt>
                  <dd className="text-right text-ink">{value}</dd>
                </div>
              ))}
            </dl>
          </section>

          {/* Seller history is a fraud signal — a brand-new account with many
              listings warrants a closer look than a long-standing one. */}
          <section className="mt-4 border border-paper-edge bg-paper px-4 py-4">
            <h2 className="stamp-label text-graphite">Seller history</h2>
            <dl className="mt-3 space-y-2 text-[0.8125rem]">
              <div className="flex justify-between gap-3">
                <dt className="text-graphite">Account created</dt>
                <dd className="text-ink">{formatDate(listing.seller.createdAt)}</dd>
              </div>
              <div className="flex justify-between gap-3">
                <dt className="text-graphite">Total listings</dt>
                <dd className="text-ink tabular">{listing.seller._count.listings}</dd>
              </div>
            </dl>
          </section>

          {listing.photos.length > 0 && (
            <section className="mt-4" aria-label="Photos">
              <ul className="grid grid-cols-3 gap-1.5">
                {listing.photos.map((photo) => (
                  <li
                    key={photo.id}
                    className="aspect-square overflow-hidden border border-paper-edge bg-console"
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={
                        photo.url.startsWith('http')
                          ? photo.url
                          : `${process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000'}${photo.url}`
                      }
                      alt=""
                      className="h-full w-full object-cover"
                      loading="lazy"
                    />
                  </li>
                ))}
              </ul>
            </section>
          )}

          <section className="mt-4 border border-paper-edge bg-paper px-4 py-4">
            <h2 className="stamp-label text-graphite">Description</h2>
            <p className="mt-2 whitespace-pre-line text-[0.75rem] leading-relaxed text-graphite">
              {listing.description}
            </p>
          </section>
        </aside>
      </div>
    </ConsoleShell>
  );
}

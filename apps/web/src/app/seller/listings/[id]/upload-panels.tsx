'use client';

import { useActionState } from 'react';
import { useFormStatus } from 'react-dom';
import {
  confirmStillAvailable,
  submitForReview,
  uploadDocument,
  uploadPhoto,
  type ActionState,
} from '../../actions';
import { FormError } from '@/components/form-fields';

function Pending({ idle, busy }: { idle: string; busy: string }) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="bg-action px-3.5 py-1.5 text-[0.8125rem] font-medium text-surface transition-colors hover:bg-action-hover disabled:cursor-not-allowed disabled:opacity-55"
    >
      {pending ? busy : idle}
    </button>
  );
}

function Notice({ state }: { state: ActionState }) {
  if (state.ok) {
    return (
      <p role="status" className="text-[0.75rem] text-action">
        {state.ok}
      </p>
    );
  }
  return <FormError message={state.error} />;
}

const FILE_ACCEPT = 'image/jpeg,image/png,image/webp';
const DOC_ACCEPT = 'application/pdf,image/jpeg,image/png,image/webp';

const fileInputClass =
  'max-w-full text-[0.8125rem] text-muted file:mr-3 file:cursor-pointer file:rounded-control file:border file:border-line file:bg-canvas file:px-3 file:py-1.5 file:text-[0.8125rem] file:text-ink hover:file:bg-canvas-deep';

export function PhotoUploader({
  listingId,
  count,
}: {
  listingId: string;
  count: number;
}) {
  const [state, action] = useActionState<ActionState, FormData>(uploadPhoto, {});
  const remaining = Math.max(0, 3 - count);

  return (
    <form action={action} className="space-y-2.5">
      <input type="hidden" name="listingId" value={listingId} />

      <div className="flex flex-wrap items-center gap-3">
        {/* `multiple`: a seller photographs a property in one sitting and has
            eight or ten files ready. Uploading them one at a time is the kind
            of friction that gets a listing abandoned half-finished. */}
        <input
          type="file"
          name="file"
          accept={FILE_ACCEPT}
          multiple
          required
          aria-label="Choose photos"
          className={fileInputClass}
        />
        <Pending idle="Upload photos" busy="Uploading…" />
      </div>

      <p className="text-[0.6875rem] text-faint">
        JPEG, PNG or WebP, up to 5 MB each. Select several at once.{' '}
        {remaining > 0
          ? `${remaining} more needed before you can submit.`
          : 'Minimum met — add up to 15 in total.'}
      </p>

      <Notice state={state} />
    </form>
  );
}

const DOCUMENT_KINDS = [
  { value: 'SALE_DEED', label: 'Sale deed', required: true },
  { value: 'ID_PROOF', label: 'Identity proof', required: true },
  { value: 'PROPERTY_TAX_RECEIPT', label: 'Property tax receipt', required: true },
  { value: 'ENCUMBRANCE_CERTIFICATE', label: 'Encumbrance certificate', required: false },
  { value: 'APPROVED_PLAN', label: 'Approved building plan', required: false },
  { value: 'OCCUPANCY_CERTIFICATE', label: 'Occupancy certificate', required: false },
  { value: 'SOCIETY_NOC', label: 'Society NOC', required: false },
  { value: 'RERA_CERTIFICATE', label: 'RERA certificate', required: false },
];

/**
 * Identity document options.
 *
 * PAN is listed first and deliberately. Storing full Aadhaar copies carries
 * retention restrictions for private companies under Indian law, so Aadhaar is
 * never the only route — and the masked and offline variants are offered ahead of
 * a plain scan.
 */
const ID_PROOF_KINDS = [
  { value: 'PAN', label: 'PAN card' },
  { value: 'PASSPORT', label: 'Passport' },
  { value: 'DRIVING_LICENCE', label: 'Driving licence' },
  { value: 'VOTER_ID', label: 'Voter ID' },
  { value: 'AADHAAR_MASKED', label: 'Masked Aadhaar (last 4 digits only)' },
  { value: 'AADHAAR_OFFLINE_XML', label: 'Aadhaar offline XML' },
  { value: 'DIGILOCKER', label: 'DigiLocker document' },
];

export interface UploadedDocument {
  id: string;
  kind: string;
  originalFilename: string;
}

/**
 * One upload control per document type.
 *
 * The previous version was a single form with a type dropdown. It reset to its
 * first option after every upload, so uploading three documents in a row filed
 * all three as a sale deed unless the seller remembered to change the dropdown
 * each time — and nothing in the interface showed the mistake afterwards.
 *
 * A section per type removes the choice entirely: the file input sits under the
 * heading that names what it is for, and each section shows what it already
 * holds.
 */
export function DocumentUploader({
  listingId,
  documents,
}: {
  listingId: string;
  documents: UploadedDocument[];
}) {
  const byKind = new Map<string, UploadedDocument[]>();
  for (const doc of documents) {
    byKind.set(doc.kind, [...(byKind.get(doc.kind) ?? []), doc]);
  }

  return (
    <div className="space-y-4">
      {DOCUMENT_KINDS.map((kind) => (
        <DocumentSlot
          key={kind.value}
          listingId={listingId}
          kind={kind}
          existing={byKind.get(kind.value) ?? []}
        />
      ))}

      <p className="text-[0.6875rem] leading-relaxed text-faint">
        PDF or a clear photo, up to 10 MB. Documents are encrypted before they are
        stored. Only a verification officer can open them, and every time one is
        opened we record who and when.
      </p>
    </div>
  );
}

function DocumentSlot({
  listingId,
  kind,
  existing,
}: {
  listingId: string;
  kind: { value: string; label: string; required: boolean };
  existing: UploadedDocument[];
}) {
  const [state, action] = useActionState<ActionState, FormData>(uploadDocument, {});
  const isIdProof = kind.value === 'ID_PROOF';
  const satisfied = existing.length > 0;

  return (
    <form
      action={action}
      className={`rounded-card border px-4 py-3.5 ${
        satisfied ? 'border-line bg-surface' : 'border-line bg-canvas'
      }`}
    >
      <input type="hidden" name="listingId" value={listingId} />
      <input type="hidden" name="kind" value={kind.value} />

      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h4 className="text-[0.9375rem] font-semibold text-ink">
          {kind.label}
          {kind.required && !satisfied && (
            <span className="ml-2 label text-seal">Required</span>
          )}
        </h4>
        {satisfied && (
          <span className="inline-flex items-center gap-1.5 label text-verify-ink">
            <svg viewBox="0 0 16 16" aria-hidden="true" className="h-3 w-3 text-verify">
              <path
                d="M2.5 8.5 6 12l7.5-8"
                fill="none"
                stroke="currentColor"
                strokeWidth="2.5"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
            Uploaded
          </span>
        )}
      </div>

      {existing.length > 0 && (
        <ul className="mt-2 space-y-1">
          {existing.map((doc) => (
            <li key={doc.id} className="truncate text-[0.8125rem] text-muted">
              {doc.originalFilename}
            </li>
          ))}
        </ul>
      )}

      {isIdProof && (
        <label className="mt-3 block">
          <span className="text-[0.75rem] text-muted">Which identity document?</span>
          <select
            name="idProofKind"
            required
            defaultValue="PAN"
            className="mt-1 w-full rounded-control border border-line bg-surface px-2.5 py-2 text-[0.875rem] text-ink outline-none focus:border-action"
          >
            {ID_PROOF_KINDS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </label>
      )}

      <div className="mt-3 flex flex-wrap items-center gap-3">
        <input
          type="file"
          name="file"
          accept={DOC_ACCEPT}
          required
          aria-label={`Choose the ${kind.label.toLowerCase()}`}
          className={fileInputClass}
        />
        <Pending idle={satisfied ? 'Replace' : 'Upload'} busy="Encrypting…" />
      </div>

      <div className="mt-2">
        <Notice state={state} />
      </div>
    </form>
  );
}

export function SubmitForReview({
  listingId,
  blockers,
}: {
  listingId: string;
  blockers: string[];
}) {
  const [state, action] = useActionState<ActionState, FormData>(submitForReview, {});

  if (blockers.length > 0) {
    return (
      <div className="border border-line bg-surface px-4 py-4">
        <h3 className="stamp-label text-muted">Before you can submit</h3>
        <ul className="mt-2.5 space-y-1.5">
          {blockers.map((blocker) => (
            <li key={blocker} className="flex gap-2 text-[0.8125rem] text-muted">
              <span aria-hidden="true" className="text-faint">
                —
              </span>
              {blocker}
            </li>
          ))}
        </ul>
      </div>
    );
  }

  return (
    <form action={action} className="border border-line bg-surface px-4 py-4">
      <input type="hidden" name="listingId" value={listingId} />
      <h3 className="stamp-label text-muted">Ready for verification</h3>
      <p className="mt-2 text-[0.8125rem] leading-relaxed text-muted">
        An officer will compare your documents against these details, usually
        within 24 hours. You cannot edit the listing while it is in review.
      </p>
      <div className="mt-3.5">
        <Pending idle="Submit for verification" busy="Submitting…" />
      </div>
      <div className="mt-2.5">
        <Notice state={state} />
      </div>
    </form>
  );
}

/**
 * "Still available?" confirmation.
 *
 * The most common complaint about every competing portal is properties that sold
 * months ago and were never taken down. This is the one-click answer, and the
 * date it sets is shown publicly on the listing.
 */
export function ConfirmAvailability({ listingId }: { listingId: string }) {
  const [state, action] = useActionState<ActionState, FormData>(
    confirmStillAvailable,
    {},
  );

  return (
    <form action={action} className="space-y-2">
      <input type="hidden" name="listingId" value={listingId} />
      <Pending idle="Confirm it is still available" busy="Saving…" />
      <Notice state={state} />
    </form>
  );
}

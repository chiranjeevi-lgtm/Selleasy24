'use client';

import { useActionState, useState } from 'react';
import { useFormStatus } from 'react-dom';
import {
  saveUnits,
  submitProject,
  uploadProjectDocument,
  uploadProjectPhoto,
  type ProjectActionState,
} from '../actions';

const FILE_ACCEPT = 'image/jpeg,image/png,image/webp';
const DOC_ACCEPT = 'application/pdf,image/jpeg,image/png,image/webp';

const fileInputClass =
  'max-w-full text-[0.8125rem] text-muted file:mr-3 file:cursor-pointer file:rounded-control file:border file:border-line file:bg-canvas file:px-3 file:py-1.5 file:text-[0.8125rem] file:text-ink hover:file:bg-canvas-deep';

const cellClass =
  'w-full rounded-control border border-line bg-surface px-2 py-1.5 text-[0.8125rem] text-ink outline-none transition-colors focus:border-action focus:ring-2 focus:ring-action/15';

function Pending({ idle, busy }: { idle: string; busy: string }) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="rounded-control bg-action px-3.5 py-1.5 text-[0.8125rem] font-medium text-white transition-colors hover:bg-action-hover disabled:cursor-not-allowed disabled:opacity-55"
    >
      {pending ? busy : idle}
    </button>
  );
}

function Notice({ state }: { state: ProjectActionState }) {
  return (
    <>
      {state.ok && (
        <p role="status" className="text-[0.75rem] font-medium text-action">
          {state.ok}
        </p>
      )}
      {state.error && (
        <p
          role="alert"
          className="rounded-control border-l-2 border-seal bg-seal-soft px-3 py-2 text-[0.8125rem] leading-relaxed text-ink"
        >
          {state.error}
        </p>
      )}
    </>
  );
}

// ---------------------------------------------------------------------------
// Configurations
// ---------------------------------------------------------------------------

interface UnitRow {
  bedrooms: string;
  bathrooms: string;
  areaSqft: string;
  carpetAreaSqft: string;
  priceFrom: string;
  totalUnits: string;
  availableUnits: string;
}

const EMPTY_ROW: UnitRow = {
  bedrooms: '',
  bathrooms: '',
  areaSqft: '',
  carpetAreaSqft: '',
  priceFrom: '',
  totalUnits: '',
  availableUnits: '',
};

/**
 * The configuration editor.
 *
 * Rows are held in local state and the whole set is submitted at once, matching
 * the API. A builder adds and removes rows freely while filling this in, and a
 * per-row save would mean half-entered rows hitting the server.
 */
export function UnitsEditor({
  projectId,
  initial,
  editable,
}: {
  projectId: string;
  initial: UnitRow[];
  editable: boolean;
}) {
  const [state, action] = useActionState<ProjectActionState, FormData>(saveUnits, {});
  const [rows, setRows] = useState<UnitRow[]>(initial.length > 0 ? initial : [EMPTY_ROW]);

  function update(index: number, field: keyof UnitRow, value: string) {
    setRows((current) =>
      current.map((row, i) => (i === index ? { ...row, [field]: value } : row)),
    );
  }

  if (!editable) {
    return (
      <p className="text-[0.8125rem] leading-relaxed text-muted">
        Configurations cannot be changed while the project is in review or live.
        Changing what a project offers after it was checked is exactly what the
        badge is meant to prevent.
      </p>
    );
  }

  return (
    <form action={action} className="space-y-3">
      <input type="hidden" name="projectId" value={projectId} />

      <div className="overflow-x-auto">
        <table className="w-full min-w-[42rem] border-collapse text-[0.8125rem]">
          <thead>
            <tr>
              {['BHK', 'Bath', 'Built-up', 'Carpet', 'From ₹', 'Total', 'Available', ''].map(
                (heading) => (
                  <th
                    key={heading}
                    scope="col"
                    className="label pb-2 pr-2 text-left text-faint"
                  >
                    {heading}
                  </th>
                ),
              )}
            </tr>
          </thead>
          <tbody>
            {rows.map((row, index) => (
              <tr key={index}>
                <td className="pb-2 pr-2">
                  <input
                    name="bedrooms"
                    type="number"
                    min={0}
                    max={20}
                    required
                    value={row.bedrooms}
                    onChange={(e) => update(index, 'bedrooms', e.target.value)}
                    aria-label={`Bedrooms, row ${index + 1}`}
                    className={cellClass}
                  />
                </td>
                <td className="pb-2 pr-2">
                  <input
                    name="bathrooms"
                    type="number"
                    min={0}
                    max={20}
                    required
                    value={row.bathrooms}
                    onChange={(e) => update(index, 'bathrooms', e.target.value)}
                    aria-label={`Bathrooms, row ${index + 1}`}
                    className={cellClass}
                  />
                </td>
                <td className="pb-2 pr-2">
                  <input
                    name="areaSqft"
                    type="number"
                    min={100}
                    required
                    value={row.areaSqft}
                    onChange={(e) => update(index, 'areaSqft', e.target.value)}
                    aria-label={`Built-up area, row ${index + 1}`}
                    className={cellClass}
                  />
                </td>
                <td className="pb-2 pr-2">
                  <input
                    name="carpetAreaSqft"
                    type="number"
                    min={50}
                    value={row.carpetAreaSqft}
                    onChange={(e) => update(index, 'carpetAreaSqft', e.target.value)}
                    aria-label={`Carpet area, row ${index + 1}`}
                    className={cellClass}
                  />
                </td>
                <td className="pb-2 pr-2">
                  <input
                    name="priceFrom"
                    type="number"
                    min={100000}
                    required
                    value={row.priceFrom}
                    onChange={(e) => update(index, 'priceFrom', e.target.value)}
                    aria-label={`Starting price, row ${index + 1}`}
                    className={cellClass}
                  />
                </td>
                <td className="pb-2 pr-2">
                  <input
                    name="totalUnits"
                    type="number"
                    min={1}
                    value={row.totalUnits}
                    onChange={(e) => update(index, 'totalUnits', e.target.value)}
                    aria-label={`Total units, row ${index + 1}`}
                    className={cellClass}
                  />
                </td>
                <td className="pb-2 pr-2">
                  <input
                    name="availableUnits"
                    type="number"
                    min={0}
                    value={row.availableUnits}
                    onChange={(e) => update(index, 'availableUnits', e.target.value)}
                    aria-label={`Available units, row ${index + 1}`}
                    className={cellClass}
                  />
                </td>
                <td className="pb-2">
                  {rows.length > 1 && (
                    <button
                      type="button"
                      onClick={() => setRows((current) => current.filter((_, i) => i !== index))}
                      className="rounded-control px-2 py-1.5 text-[0.8125rem] text-muted transition-colors hover:text-seal"
                      aria-label={`Remove row ${index + 1}`}
                    >
                      Remove
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <button
          type="button"
          onClick={() => setRows((current) => [...current, { ...EMPTY_ROW }])}
          className="rounded-control border border-line px-3.5 py-1.5 text-[0.8125rem] font-medium text-ink transition-colors hover:bg-canvas-deep"
        >
          Add a configuration
        </button>
        <Pending idle="Save configurations" busy="Saving…" />
      </div>

      <p className="text-[0.6875rem] leading-relaxed text-faint">
        Price is what this configuration starts at. Buyers see it as
        &ldquo;from&rdquo;, because floor, facing and view change the final
        number. Leave availability blank rather than guessing — an empty cell
        reads as &ldquo;not stated&rdquo;, while a zero tells buyers it is sold
        out.
      </p>

      <Notice state={state} />
    </form>
  );
}

// ---------------------------------------------------------------------------
// Photos
// ---------------------------------------------------------------------------

export function ProjectPhotoUploader({
  projectId,
  count,
}: {
  projectId: string;
  count: number;
}) {
  const [state, action] = useActionState<ProjectActionState, FormData>(uploadProjectPhoto, {});
  const remaining = Math.max(0, 3 - count);

  return (
    <form action={action} className="space-y-2.5">
      <input type="hidden" name="projectId" value={projectId} />

      <div className="flex flex-wrap items-center gap-3">
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

      {/*
        The render flag is set at upload, not guessed later. A buyer looking at
        an unbuilt project treats a computer rendering and a site photograph very
        differently, and mislabelling one is the sort of thing that erodes trust
        quietly.
      */}
      <label className="flex items-center gap-2 text-[0.8125rem] text-ink">
        <input type="checkbox" name="isRender" className="h-4 w-4 accent-[var(--color-action)]" />
        These are artist&rsquo;s impressions, not photographs of the site
      </label>

      <p className="text-[0.6875rem] text-faint">
        JPEG, PNG or WebP, up to 5 MB each.{' '}
        {remaining > 0
          ? `${remaining} more needed before you can submit.`
          : 'You have enough to submit.'}
      </p>

      <Notice state={state} />
    </form>
  );
}

// ---------------------------------------------------------------------------
// Documents
// ---------------------------------------------------------------------------

export interface ProjectDocumentSlot {
  value: string;
  label: string;
  /**
   * The label as it reads mid-sentence, written out rather than derived.
   * Lower-casing the heading turns "TS-RERA" into "ts-rera", and a platform
   * that garbles the name of the register it checks against does not inspire
   * confidence in the checking.
   */
  inSentence: string;
  hint: string;
  required: boolean;
}

export function ProjectDocumentUploader({
  projectId,
  slots,
  present,
}: {
  projectId: string;
  slots: ProjectDocumentSlot[];
  present: Record<string, string[]>;
}) {
  return (
    <div className="space-y-4">
      {slots.map((slot) => (
        <DocumentSlot
          key={slot.value}
          projectId={projectId}
          slot={slot}
          existing={present[slot.value] ?? []}
        />
      ))}

      <p className="text-[0.6875rem] leading-relaxed text-faint">
        PDF or a clear photo, up to 10 MB. Documents are encrypted before they
        are stored. Only a verification officer can open them, and every time one
        is opened we record who and when.
      </p>
    </div>
  );
}

/**
 * One slot per document kind.
 *
 * A single dropdown plus one file input was the earlier shape and it caused
 * mislabelled uploads: the select reset between files, so the second document
 * was filed under whatever the first had been. A slot per kind cannot do that.
 */
function DocumentSlot({
  projectId,
  slot,
  existing,
}: {
  projectId: string;
  slot: ProjectDocumentSlot;
  existing: string[];
}) {
  const [state, action] = useActionState<ProjectActionState, FormData>(
    uploadProjectDocument,
    {},
  );

  return (
    <form action={action} className="rounded-card border border-line px-4 py-3.5">
      <input type="hidden" name="projectId" value={projectId} />
      <input type="hidden" name="kind" value={slot.value} />

      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <p className="text-[0.875rem] font-medium text-ink">
          {slot.label}
          {!slot.required && <span className="ml-1.5 font-normal text-faint">Optional</span>}
        </p>
        {existing.length > 0 && (
          <span className="label text-verify-ink">
            {existing.length === 1 ? 'Uploaded' : `${existing.length} uploaded`}
          </span>
        )}
      </div>

      <p className="mt-1 text-[0.75rem] leading-relaxed text-muted">{slot.hint}</p>

      {existing.length > 0 && (
        <ul className="mt-2 space-y-0.5">
          {existing.map((filename) => (
            <li key={filename} className="truncate text-[0.75rem] text-faint">
              {filename}
            </li>
          ))}
        </ul>
      )}

      <div className="mt-3 flex flex-wrap items-center gap-3">
        <input
          type="file"
          name="file"
          accept={DOC_ACCEPT}
          required
          aria-label={`Choose the ${slot.inSentence}`}
          className={fileInputClass}
        />
        <Pending idle={existing.length > 0 ? 'Replace' : 'Upload'} busy="Uploading…" />
      </div>

      <div className="mt-2">
        <Notice state={state} />
      </div>
    </form>
  );
}

// ---------------------------------------------------------------------------
// Submission
// ---------------------------------------------------------------------------

export function SubmitProject({
  projectId,
  blockers,
}: {
  projectId: string;
  blockers: string[];
}) {
  const [state, action] = useActionState<ProjectActionState, FormData>(submitProject, {});

  if (state.ok) {
    return (
      <p role="status" className="text-[0.875rem] font-medium text-action">
        {state.ok}
      </p>
    );
  }

  return (
    <div className="space-y-3">
      {blockers.length > 0 && (
        <div>
          <p className="text-[0.8125rem] font-medium text-ink">
            Before this can be reviewed:
          </p>
          <ul className="mt-1.5 space-y-1">
            {blockers.map((blocker) => (
              <li key={blocker} className="text-[0.8125rem] leading-relaxed text-muted">
                — {blocker}
              </li>
            ))}
          </ul>
        </div>
      )}

      <form action={action}>
        <input type="hidden" name="projectId" value={projectId} />
        <button
          type="submit"
          disabled={blockers.length > 0}
          className="rounded-control bg-action px-5 py-2.5 text-[0.9375rem] font-semibold text-white transition-colors hover:bg-action-hover disabled:cursor-not-allowed disabled:opacity-55"
        >
          Submit for verification
        </button>
      </form>

      <Notice state={state} />
    </div>
  );
}

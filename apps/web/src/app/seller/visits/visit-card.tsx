'use client';

import { useActionState, useState } from 'react';
import { useFormStatus } from 'react-dom';
import { respondToVisit, type VisitState } from './actions';
import type { SiteVisit } from '@/lib/server-api';

const inputClass =
  'mt-1.5 w-full rounded-control border border-line bg-surface px-3 py-2 text-[0.875rem] text-ink outline-none transition-colors focus:border-action focus:ring-2 focus:ring-action/15';

/** Colour carries meaning here, so each state gets its own treatment. */
const STATUS_STYLES: Record<SiteVisit['status'], string> = {
  REQUESTED: 'border-verify bg-verify-soft text-verify-ink',
  CONFIRMED: 'border-action bg-action text-white',
  RESCHEDULED: 'border-line bg-canvas-deep text-ink',
  DECLINED: 'border-seal bg-seal-soft text-seal',
  CANCELLED: 'border-line bg-canvas-deep text-muted',
  COMPLETED: 'border-line bg-canvas-deep text-muted',
};

const STATUS_LABELS: Record<SiteVisit['status'], string> = {
  REQUESTED: 'Awaiting your reply',
  CONFIRMED: 'Confirmed',
  RESCHEDULED: 'You suggested another time',
  DECLINED: 'Declined',
  CANCELLED: 'Cancelled',
  COMPLETED: 'Visited',
};

function when(iso: string): string {
  return new Date(iso).toLocaleString('en-IN', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  });
}

/** Compact enough to sit inside a button without wrapping. */
function shortWhen(iso: string): string {
  return new Date(iso).toLocaleString('en-IN', {
    day: 'numeric',
    month: 'short',
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  });
}

export function VisitCard({ visit }: { visit: SiteVisit }) {
  const [state, action] = useActionState<VisitState, FormData>(respondToVisit, {});
  const [mode, setMode] = useState<'idle' | 'reschedule' | 'decline'>('idle');

  // Only an open request can still be answered.
  const open = visit.status === 'REQUESTED' || visit.status === 'RESCHEDULED';

  /*
    Confirming without supplying a time books the buyer's *original* slot — so
    on a request the seller has already pushed back on, an unlabelled "Confirm"
    would quietly throw away their own suggestion and agree to the day they
    said they could not do. The button names the time it books instead.
  */
  const pushedBack = visit.status === 'RESCHEDULED';
  const confirmLabel = pushedBack
    ? `Confirm their original time (${shortWhen(visit.preferredAt)})`
    : `Confirm ${shortWhen(visit.preferredAt)}`;

  return (
    <li className="rounded-card border border-line bg-surface px-5 py-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[0.9375rem] font-semibold text-ink">{visit.listing.title}</p>
          <p className="mt-1 text-[0.875rem] text-muted">
            {visit.buyer?.fullName ?? 'A buyer'} asked to visit on{' '}
            <span className="font-medium text-ink">{when(visit.preferredAt)}</span>
          </p>
        </div>

        <span
          className={`shrink-0 rounded-full border px-2.5 py-1 text-[0.6875rem] font-semibold uppercase tracking-wider ${STATUS_STYLES[visit.status]}`}
        >
          {STATUS_LABELS[visit.status]}
        </span>
      </div>

      {visit.note && (
        <p className="mt-3 rounded-control bg-canvas px-3 py-2 text-[0.875rem] leading-relaxed text-ink">
          “{visit.note}”
        </p>
      )}

      {/*
        Contact details appear only once the seller has engaged, and only here —
        never in the notification email.
      */}
      {visit.buyer && open && (
        <p className="mt-3 text-[0.8125rem] text-muted tabular">
          {visit.buyer.phone ?? 'No phone on file'} · {visit.buyer.email}
        </p>
      )}

      {visit.confirmedAt && (
        <p className="mt-3 text-[0.875rem] text-ink">
          Confirmed for <span className="font-semibold">{when(visit.confirmedAt)}</span>
        </p>
      )}
      {visit.status === 'RESCHEDULED' && visit.proposedAt && (
        <p className="mt-3 text-[0.875rem] text-ink">
          You suggested <span className="font-semibold">{when(visit.proposedAt)}</span>
        </p>
      )}
      {visit.sellerNote && (
        <p className="mt-2 text-[0.875rem] italic text-muted">You said: {visit.sellerNote}</p>
      )}

      {state.ok && (
        <p role="status" className="mt-3 text-[0.875rem] font-medium text-action">
          {state.ok}
        </p>
      )}
      {state.error && (
        <p role="alert" className="mt-3 rounded-control border-l-2 border-seal bg-seal-soft px-3 py-2 text-[0.875rem] text-ink">
          {state.error}
        </p>
      )}

      {open && !state.ok && (
        <div className="mt-4 border-t border-line pt-4">
          {mode === 'idle' && (
            <div className="flex flex-wrap gap-2">
              <form action={action}>
                <input type="hidden" name="requestId" value={visit.id} />
                <input type="hidden" name="decision" value="CONFIRM" />
                <Submit
                  idle={confirmLabel}
                  busy="Confirming…"
                  tone={pushedBack ? 'quiet' : 'primary'}
                />
              </form>
              <button
                type="button"
                onClick={() => setMode('reschedule')}
                className={`rounded-control border px-4 py-2 text-[0.875rem] font-medium transition-colors ${
                  pushedBack
                    ? 'border-transparent bg-action text-white hover:bg-action-hover'
                    : 'border-line text-ink hover:bg-canvas-deep'
                }`}
              >
                {pushedBack ? 'Change your suggestion' : 'Suggest another time'}
              </button>
              <button
                type="button"
                onClick={() => setMode('decline')}
                className="rounded-control border border-line px-4 py-2 text-[0.875rem] font-medium text-muted transition-colors hover:border-seal hover:text-seal"
              >
                Decline
              </button>
            </div>
          )}

          {mode === 'reschedule' && (
            <form action={action} className="space-y-3">
              <input type="hidden" name="requestId" value={visit.id} />
              <input type="hidden" name="decision" value="RESCHEDULE" />

              <div className="grid grid-cols-2 gap-3">
                <label className="block">
                  <span className="text-[0.8125rem] font-medium text-ink">Date</span>
                  <input
                    type="date"
                    name="date"
                    required
                    min={new Date(Date.now() + 86_400_000).toISOString().slice(0, 10)}
                    className={inputClass}
                  />
                </label>
                <label className="block">
                  <span className="text-[0.8125rem] font-medium text-ink">Time</span>
                  <input type="time" name="time" required step={900} defaultValue="11:00" className={inputClass} />
                </label>
              </div>

              <label className="block">
                <span className="text-[0.8125rem] font-medium text-ink">
                  Note <span className="font-normal text-faint">(optional)</span>
                </span>
                <input
                  name="sellerNote"
                  maxLength={500}
                  placeholder="Sunday works better for me."
                  className={inputClass}
                />
              </label>

              <div className="flex gap-2">
                <Submit idle="Send new time" busy="Sending…" tone="primary" />
                <Cancel onClick={() => setMode('idle')} />
              </div>
            </form>
          )}

          {mode === 'decline' && (
            <form action={action} className="space-y-3">
              <input type="hidden" name="requestId" value={visit.id} />
              <input type="hidden" name="decision" value="DECLINE" />

              <label className="block">
                <span className="text-[0.8125rem] font-medium text-ink">
                  Why? <span className="font-normal text-faint">The buyer will see this.</span>
                </span>
                <input
                  name="sellerNote"
                  required
                  maxLength={500}
                  placeholder="The property is under offer."
                  className={inputClass}
                />
              </label>

              <div className="flex gap-2">
                <Submit idle="Decline" busy="Sending…" tone="danger" />
                <Cancel onClick={() => setMode('idle')} />
              </div>
            </form>
          )}
        </div>
      )}
    </li>
  );
}

/**
 * `tone` rather than a boolean: a confirm button demoted to secondary must not
 * inherit the decline button's red, which is what a two-state prop forces.
 */
const SUBMIT_TONES = {
  primary: 'bg-action text-white hover:bg-action-hover',
  quiet: 'border border-line text-ink hover:bg-canvas-deep',
  danger: 'border border-seal text-seal hover:bg-seal-soft',
} as const;

function Submit({
  idle,
  busy,
  tone = 'quiet',
}: {
  idle: string;
  busy: string;
  tone?: keyof typeof SUBMIT_TONES;
}) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className={`rounded-control px-4 py-2 text-[0.875rem] font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-55 ${SUBMIT_TONES[tone]}`}
    >
      {pending ? busy : idle}
    </button>
  );
}

function Cancel({ onClick }: { onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="rounded-control border border-line px-4 py-2 text-[0.875rem] font-medium text-muted transition-colors hover:text-ink"
    >
      Cancel
    </button>
  );
}

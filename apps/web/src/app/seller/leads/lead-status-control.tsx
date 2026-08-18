'use client';

import { useActionState } from 'react';
import { useFormStatus } from 'react-dom';
import { setLeadStatus, type ActionState } from '../actions';

function Save() {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="border border-line px-3 py-1.5 text-[0.8125rem] text-ink transition-colors hover:border-muted disabled:cursor-not-allowed disabled:opacity-55"
    >
      {pending ? 'Saving…' : 'Update'}
    </button>
  );
}

/**
 * Lead pipeline control.
 *
 * A select plus an explicit Update, rather than saving on change: a mis-click
 * that silently reclassifies a buyer as "Not interested" is worse than one extra
 * click, and the first move away from New stamps a response time the platform
 * reports on.
 */
export function LeadStatusControl({
  leadId,
  current,
  labels,
}: {
  leadId: string;
  current: string;
  labels: Record<string, string>;
}) {
  const [state, action] = useActionState<ActionState, FormData>(setLeadStatus, {});

  return (
    <form action={action} className="flex flex-wrap items-center gap-2">
      <input type="hidden" name="leadId" value={leadId} />

      <label htmlFor={`status-${leadId}`} className="sr-only">
        Enquiry status
      </label>
      <select
        id={`status-${leadId}`}
        name="status"
        defaultValue={current}
        className="border border-line bg-canvas px-2.5 py-1.5 text-[0.8125rem] text-ink outline-none focus:border-action"
      >
        {Object.entries(labels).map(([value, label]) => (
          <option key={value} value={value}>
            {label}
          </option>
        ))}
      </select>

      <Save />

      {state.ok && (
        <span role="status" className="text-[0.6875rem] text-action">
          {state.ok}
        </span>
      )}
      {state.error && (
        <span role="alert" className="text-[0.6875rem] text-seal">
          {state.error}
        </span>
      )}
    </form>
  );
}

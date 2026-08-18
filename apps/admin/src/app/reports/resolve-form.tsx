'use client';

import { useActionState } from 'react';
import { useFormStatus } from 'react-dom';
import { resolveReport, type ActionState } from '@/app/actions';

function Save() {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="bg-indigo px-3.5 py-1.5 text-[0.8125rem] font-medium text-paper transition-colors hover:bg-indigo-deep disabled:cursor-not-allowed disabled:opacity-55"
    >
      {pending ? 'Saving…' : 'Record outcome'}
    </button>
  );
}

export function ResolveForm({ reportId }: { reportId: string }) {
  const [state, action] = useActionState<ActionState, FormData>(resolveReport, {});

  return (
    <form action={action} className="space-y-2.5">
      <input type="hidden" name="reportId" value={reportId} />

      <div className="flex flex-wrap items-center gap-2">
        <label htmlFor={`status-${reportId}`} className="sr-only">
          Outcome
        </label>
        <select
          id={`status-${reportId}`}
          name="status"
          defaultValue="RESOLVED"
          className="border border-paper-edge bg-console px-2.5 py-1.5 text-[0.8125rem] text-ink outline-none focus:border-indigo"
        >
          <option value="IN_REVIEW">Looking into it</option>
          <option value="RESOLVED">Resolved — action taken</option>
          <option value="DISMISSED">Dismissed — nothing wrong</option>
        </select>
        <Save />
      </div>

      <label htmlFor={`note-${reportId}`} className="sr-only">
        What you did about it
      </label>
      <textarea
        id={`note-${reportId}`}
        name="resolutionNote"
        rows={2}
        required
        minLength={5}
        maxLength={1000}
        placeholder="What did you do about it? The person who reported this will read exactly these words."
        className="w-full border border-paper-edge bg-console px-2.5 py-2 text-[0.8125rem] text-ink outline-none focus:border-indigo"
      />

      {state.ok && (
        <p role="status" className="text-[0.6875rem] text-indigo">
          {state.ok}
        </p>
      )}
      {state.error && (
        <p role="alert" className="text-[0.6875rem] text-seal">
          {state.error}
        </p>
      )}
    </form>
  );
}

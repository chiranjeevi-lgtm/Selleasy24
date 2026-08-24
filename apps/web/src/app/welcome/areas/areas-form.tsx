'use client';

import { useActionState, useState } from 'react';
import { useFormStatus } from 'react-dom';
import { saveAreas, type StepState } from '../actions';

const MAX_AREAS = 8;

/**
 * Preferred localities.
 *
 * Capped at eight, and the cap is explained rather than silently enforced. A
 * buyer who picks every area has expressed no preference at all, and the
 * ranking would then be decided entirely by budget.
 */
export function AreasForm({
  localities,
  selected: initiallySelected,
}: {
  localities: Array<{ id: string; name: string }>;
  selected: string[];
}) {
  const [state, action] = useActionState<StepState, FormData>(saveAreas, {});
  const [selected, setSelected] = useState<string[]>(initiallySelected);

  const full = selected.length >= MAX_AREAS;

  function toggle(id: string) {
    setSelected((current) =>
      current.includes(id)
        ? current.filter((entry) => entry !== id)
        : current.length >= MAX_AREAS
          ? current
          : [...current, id],
    );
  }

  return (
    <form action={action} className="space-y-6">
      {state.error && (
        <p
          role="alert"
          className="rounded-control border-l-2 border-seal bg-seal-soft px-3.5 py-2.5 text-[0.875rem] text-ink"
        >
          {state.error}
        </p>
      )}

      {selected.map((id) => (
        <input key={id} type="hidden" name="neighborhoodIds" value={id} />
      ))}

      <fieldset>
        <legend className="sr-only">Preferred areas</legend>
        <div className="flex flex-wrap gap-2">
          {localities.map((locality) => {
            const isSelected = selected.includes(locality.id);
            // Disabled only when the cap is reached AND this one is not already
            // chosen — otherwise a buyer at the limit could not deselect.
            const disabled = full && !isSelected;

            return (
              <button
                key={locality.id}
                type="button"
                onClick={() => toggle(locality.id)}
                disabled={disabled}
                aria-pressed={isSelected}
                className={`rounded-full border px-3.5 py-2 text-[0.875rem] font-medium transition-colors ${
                  isSelected
                    ? 'border-action bg-action text-white'
                    : disabled
                      ? 'cursor-not-allowed border-line text-faint'
                      : 'border-line text-ink hover:border-action/40 hover:bg-canvas-deep'
                }`}
              >
                {locality.name}
              </button>
            );
          })}
        </div>
      </fieldset>

      <p className="text-[0.8125rem] text-muted" aria-live="polite">
        {selected.length === 0
          ? `Pick up to ${MAX_AREAS}. Or skip — we will show you everywhere.`
          : full
            ? `${MAX_AREAS} chosen, which is the most. Deselect one to swap it.`
            : `${selected.length} chosen.`}
      </p>

      <Submit hasSelection={selected.length > 0} />
    </form>
  );
}

function Submit({ hasSelection }: { hasSelection: boolean }) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="rounded-control bg-action px-5 py-2.5 text-[0.9375rem] font-semibold text-white transition-colors hover:bg-action-hover disabled:cursor-not-allowed disabled:opacity-55"
    >
      {pending ? 'Saving…' : hasSelection ? 'Continue' : 'Show me everywhere'}
    </button>
  );
}

'use client';

import Link from 'next/link';
import { MAX_COMPARE, useCompare } from '@/lib/compare-store';

/**
 * Per-listing compare toggle.
 *
 * A real checkbox, so it reports its own checked state to assistive technology
 * and works from the keyboard without any of it being reimplemented.
 */
export function CompareToggle({
  listingId,
  title,
  variant = 'inline',
}: {
  listingId: string;
  title: string;
  /** `button` matches the full-size Save control on a detail page. */
  variant?: 'inline' | 'button';
}) {
  const { has, toggle, isFull } = useCompare();
  const selected = has(listingId);
  // Full means no *more* can be added; the ones already picked stay removable.
  const disabled = isFull && !selected;

  if (variant === 'button') {
    return (
      <button
        type="button"
        onClick={() => !disabled && toggle(listingId)}
        disabled={disabled}
        aria-pressed={selected}
        title={disabled ? `You can compare up to ${MAX_COMPARE} homes at once` : undefined}
        className={`inline-flex items-center gap-2 rounded-control border px-4 py-2.5 text-[0.9375rem] font-medium transition-all duration-200 disabled:cursor-not-allowed disabled:opacity-50 ${
          selected
            ? 'border-action bg-action text-white'
            : 'border-line text-ink hover:border-muted hover:bg-canvas-deep'
        }`}
      >
        <svg viewBox="0 0 16 16" aria-hidden="true" className="h-4 w-4">
          {/* Two panels side by side — the comparison itself, rather than a
              generic tick that would say nothing about what the button does. */}
          <rect x="1.5" y="3" width="5.5" height="10" rx="1" fill="none" stroke="currentColor" strokeWidth="1.4" />
          <rect x="9" y="3" width="5.5" height="10" rx="1" fill="none" stroke="currentColor" strokeWidth="1.4" />
        </svg>
        {selected ? 'Added to compare' : 'Compare'}
        <span className="sr-only">{title}</span>
      </button>
    );
  }

  return (
    <label
      className={`inline-flex items-center gap-1.5 text-[0.8125rem] ${
        disabled ? 'cursor-not-allowed text-faint' : 'cursor-pointer text-muted hover:text-ink'
      }`}
      title={disabled ? `You can compare up to ${MAX_COMPARE} homes at once` : undefined}
    >
      <input
        type="checkbox"
        checked={selected}
        disabled={disabled}
        onChange={() => toggle(listingId)}
        className="h-3.5 w-3.5 shrink-0 accent-action"
      />
      <span>Compare</span>
      <span className="sr-only">{title}</span>
    </label>
  );
}

/**
 * Floating bar summarising the shortlist.
 *
 * Fixed to the bottom so the count stays visible while scrolling a long results
 * page — the selection is otherwise invisible once the chosen cards scroll away,
 * and buyers forget they started comparing at all.
 */
export function CompareBar() {
  const { ids, clear } = useCompare();

  if (ids.length === 0) {
    return null;
  }

  const enough = ids.length >= 2;

  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-0 z-40 px-4 pb-4 sm:px-6 sm:pb-6">
      <div className="pointer-events-auto mx-auto flex max-w-[38rem] flex-wrap items-center justify-between gap-3 rounded-card border border-line bg-surface px-4 py-3 shadow-float">
        <p className="text-[0.875rem] text-ink">
          <span className="font-semibold tabular">{ids.length}</span>
          {ids.length === 1 ? ' home selected' : ' homes selected'}
          {!enough && <span className="text-muted"> — pick one more to compare</span>}
        </p>

        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={clear}
            className="text-[0.8125rem] text-muted underline-offset-4 transition-colors hover:text-ink hover:underline"
          >
            Clear
          </button>

          {enough ? (
            <Link
              href={`/compare?ids=${ids.join(',')}`}
              className="rounded-control bg-action px-4 py-2 text-[0.875rem] font-semibold text-white transition-colors hover:bg-action-hover"
            >
              Compare
            </Link>
          ) : (
            <span
              aria-disabled="true"
              className="cursor-not-allowed rounded-control bg-action/35 px-4 py-2 text-[0.875rem] font-semibold text-white"
            >
              Compare
            </span>
          )}
        </div>
      </div>
    </div>
  );
}

/** Removes one column from within the comparison page itself. */
export function RemoveFromCompare({ listingId, ids }: { listingId: string; ids: string[] }) {
  const { remove } = useCompare();
  const remaining = ids.filter((id) => id !== listingId);

  return (
    <Link
      href={remaining.length >= 2 ? `/compare?ids=${remaining.join(',')}` : '/'}
      onClick={() => remove(listingId)}
      className="inline-flex items-center gap-1 text-[0.75rem] text-muted transition-colors hover:text-seal"
    >
      Remove
      <span aria-hidden="true">×</span>
    </Link>
  );
}

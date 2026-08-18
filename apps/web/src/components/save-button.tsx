'use client';

import Link from 'next/link';
import { useState, useTransition } from 'react';
import { toggleSaved } from '@/app/saved/actions';

/**
 * Save-to-shortlist toggle.
 *
 * Optimistic: the heart fills the moment it is pressed and rolls back if the
 * server disagrees. Saving is a low-stakes, high-frequency action, and waiting
 * a round trip before acknowledging a tap makes a list feel broken.
 *
 * A signed-out buyer is not shown an error — the control becomes a sign-in
 * prompt, because browsing without an account is expected and the PRD only
 * requires an account for the list to persist.
 */
export function SaveButton({
  listingId,
  initiallySaved = false,
  /**
   * `overlay` sits on a photo, `inline` in a card's footer row, and `button` is
   * the full-size control for a detail page — where saving is a primary action
   * and a small text link reads as a footnote rather than something to press.
   */
  variant = 'inline',
}: {
  listingId: string;
  initiallySaved?: boolean;
  variant?: 'inline' | 'overlay' | 'button';
}) {
  const [saved, setSaved] = useState(initiallySaved);
  const [needsSignIn, setNeedsSignIn] = useState(false);
  const [error, setError] = useState<string | undefined>();
  const [pending, startTransition] = useTransition();

  function onClick() {
    const previous = saved;
    setSaved(!previous);
    setError(undefined);

    startTransition(async () => {
      const result = await toggleSaved(listingId, previous);
      setSaved(result.saved);
      setNeedsSignIn(Boolean(result.needsSignIn));
      setError(result.error);
    });
  }

  const label = saved ? 'Saved' : 'Save';

  if (needsSignIn) {
    return (
      <Link
        href="/login"
        className={
          variant === 'button'
            ? 'inline-flex items-center gap-2 rounded-control border border-line px-4 py-2.5 text-[0.9375rem] font-medium text-ink transition-colors hover:bg-canvas-deep'
            : 'text-[0.8125rem] text-muted underline-offset-4 transition-colors hover:text-ink hover:underline'
        }
      >
        <HeartIcon filled={false} />
        Sign in to save
      </Link>
    );
  }

  if (variant === 'button') {
    return (
      <button
        type="button"
        onClick={onClick}
        disabled={pending}
        aria-pressed={saved}
        className={`inline-flex items-center gap-2 rounded-control border px-4 py-2.5 text-[0.9375rem] font-medium transition-all duration-200 disabled:opacity-60 ${
          saved
            ? 'border-seal bg-seal-soft text-seal'
            : 'border-line text-ink hover:border-muted hover:bg-canvas-deep'
        }`}
      >
        <HeartIcon filled={saved} />
        {label}
        {error && (
          <span role="alert" className="ml-1 text-[0.8125rem] text-seal">
            {error}
          </span>
        )}
      </button>
    );
  }

  if (variant === 'overlay') {
    return (
      <button
        type="button"
        onClick={onClick}
        disabled={pending}
        aria-pressed={saved}
        title={error ?? label}
        className="inline-flex h-8 w-8 items-center justify-center rounded-full bg-surface/95 shadow-sm backdrop-blur-sm transition-colors hover:bg-surface disabled:opacity-60"
      >
        <HeartIcon filled={saved} />
        <span className="sr-only">{label} this home</span>
      </button>
    );
  }

  return (
    <span className="inline-flex items-center gap-1.5">
      <button
        type="button"
        onClick={onClick}
        disabled={pending}
        aria-pressed={saved}
        className={`inline-flex items-center gap-1.5 text-[0.8125rem] transition-colors disabled:opacity-60 ${
          saved ? 'text-seal' : 'text-muted hover:text-ink'
        }`}
      >
        <HeartIcon filled={saved} />
        {label}
      </button>
      {error && (
        <span role="alert" className="text-[0.75rem] text-seal">
          {error}
        </span>
      )}
    </span>
  );
}

function HeartIcon({ filled, large }: { filled: boolean; large?: boolean }) {
  return (
    <svg
      viewBox="0 0 16 16"
      aria-hidden="true"
      className={`${large ? 'h-4 w-4' : 'h-3.5 w-3.5'} ${filled ? 'text-seal' : ''}`}
      fill={filled ? 'currentColor' : 'none'}
      stroke="currentColor"
      strokeWidth="1.6"
    >
      <path
        d="M8 13.5S2 10 2 6.2A3.2 3.2 0 0 1 8 4.6a3.2 3.2 0 0 1 6 1.6C14 10 8 13.5 8 13.5Z"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

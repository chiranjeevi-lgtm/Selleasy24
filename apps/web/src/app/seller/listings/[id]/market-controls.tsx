'use client';

import { useActionState } from 'react';
import { useFormStatus } from 'react-dom';
import {
  markListingSold,
  pauseListing,
  resumeListing,
  type ActionState,
} from '../../actions';
import { FormError } from '@/components/form-fields';
import { formatRupeesShort } from '@/lib/format';

/**
 * Taking a listing off the market.
 *
 * The one thing that matters here is that saying "it's gone" is easier than
 * ignoring it. Every bit of friction converts directly into a stale listing,
 * which is the failure this platform is positioned against.
 *
 * So the forms are always in the page rather than revealed by a click, and the
 * sold panel collapses with `<details>` rather than React state. That keeps
 * both actions working with JavaScript off — and it means pausing is one click
 * rather than two.
 */

function Pending({
  idle,
  busy,
  tone = 'quiet',
}: {
  idle: string;
  busy: string;
  tone?: 'quiet' | 'primary';
}) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className={`rounded-control px-4 py-2 text-[0.875rem] font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-55 ${
        tone === 'primary'
          ? 'bg-action text-white hover:bg-action-hover'
          : 'border border-line text-ink hover:bg-canvas-deep'
      }`}
    >
      {pending ? busy : idle}
    </button>
  );
}

function Notice({ state }: { state: ActionState }) {
  if (state.ok) {
    return (
      <p role="status" className="text-[0.8125rem] font-medium text-action">
        {state.ok}
      </p>
    );
  }
  return <FormError message={state.error} />;
}

export function MarketControls({
  listingId,
  status,
  askingPrice,
  pausedReason,
}: {
  listingId: string;
  status: string;
  askingPrice: number;
  pausedReason: string | null;
}) {
  const [pauseState, pauseAction] = useActionState<ActionState, FormData>(pauseListing, {});
  const [resumeState, resumeAction] = useActionState<ActionState, FormData>(resumeListing, {});
  const [soldState, soldAction] = useActionState<ActionState, FormData>(markListingSold, {});

  // Nothing to do for a draft, one in review, or one already sold.
  if (status !== 'APPROVED' && status !== 'PAUSED') {
    return null;
  }

  const isPaused = status === 'PAUSED';

  return (
    <section
      className="mt-9 rounded-card border border-line bg-surface px-5 py-5"
      aria-labelledby="market-heading"
    >
      <h3 id="market-heading" className="text-[1rem] font-semibold text-ink">
        {isPaused ? 'This listing is paused' : 'Has it gone?'}
      </h3>

      <p className="mt-1 max-w-prose text-[0.8125rem] leading-relaxed text-muted">
        {isPaused
          ? 'Buyers cannot see it. Putting it back takes one click and does not go through review again.'
          : 'If it has sold, or you have taken it off the market for now, say so here. It is the single most useful thing you can do for the buyers using this site.'}
      </p>

      {isPaused ? (
        <div className="mt-4 space-y-3">
          {pausedReason && (
            <p className="text-[0.8125rem] text-muted">
              You said: <span className="text-ink">{pausedReason}</span>
            </p>
          )}
          <form action={resumeAction}>
            <input type="hidden" name="listingId" value={listingId} />
            <Pending idle="Put it back" busy="Restoring…" tone="primary" />
          </form>
          <Notice state={resumeState} />
        </div>
      ) : (
        <form action={pauseAction} className="mt-4 space-y-3">
          <input type="hidden" name="listingId" value={listingId} />

          <label className="block">
            <span className="text-[0.8125rem] font-medium text-ink">
              Take it down for now{' '}
              <span className="font-normal text-faint">— you can put it back any time</span>
            </span>
            <input
              name="reason"
              maxLength={300}
              placeholder="Why? Optional, and only you see it."
              className="mt-1.5 w-full rounded-control border border-line bg-surface px-3 py-2.5 text-[0.875rem] text-ink outline-none transition-colors placeholder:text-faint focus:border-action focus:ring-2 focus:ring-action/15"
            />
          </label>

          <Pending idle="Pause this listing" busy="Pausing…" />
          <Notice state={pauseState} />
        </form>
      )}

      {/*
        `<details>` rather than React state: the form stays in the document
        while collapsed, so it still submits with JavaScript off. The sold panel
        is the one that must not depend on scripting — it is the whole point of
        the feature.
      */}
      <details className="group mt-5 border-t border-line pt-4">
        <summary className="cursor-pointer list-none text-[0.875rem] font-medium text-action underline-offset-4 hover:underline">
          It sold — record it
        </summary>

        <form action={soldAction} className="mt-4 space-y-4">
          <input type="hidden" name="listingId" value={listingId} />

          <p className="rounded-control bg-canvas-deep px-3.5 py-3 text-[0.8125rem] leading-relaxed text-ink">
            This is final — a sold listing cannot be put back. Anyone still
            waiting on a visit will be told the property has sold, so nobody
            turns up to a closed door.
          </p>

          {/*
            Both questions are optional and say so. A seller who has just sold
            owes us nothing, and a form that interrogates them is one they will
            abandon — leaving the listing up, which is the whole problem.
          */}
          <label className="block">
            <span className="text-[0.8125rem] font-medium text-ink">
              What did it sell for? <span className="font-normal text-faint">Optional</span>
            </span>
            <span className="mt-1 block text-[0.75rem] leading-relaxed text-muted">
              Never shown against your listing or to any buyer. Every price on
              this site is an asking price, so real figures are the only way the
              locality averages mean anything. You were asking{' '}
              {formatRupeesShort(askingPrice)}.
            </span>
            <span className="mt-1.5 flex items-center gap-2">
              <span className="text-[0.9375rem] text-muted">₹</span>
              <input
                name="soldPrice"
                type="number"
                min={1}
                step={1000}
                placeholder={String(askingPrice)}
                className="w-48 rounded-control border border-line bg-surface px-3 py-2.5 text-[0.875rem] text-ink outline-none transition-colors focus:border-action focus:ring-2 focus:ring-action/15"
              />
            </span>
          </label>

          <fieldset>
            <legend className="text-[0.8125rem] font-medium text-ink">
              Did the buyer come from SellEasy24?{' '}
              <span className="font-normal text-faint">Optional</span>
            </legend>
            <div className="mt-2 flex flex-wrap gap-2">
              {[
                { value: 'yes', label: 'Yes' },
                { value: 'no', label: 'No' },
              ].map((option) => (
                <label
                  key={option.value}
                  className="cursor-pointer rounded-full border border-line px-4 py-1.5 text-[0.875rem] text-ink transition-colors hover:bg-canvas-deep has-[:checked]:border-action has-[:checked]:bg-action has-[:checked]:text-white"
                >
                  <input
                    type="radio"
                    name="soldThroughPlatform"
                    value={option.value}
                    className="sr-only"
                  />
                  {option.label}
                </label>
              ))}
            </div>
          </fieldset>

          <Pending idle="Mark it sold" busy="Recording…" tone="primary" />
          <Notice state={soldState} />
        </form>
      </details>
    </section>
  );
}

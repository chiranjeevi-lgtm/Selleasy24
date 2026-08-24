'use client';

import Link from 'next/link';
import { useActionState } from 'react';
import { useFormStatus } from 'react-dom';
import {
  sendProjectEnquiry,
  type ProjectEnquiryState,
} from '@/app/projects/[id]/actions';
import { formatArea, formatRupeesShort } from '@/lib/format';

/**
 * Contacting the builder.
 *
 * The one thing a project page was missing: a buyer could read everything about
 * a development and then had nowhere to go. The panel names the configuration
 * they are asking about, because a builder's first question is always which
 * one — and answering it up front saves the buyer a phone call.
 *
 * Requires an account, like a listing enquiry, and says so before anyone fills
 * anything in rather than after.
 */

const inputClass =
  'mt-1.5 w-full rounded-control border border-line bg-surface px-3 py-2.5 text-[0.9375rem] text-ink outline-none transition-colors placeholder:text-faint focus:border-action focus:ring-2 focus:ring-action/15';

const labelClass = 'block text-[0.8125rem] font-medium text-ink';

export interface ContactUnit {
  id: string;
  bedrooms: number;
  areaSqft: number;
  priceFrom: number;
  availableUnits: number | null;
}

export function ProjectContactPanel({
  projectId,
  projectName,
  builderName,
  units,
  isSignedIn,
  buyerName,
  buyerPhone,
}: {
  projectId: string;
  projectName: string;
  builderName: string;
  units: ContactUnit[];
  isSignedIn: boolean;
  buyerName?: string;
  buyerPhone?: string | null;
}) {
  const [state, action] = useActionState<ProjectEnquiryState, FormData>(
    sendProjectEnquiry,
    {},
  );

  if (!isSignedIn) {
    const next = encodeURIComponent(`/projects/${projectId}`);
    return (
      <section className="rounded-card border border-line bg-surface px-5 py-6">
        <h2 className="text-[1.0625rem] font-semibold text-ink">
          Sign in to contact {builderName}
        </h2>
        <p className="mt-2 text-[0.9375rem] leading-relaxed text-muted">
          We ask both sides to have an account before you exchange details. Your
          number goes to this builder alone — not to other developers, not to
          agents, not to anyone else.
        </p>

        <div className="mt-5 flex flex-wrap gap-3">
          <Link
            href={`/login?next=${next}`}
            className="rounded-control bg-action px-5 py-2.5 text-[0.9375rem] font-semibold text-white transition-colors hover:bg-action-hover"
          >
            Sign in
          </Link>
          <Link
            href={`/register?next=${next}`}
            className="rounded-control border border-line px-5 py-2.5 text-[0.9375rem] font-medium text-ink transition-colors hover:bg-canvas-deep"
          >
            Create an account
          </Link>
        </div>

        <p className="mt-4 text-[0.8125rem] leading-relaxed text-faint">
          You can keep browsing projects without an account.
        </p>
      </section>
    );
  }

  if (state.ok) {
    return (
      <section className="rounded-card border border-line bg-surface px-5 py-6">
        <div className="flex items-start gap-3">
          <span
            aria-hidden="true"
            className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-action text-[0.75rem] text-white"
          >
            ✓
          </span>
          <p role="status" className="text-[0.9375rem] leading-relaxed text-ink">
            {state.ok}
          </p>
        </div>
      </section>
    );
  }

  return (
    <section
      aria-labelledby="project-contact-heading"
      className="rounded-card border border-line bg-surface px-5 py-5"
    >
      <h2 id="project-contact-heading" className="text-[1.0625rem] font-semibold text-ink">
        Ask about {projectName}
      </h2>
      <p className="mt-1.5 text-[0.8125rem] leading-relaxed text-muted">
        {builderName} will call you back.
      </p>

      <form action={action} className="mt-4 space-y-4">
        <input type="hidden" name="projectId" value={projectId} />

        {state.needsSignIn && (
          <p
            role="alert"
            className="rounded-control border-l-2 border-seal bg-seal-soft px-3 py-2.5 text-[0.875rem] text-ink"
          >
            Your session has expired.{' '}
            <Link
              href={`/login?next=${encodeURIComponent(`/projects/${projectId}`)}`}
              className="font-medium underline underline-offset-2"
            >
              Sign in again
            </Link>{' '}
            and your details will still be here.
          </p>
        )}

        {state.error && (
          <p
            role="alert"
            className="rounded-control border-l-2 border-seal bg-seal-soft px-3 py-2.5 text-[0.875rem] text-ink"
          >
            {state.error}
          </p>
        )}

        {/*
          Which configuration. A native select rather than chips: there may be
          half a dozen, each needing size and price to be meaningful, and that
          does not fit a row of pills.
        */}
        {units.length > 0 && (
          <label className="block">
            <span className={labelClass}>Which one interests you?</span>
            <select name="projectUnitId" defaultValue="" className={inputClass}>
              <option value="">Not sure yet</option>
              {units.map((unit) => (
                <option
                  key={unit.id}
                  value={unit.id}
                  // Sold-out configurations stay listed but cannot be picked —
                  // hiding them would leave a buyer wondering whether the size
                  // they wanted was ever offered.
                  disabled={unit.availableUnits === 0}
                >
                  {unit.bedrooms} BHK · {formatArea(unit.areaSqft)} · from{' '}
                  {formatRupeesShort(unit.priceFrom)}
                  {unit.availableUnits === 0 ? ' — sold out' : ''}
                </option>
              ))}
            </select>
          </label>
        )}

        <label className="block">
          <span className={labelClass}>Your name</span>
          <input
            name="name"
            required
            defaultValue={buyerName ?? ''}
            minLength={2}
            maxLength={120}
            className={inputClass}
          />
        </label>

        <label className="block">
          <span className={labelClass}>Phone</span>
          <input
            name="phone"
            type="tel"
            required
            inputMode="tel"
            // Prefilled from the account but editable: the number someone wants
            // to be reached on is often not the one they registered with.
            defaultValue={buyerPhone ?? ''}
            placeholder="+91 98765 43210"
            className={inputClass}
          />
        </label>

        <label className="block">
          <span className={labelClass}>
            Message <span className="font-normal text-faint">(optional)</span>
          </span>
          <textarea
            name="message"
            rows={3}
            maxLength={1000}
            placeholder="When is possession? Is there a payment plan?"
            className={`${inputClass} resize-y`}
          />
        </label>

        <Submit />

        <p className="text-[0.75rem] leading-relaxed text-faint">
          Your number goes to this builder only. We never pass it to other
          developers, agents, or anyone else.
        </p>
      </form>
    </section>
  );
}

function Submit() {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="w-full rounded-control bg-action px-5 py-3 text-[0.9375rem] font-semibold text-white transition-colors hover:bg-action-hover disabled:cursor-not-allowed disabled:opacity-55"
    >
      {pending ? 'Sending…' : 'Send enquiry'}
    </button>
  );
}

'use client';

import Link from 'next/link';
import { useActionState, useState } from 'react';
import { useFormStatus } from 'react-dom';
import { requestSiteVisit, sendEnquiry, type ContactState } from '@/app/listings/[id]/actions';

/**
 * Contact the owner, or ask to see the property.
 *
 * Two related actions in one panel rather than two competing cards. A buyer is
 * deciding "do I want to talk to this person or go and look", and the answer is
 * often both — separating them into distant blocks makes the second easy to
 * miss.
 *
 * Both require an account now. Rather than letting someone fill a form and only
 * then discover that, the panel asks them to sign in up front, and keeps a
 * return path so they land back on this property.
 */

type Tab = 'enquiry' | 'visit';

const inputClass =
  'mt-1.5 w-full rounded-control border border-line bg-surface px-3 py-2.5 text-[0.9375rem] text-ink outline-none transition-colors placeholder:text-faint focus:border-action focus:ring-2 focus:ring-action/15';

const labelClass = 'block text-[0.8125rem] font-medium text-ink';

export function ContactPanel({
  listingId,
  sellerName,
  isSignedIn,
  buyerName,
  buyerPhone,
}: {
  listingId: string;
  sellerName: string;
  isSignedIn: boolean;
  buyerName?: string;
  buyerPhone?: string | null;
}) {
  const [tab, setTab] = useState<Tab>('enquiry');

  if (!isSignedIn) {
    return <SignInPrompt listingId={listingId} sellerName={sellerName} />;
  }

  return (
    <section
      aria-labelledby="contact-heading"
      className="overflow-hidden rounded-card border border-line bg-surface"
    >
      <h2 id="contact-heading" className="sr-only">
        Contact the owner
      </h2>

      <div role="tablist" aria-label="Contact options" className="grid grid-cols-2 gap-px bg-line">
        {(
          [
            { id: 'enquiry', label: 'Send enquiry' },
            { id: 'visit', label: 'Request a visit' },
          ] as const
        ).map((item) => (
          <button
            key={item.id}
            role="tab"
            type="button"
            aria-selected={tab === item.id}
            onClick={() => setTab(item.id)}
            className={`px-4 py-3 text-[0.875rem] font-medium transition-colors ${
              tab === item.id
                ? 'bg-surface text-ink'
                : 'bg-canvas text-muted hover:text-ink'
            }`}
          >
            {item.label}
          </button>
        ))}
      </div>

      <div className="px-5 py-5">
        {tab === 'enquiry' ? (
          <EnquiryTab listingId={listingId} buyerName={buyerName} buyerPhone={buyerPhone} />
        ) : (
          <VisitTab listingId={listingId} />
        )}
      </div>
    </section>
  );
}

function SignInPrompt({ listingId, sellerName }: { listingId: string; sellerName: string }) {
  const next = encodeURIComponent(`/listings/${listingId}`);

  return (
    <section className="rounded-card border border-line bg-surface px-5 py-6">
      <h2 className="text-[1.0625rem] font-semibold text-ink">
        Sign in to contact {sellerName}
      </h2>
      <p className="mt-2 text-[0.9375rem] leading-relaxed text-muted">
        We ask both sides to have an account before you exchange details. It
        means the person you are speaking to has been through registration, and
        it keeps your number out of the hands of anyone else.
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
        You can keep browsing, comparing and shortlisting without an account.
      </p>
    </section>
  );
}

function EnquiryTab({
  listingId,
  buyerName,
  buyerPhone,
}: {
  listingId: string;
  buyerName?: string;
  buyerPhone?: string | null;
}) {
  const [state, action] = useActionState<ContactState, FormData>(sendEnquiry, {});

  if (state.ok) {
    return <Done message={state.ok} />;
  }

  return (
    <form action={action} className="space-y-4">
      <input type="hidden" name="listingId" value={listingId} />
      <Problem state={state} listingId={listingId} />

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
          // Prefilled from the account, but editable: the number someone wants
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
          placeholder="Is it still available? When can I visit?"
          className={`${inputClass} resize-y`}
        />
      </label>

      <Submit idle="Send enquiry" busy="Sending…" />

      <p className="text-[0.75rem] leading-relaxed text-faint">
        Your number goes to this seller only. We never pass it to other sellers,
        agents, or anyone else.
      </p>
    </form>
  );
}

function VisitTab({ listingId }: { listingId: string }) {
  const [state, action] = useActionState<ContactState, FormData>(requestSiteVisit, {});

  if (state.ok) {
    return (
      <Done message={state.ok}>
        <Link
          href="/visits"
          className="mt-2 inline-block text-[0.875rem] font-medium text-action underline underline-offset-2"
        >
          Track this in your visits
        </Link>
      </Done>
    );
  }

  // Tomorrow, through ninety days out — the window the API accepts. Setting the
  // bounds on the input means the picker refuses an invalid date rather than
  // the server rejecting it after a round trip.
  const tomorrow = new Date(Date.now() + 86_400_000).toISOString().slice(0, 10);
  const latest = new Date(Date.now() + 89 * 86_400_000).toISOString().slice(0, 10);

  return (
    <form action={action} className="space-y-4">
      <input type="hidden" name="listingId" value={listingId} />
      <Problem state={state} listingId={listingId} />

      <div className="grid grid-cols-2 gap-3">
        <label className="block">
          <span className={labelClass}>Date</span>
          <input
            name="date"
            type="date"
            required
            min={tomorrow}
            max={latest}
            defaultValue={tomorrow}
            className={inputClass}
          />
        </label>
        <label className="block">
          <span className={labelClass}>Time</span>
          <input
            name="time"
            type="time"
            required
            defaultValue="11:00"
            step={900}
            className={inputClass}
          />
        </label>
      </div>

      <label className="block">
        <span className={labelClass}>
          Anything to add <span className="font-normal text-faint">(optional)</span>
        </span>
        <textarea
          name="note"
          rows={2}
          maxLength={500}
          placeholder="I can be flexible either side of this."
          className={`${inputClass} resize-y`}
        />
      </label>

      <Submit idle="Request visit" busy="Sending…" />

      <p className="text-[0.75rem] leading-relaxed text-faint">
        The owner will confirm, suggest another time, or tell you if it is not
        possible. The answer shows up in{' '}
        <Link href="/visits" className="underline underline-offset-2 hover:text-muted">
          your visits
        </Link>{' '}
        and by email.
      </p>
    </form>
  );
}

function Problem({ state, listingId }: { state: ContactState; listingId: string }) {
  if (state.needsSignIn) {
    return (
      <p role="alert" className="rounded-control border-l-2 border-seal bg-seal-soft px-3 py-2.5 text-[0.875rem] text-ink">
        Your session has expired.{' '}
        <Link
          href={`/login?next=${encodeURIComponent(`/listings/${listingId}`)}`}
          className="font-medium underline underline-offset-2"
        >
          Sign in again
        </Link>{' '}
        and your details will still be here.
      </p>
    );
  }

  if (!state.error) return null;

  return (
    <p role="alert" className="rounded-control border-l-2 border-seal bg-seal-soft px-3 py-2.5 text-[0.875rem] text-ink">
      {state.error}
    </p>
  );
}

function Done({ message, children }: { message: string; children?: React.ReactNode }) {
  return (
    <div className="flex items-start gap-3 py-2">
      <span
        aria-hidden="true"
        className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-action text-[0.75rem] text-white"
      >
        ✓
      </span>
      <div>
        <p role="status" className="text-[0.9375rem] leading-relaxed text-ink">
          {message}
        </p>
        {children}
      </div>
    </div>
  );
}

function Submit({ idle, busy }: { idle: string; busy: string }) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="w-full rounded-control bg-action px-5 py-3 text-[0.9375rem] font-semibold text-white transition-colors hover:bg-action-hover disabled:cursor-not-allowed disabled:opacity-55"
    >
      {pending ? busy : idle}
    </button>
  );
}

'use client';

import { useState } from 'react';
import { api, ApiError } from '@/lib/api';

type State =
  | { kind: 'idle' }
  | { kind: 'sending' }
  | { kind: 'sent'; reference: string }
  | { kind: 'error'; message: string };

const inputClass =
  'mt-1.5 w-full rounded-control border border-line bg-canvas px-3 py-2.5 text-[0.9375rem] text-ink outline-none transition-colors placeholder:text-faint focus:border-ink focus:bg-surface';

/**
 * Contact the owner.
 *
 * No account required — a deliberate product decision, and the reason this is
 * the one interactive island on an otherwise server-rendered page.
 *
 * The privacy line is not marketing copy. Every incumbent in this market is
 * criticised for selling enquiry data to brokers within hours, so stating the
 * actual behaviour at the point of collection is the most useful thing this
 * form can say.
 */
export function EnquiryForm({
  listingId,
  sellerName,
}: {
  listingId: string;
  sellerName: string;
}) {
  const [state, setState] = useState<State>({ kind: 'idle' });

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    setState({ kind: 'sending' });

    try {
      const result = await api.submitEnquiry(listingId, {
        name: String(form.get('name') ?? ''),
        phone: String(form.get('phone') ?? ''),
        email: String(form.get('email') ?? '') || undefined,
        message: String(form.get('message') ?? '') || undefined,
      });
      setState({ kind: 'sent', reference: result.id });
    } catch (error) {
      setState({
        kind: 'error',
        // Errors say what happened and what to do. They do not apologise.
        message:
          error instanceof ApiError
            ? error.message
            : 'Could not send that. Check your connection and try again.',
      });
    }
  }

  if (state.kind === 'sent') {
    return (
      <section className="rounded-card bg-surface px-5 py-6 shadow-card">
        <div className="flex h-9 w-9 items-center justify-center rounded-full bg-seal-soft">
          <svg viewBox="0 0 16 16" aria-hidden="true" className="h-4 w-4 text-seal">
            <path
              d="M2.5 8.5 6 12l7.5-8"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </div>
        <h2 className="mt-3.5 text-[1.0625rem] font-semibold text-ink">Enquiry sent</h2>
        <p className="mt-1.5 text-[0.9375rem] leading-relaxed text-muted">
          {sellerName} has been notified and can see your details in their
          dashboard.
        </p>
        <p className="mt-4 text-[0.75rem] text-faint">
          Reference <span className="tabular">{state.reference.slice(0, 8)}</span>
        </p>
      </section>
    );
  }

  const sending = state.kind === 'sending';

  return (
    <section className="rounded-card bg-surface px-5 py-5 shadow-card">
      <h2 className="text-[1.0625rem] font-semibold text-ink">Contact the owner</h2>

      <form onSubmit={handleSubmit} className="mt-4 space-y-3.5">
        <label className="block">
          <span className="text-[0.8125rem] font-medium text-muted">Your name</span>
          <input name="name" required minLength={2} maxLength={120} autoComplete="name" className={inputClass} />
        </label>

        <label className="block">
          <span className="text-[0.8125rem] font-medium text-muted">Phone</span>
          <input
            name="phone"
            required
            inputMode="tel"
            autoComplete="tel"
            placeholder="+91 98765 43210"
            className={inputClass}
          />
        </label>

        <label className="block">
          <span className="text-[0.8125rem] font-medium text-muted">
            Email <span className="font-normal text-faint">(optional)</span>
          </span>
          <input name="email" type="email" autoComplete="email" className={inputClass} />
        </label>

        <label className="block">
          <span className="text-[0.8125rem] font-medium text-muted">
            Message <span className="font-normal text-faint">(optional)</span>
          </span>
          <textarea
            name="message"
            rows={3}
            maxLength={1000}
            placeholder="Is it still available? When can I visit?"
            className={`${inputClass} resize-none`}
          />
        </label>

        {state.kind === 'error' && (
          <p role="alert" className="text-[0.875rem] text-seal">{state.message}</p>
        )}

        <button
          type="submit"
          disabled={sending}
          className="w-full rounded-control bg-action px-4 py-3 text-[0.9375rem] font-semibold text-white transition-colors hover:bg-action-hover disabled:cursor-not-allowed disabled:opacity-55"
        >
          {sending ? 'Sending…' : 'Send enquiry'}
        </button>

        <p className="text-[0.75rem] leading-relaxed text-faint">
          Your number goes to this seller only. We do not pass it to other
          sellers, agents, or anyone else.
        </p>
      </form>
    </section>
  );
}

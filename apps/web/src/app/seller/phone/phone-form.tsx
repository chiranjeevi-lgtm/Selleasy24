'use client';

import Link from 'next/link';
import { useActionState } from 'react';
import { useFormStatus } from 'react-dom';
import { requestCode, verifyCode, type PhoneState } from './actions';
import { TextInput } from '@/components/form-fields';

/**
 * Phone verification.
 *
 * Two steps in one component so the number typed in the first is still on hand
 * for the second without a round trip or a query parameter.
 *
 * When the API returns the code — which only the console delivery driver does —
 * it is shown in a panel that says plainly why it is on screen. Presenting it as
 * though an SMS had arrived would leave anyone watching a demonstration with the
 * wrong idea about what is actually built.
 */
export function PhoneForm({
  initialPhone,
  /**
   * Where to go once the number is confirmed, and what the copy should say.
   *
   * Parameterised rather than copied into a second component: the verification
   * logic is identical for a seller and a buyer, and two copies would drift the
   * moment one of them was fixed. Only the wording and the destination differ.
   */
  variant = 'seller',
  nextHref = '/seller/listings',
  nextLabel = 'Back to my listings',
}: {
  initialPhone: string | null;
  variant?: 'seller' | 'buyer';
  nextHref?: string;
  nextLabel?: string;
}) {
  const [state, action] = useActionState<PhoneState, FormData>(
    async (prev, form) =>
      (form.get('intent') === 'verify' ? verifyCode : requestCode)(prev, form),
    { step: 'phone', ...(initialPhone && { phone: initialPhone }) },
  );

  const isBuyer = variant === 'buyer';

  if (state.step === 'done') {
    return (
      <div className="rounded-card border border-line bg-surface p-6">
        <div className="flex items-start gap-3">
          <span
            aria-hidden="true"
            className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-action text-[0.8125rem] text-white"
          >
            ✓
          </span>
          <div>
            <h2 className="text-[1.0625rem] font-semibold text-ink">Number verified</h2>
            <p className="mt-1.5 text-[0.9375rem] leading-relaxed text-muted">
              <span className="tabular">{state.phone}</span> is confirmed.{' '}
              {isBuyer
                ? 'When you ask to see a property, the owner reaches you here. It goes to that one seller and nobody else.'
                : 'Buyers who enquire will reach you here, and you can now submit listings for review.'}
            </p>
            <Link
              href={nextHref}
              className="mt-4 inline-block rounded-control bg-action px-5 py-2.5 text-[0.9375rem] font-semibold text-white transition-colors hover:bg-action-hover"
            >
              {nextLabel}
            </Link>
          </div>
        </div>
      </div>
    );
  }

  return (
    <form action={action} className="rounded-card border border-line bg-surface p-6">
      {state.error && (
        <p
          role="alert"
          className="mb-4 border-l-2 border-seal bg-seal-soft px-3 py-2 text-[0.875rem] text-ink"
        >
          {state.error}
        </p>
      )}

      {state.step === 'phone' ? (
        <>
          <input type="hidden" name="intent" value="request" />
          <TextInput
            name="phone"
            label="Mobile number"
            type="tel"
            required
            inputMode="tel"
            defaultValue={state.phone ?? '+91'}
            placeholder="+919876543210"
            hint={
              isBuyer
                ? 'Include the country code. Sellers you contact reach you on this number — nobody else gets it.'
                : 'Include the country code. Buyers who enquire will be given this number.'
            }
          />
          <div className="mt-5">
            <Submit idle="Send code" busy="Sending…" />
          </div>
        </>
      ) : (
        <>
          <input type="hidden" name="intent" value="verify" />
          <input type="hidden" name="phone" value={state.phone ?? ''} />

          <p className="text-[0.9375rem] text-muted">
            We sent a 6-digit code to{' '}
            <span className="font-medium text-ink tabular">{state.phone}</span>
            {state.expiresInMinutes ? `. It expires in ${state.expiresInMinutes} minutes.` : '.'}
          </p>

          {state.demoCode && <DemoCodePanel code={state.demoCode} />}

          <div className="mt-5 max-w-[16rem]">
            <TextInput
              name="code"
              label="6-digit code"
              required
              inputMode="numeric"
              autoComplete="one-time-code"
              pattern="[0-9]{6}"
              maxLength={6}
              placeholder="000000"
              className="tabular text-[1.25rem] tracking-[0.35em]"
            />
          </div>

          <div className="mt-5 flex items-center gap-4">
            <Submit idle="Verify" busy="Checking…" />
            <button
              type="submit"
              name="intent"
              value="request"
              className="text-[0.875rem] text-muted underline-offset-4 transition-colors hover:text-ink hover:underline"
            >
              Send a new code
            </button>
          </div>
        </>
      )}
    </form>
  );
}

/**
 * The code, shown because nothing is actually delivering it yet.
 *
 * Labelled honestly rather than dressed up as a received message: anyone
 * watching should understand that the verification logic is real and only the
 * delivery channel is outstanding.
 */
function DemoCodePanel({ code }: { code: string }) {
  return (
    <div className="mt-4 overflow-hidden rounded-card border border-dashed border-line bg-canvas-deep">
      <p className="border-b border-line/70 px-4 py-2 text-[0.6875rem] font-semibold uppercase tracking-[0.14em] text-faint">
        Demonstration mode — no SMS sent
      </p>
      <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-3.5">
        <p
          className="font-mono text-[1.75rem] font-semibold leading-none tracking-[0.3em] text-ink"
          aria-label={`Your code is ${code.split('').join(' ')}`}
        >
          {code}
        </p>
        <p className="max-w-[18rem] text-[0.75rem] leading-snug text-muted">
          Once an SMS or WhatsApp provider is connected, this code goes to the
          phone instead and stops appearing here.
        </p>
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
      className="rounded-control bg-action px-5 py-2.5 text-[0.9375rem] font-semibold text-white transition-colors hover:bg-action-hover disabled:cursor-not-allowed disabled:opacity-55"
    >
      {pending ? busy : idle}
    </button>
  );
}

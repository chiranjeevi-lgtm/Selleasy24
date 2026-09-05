'use client';

import { useRouter } from 'next/navigation';
import { useMemo, useState, useTransition } from 'react';
import { applyAsAgent } from '@/app/become-an-agent/actions';

/**
 * Field-agent registration form.
 *
 * The submit is the account signup — a successful apply creates the
 * applicant's User (role = AGENT_APPLICANT) alongside the FieldAgent row
 * in one transaction and returns an authenticated session. On success the
 * form redirects to /agent/pending, which is the applicant's status page.
 *
 * Three failure states surface distinct messages: 409 (email already
 * registered — sign in and apply from there instead), 429 (rate limit),
 * and everything else (generic error with the server's own message when
 * we can pull it out).
 */

const HYDERABAD_LOCALITIES = [
  'Gachibowli',
  'Kondapur',
  'Madhapur',
  'Hitech City',
  'Kokapet',
  'Narsingi',
  'Manikonda',
  'Financial District',
  'Jubilee Hills',
  'Banjara Hills',
  'Kukatpally',
  'Miyapur',
  'Tellapur',
  'Nallagandla',
  'Puppalguda',
  'Attapur',
  'Kompally',
  'Alwal',
  'Secunderabad',
  'LB Nagar',
] as const;

type SubmitState =
  | { kind: 'idle' }
  | { kind: 'submitting' }
  | { kind: 'success'; email: string }
  | { kind: 'conflict' }
  | { kind: 'error'; message: string };

export function AgentRegistrationForm() {
  const router = useRouter();
  const [, startTransition] = useTransition();

  const [fullName, setFullName] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [experience, setExperience] = useState<'none' | '1-2' | '3-5' | '5+'>('none');
  const [selectedLocalities, setSelectedLocalities] = useState<Set<string>>(new Set());
  const [notes, setNotes] = useState('');
  const [submitState, setSubmitState] = useState<SubmitState>({ kind: 'idle' });

  const canSubmit = useMemo(() => {
    return (
      fullName.trim().length >= 2 &&
      /^\+?[1-9][0-9]{7,14}$/.test(phone.trim()) &&
      email.includes('@') &&
      password.length >= 8 &&
      selectedLocalities.size >= 1 &&
      submitState.kind !== 'submitting'
    );
  }, [
    fullName,
    phone,
    email,
    password.length,
    selectedLocalities.size,
    submitState.kind,
  ]);

  function toggleLocality(locality: string) {
    setSelectedLocalities((prev) => {
      const next = new Set(prev);
      if (next.has(locality)) next.delete(locality);
      else next.add(locality);
      return next;
    });
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!canSubmit) return;
    setSubmitState({ kind: 'submitting' });

    const trimmedEmail = email.trim().toLowerCase();
    const result = await applyAsAgent({
      fullName: fullName.trim(),
      phone: phone.trim(),
      email: trimmedEmail,
      password,
      experience,
      serviceLocalities: Array.from(selectedLocalities),
      ...(notes.trim() && { notes: notes.trim() }),
    });

    if (result.kind === 'success') {
      setSubmitState({ kind: 'success', email: result.email });
      // Small pause so the applicant sees the confirmation before the
      // navigation — otherwise the success screen would flash for a
      // frame and disappear.
      startTransition(() => {
        setTimeout(() => router.push(result.redirectTo), 1200);
      });
      return;
    }
    if (result.kind === 'conflict') {
      setSubmitState({ kind: 'conflict' });
      return;
    }
    if (result.kind === 'rate_limited') {
      setSubmitState({
        kind: 'error',
        message:
          'Too many attempts. Wait a minute and try again — this limit protects us both from spam.',
      });
      return;
    }
    setSubmitState({ kind: 'error', message: result.message });
  }

  // Success state replaces the form entirely — a submitted application
  // should not invite a second submission.
  if (submitState.kind === 'success') {
    return (
      <div className="rounded-card bg-verify-soft p-8 ring-1 ring-verify/25 sm:p-10">
        <p className="label text-verify-ink">Account created — application received</p>
        <h3 className="mt-3 display text-[1.375rem] text-ink">
          You&rsquo;re signed in. Taking you to your status page&hellip;
        </h3>
        <p className="mt-4 text-[0.9375rem] leading-relaxed text-ink/85">
          A SellEasy24 team member will review your application within 3
          business days and email {submitState.email} with the next steps —
          background verification, the two-hour training module, and
          activation.
        </p>
      </div>
    );
  }

  if (submitState.kind === 'conflict') {
    return (
      <div className="rounded-card bg-surface p-8 shadow-card ring-1 ring-line sm:p-10">
        <p className="label text-seal">Email already registered</p>
        <h3 className="mt-3 display text-[1.375rem] text-ink">
          An account already exists with this email
        </h3>
        <p className="mt-4 text-[0.9375rem] leading-relaxed text-muted">
          Sign in with that email first, then apply for the field-agent
          programme from your account. If the address isn&rsquo;t yours,
          contact hello@selleasy24.com — we take account-impersonation
          reports seriously.
        </p>
        <div className="mt-6 flex flex-wrap gap-3">
          <a
            href={`/login?next=/become-an-agent&email=${encodeURIComponent(email.trim().toLowerCase())}`}
            className="rounded-control bg-action px-5 py-2.5 text-[0.9375rem] font-semibold text-white transition-colors hover:bg-action-hover"
          >
            Sign in
          </a>
          <button
            type="button"
            onClick={() => setSubmitState({ kind: 'idle' })}
            className="rounded-control border border-line bg-surface px-5 py-2.5 text-[0.9375rem] font-medium text-ink transition-colors hover:border-muted"
          >
            Use a different email
          </button>
        </div>
      </div>
    );
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="rounded-card bg-surface p-6 shadow-card ring-1 ring-line sm:p-8"
    >
      <div className="grid gap-6 sm:grid-cols-2">
        <label className="block">
          <span className="text-[0.75rem] font-medium text-muted">Full name</span>
          <input
            type="text"
            value={fullName}
            onChange={(e) => setFullName(e.target.value)}
            required
            minLength={2}
            autoComplete="name"
            className="mt-1.5 w-full rounded-control border border-line bg-surface px-3 py-2 text-[0.9375rem] text-ink outline-none transition-colors focus:border-action focus:ring-2 focus:ring-action/15"
          />
        </label>

        <label className="block">
          <span className="text-[0.75rem] font-medium text-muted">Phone (with country code)</span>
          <input
            type="tel"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            placeholder="+919876543210"
            pattern="\+?[1-9][0-9]{7,14}"
            required
            autoComplete="tel"
            className="mt-1.5 w-full rounded-control border border-line bg-surface px-3 py-2 text-[0.9375rem] text-ink outline-none transition-colors focus:border-action focus:ring-2 focus:ring-action/15"
          />
        </label>

        <label className="block">
          <span className="text-[0.75rem] font-medium text-muted">Email</span>
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            autoComplete="email"
            className="mt-1.5 w-full rounded-control border border-line bg-surface px-3 py-2 text-[0.9375rem] text-ink outline-none transition-colors focus:border-action focus:ring-2 focus:ring-action/15"
          />
        </label>

        <label className="block">
          <span className="text-[0.75rem] font-medium text-muted">
            Choose a password
          </span>
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            minLength={8}
            maxLength={100}
            autoComplete="new-password"
            placeholder="At least 8 characters"
            className="mt-1.5 w-full rounded-control border border-line bg-surface px-3 py-2 text-[0.9375rem] text-ink outline-none transition-colors focus:border-action focus:ring-2 focus:ring-action/15"
          />
          <span className="mt-1 block text-[0.6875rem] text-faint">
            You&rsquo;ll use this to sign back in and check your application status.
          </span>
        </label>

        <label className="block sm:col-span-2">
          <span className="text-[0.75rem] font-medium text-muted">Real-estate experience</span>
          <select
            value={experience}
            onChange={(e) =>
              setExperience(e.target.value as 'none' | '1-2' | '3-5' | '5+')
            }
            className="mt-1.5 w-full rounded-control border border-line bg-surface px-3 py-2 text-[0.9375rem] text-ink outline-none transition-colors focus:border-action focus:ring-2 focus:ring-action/15"
          >
            <option value="none">None — new to the market</option>
            <option value="1-2">1–2 years</option>
            <option value="3-5">3–5 years</option>
            <option value="5+">5+ years</option>
          </select>
        </label>
      </div>

      <fieldset className="mt-6">
        <legend className="text-[0.75rem] font-medium text-muted">
          Which Hyderabad localities can you service?
        </legend>
        <p className="mt-1 text-[0.75rem] text-faint">
          Pick every area you can visit within an hour. Assignments are matched to
          service areas.
        </p>
        <div className="mt-3 flex flex-wrap gap-2">
          {HYDERABAD_LOCALITIES.map((locality) => {
            const active = selectedLocalities.has(locality);
            return (
              <label key={locality}>
                <input
                  type="checkbox"
                  checked={active}
                  onChange={() => toggleLocality(locality)}
                  className="peer sr-only"
                />
                <span
                  className={
                    active
                      ? 'inline-block cursor-pointer rounded-control border border-action bg-action px-3 py-1.5 text-[0.8125rem] font-medium text-white'
                      : 'inline-block cursor-pointer rounded-control border border-line bg-surface px-3 py-1.5 text-[0.8125rem] text-muted transition-colors hover:border-muted hover:text-ink'
                  }
                >
                  {locality}
                </span>
              </label>
            );
          })}
        </div>
      </fieldset>

      <label className="mt-6 block">
        <span className="text-[0.75rem] font-medium text-muted">
          Anything else we should know?
        </span>
        <textarea
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          rows={4}
          maxLength={1000}
          placeholder="Prior brokerage, RERA registration if any, languages spoken, hours available…"
          className="mt-1.5 w-full rounded-control border border-line bg-surface px-3 py-2 text-[0.9375rem] text-ink outline-none transition-colors focus:border-action focus:ring-2 focus:ring-action/15"
        />
      </label>

      <div className="mt-8 flex flex-wrap items-center gap-4">
        <button
          type="submit"
          disabled={!canSubmit}
          className="rounded-control bg-action px-5 py-2.5 text-[0.9375rem] font-semibold text-white transition-colors hover:bg-action-hover disabled:cursor-not-allowed disabled:opacity-60"
        >
          {submitState.kind === 'submitting' ? 'Submitting…' : 'Create account & apply'}
        </button>
        <p className="text-[0.75rem] text-faint">
          Rate limited to 3 submissions per minute per IP.
        </p>
      </div>

      {submitState.kind === 'error' && (
        <div className="mt-4 rounded-control bg-seal-soft px-4 py-3 ring-1 ring-seal/30">
          <p className="text-[0.875rem] font-medium text-seal">
            {submitState.message}
          </p>
        </div>
      )}
    </form>
  );
}

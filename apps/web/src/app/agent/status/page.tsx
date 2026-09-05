import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { ApiError } from '@/lib/api';
import { serverApi } from '@/lib/server-api';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = {
  title: 'Your agent status',
  description:
    'Track your SellEasy24 field-agent application. See whether it is pending, active, suspended, or inactive — with the reason and dates.',
};

/**
 * Canonical status page for anyone with a field-agent record on their
 * account. Handles all four lifecycle states: PENDING (awaiting review),
 * ACTIVE (activated), SUSPENDED (with reason + date), INACTIVE (removed
 * from programme). The header on this page is what a signed-in agent
 * lands on by default — see `safeRedirectTarget` in (auth)/actions.ts
 * and `accountHrefFor` in components/site-header.tsx.
 */

const STATUS_COPY: Record<
  'PENDING' | 'ACTIVE' | 'SUSPENDED' | 'INACTIVE',
  { headline: string; body: string; tone: 'verify' | 'seal' | 'action' }
> = {
  PENDING: {
    headline: 'Application received — waiting for review',
    body:
      'A SellEasy24 team member will review your details within 3 business days. We’ll email you as soon as there’s an update — background verification, training details, and activation come as a single next-steps email.',
    tone: 'verify',
  },
  ACTIVE: {
    headline: 'You’re an active field agent',
    body:
      'Your account has been activated. The agent assignment dashboard is the next thing we ship; until then, we’ll email you directly when an owner in your service localities requests help.',
    tone: 'action',
  },
  SUSPENDED: {
    headline: 'Your account is suspended',
    body:
      'Access to assignments is paused. See the reason below and contact hello@selleasy24.com if you believe this is a mistake.',
    tone: 'seal',
  },
  INACTIVE: {
    headline: 'Your account is inactive',
    body:
      'This account is no longer part of the field-agent programme. Contact hello@selleasy24.com if this is unexpected.',
    tone: 'seal',
  },
};

const STATUS_PILL: Record<'PENDING' | 'ACTIVE' | 'SUSPENDED' | 'INACTIVE', string> = {
  PENDING: 'bg-canvas-deep text-muted ring-line',
  ACTIVE: 'bg-verify-soft text-verify-ink ring-verify/25',
  SUSPENDED: 'bg-seal-soft text-seal ring-seal/25',
  INACTIVE: 'bg-canvas-deep text-muted ring-line',
};

function formatDate(iso: string | null): string {
  if (!iso) return '—';
  const d = new Date(iso);
  return `${d.getDate()} ${d.toLocaleString('en-IN', { month: 'short' })} ${d.getFullYear()}`;
}

export default async function AgentStatusPage() {
  let profile;
  try {
    profile = await serverApi.myFieldAgentProfile();
  } catch (error) {
    if (error instanceof ApiError && (error.status === 401 || error.status === 403)) {
      redirect('/login?next=/agent/status');
    }
    throw error;
  }

  if (!profile) {
    return (
      <div className="mx-auto max-w-[48rem] px-5 py-16 sm:px-8 sm:py-20">
        <span aria-hidden="true" className="mb-3 block h-[3px] w-10 bg-verify" />
        <h1 className="display text-[2rem] text-ink sm:text-[2.5rem]">
          No agent application on file
        </h1>
        <p className="mt-5 text-[1rem] leading-relaxed text-muted">
          You&rsquo;re signed in, but there&rsquo;s no field-agent
          application on this account yet. Apply to join the programme
          below.
        </p>
        <Link
          href="/become-an-agent"
          className="mt-6 inline-block rounded-control bg-action px-5 py-2.5 text-[0.9375rem] font-semibold text-white transition-colors hover:bg-action-hover"
        >
          Apply to be a field agent
        </Link>
      </div>
    );
  }

  const copy = STATUS_COPY[profile.status];

  return (
    <div className="mx-auto max-w-[48rem] px-5 py-12 sm:px-8 sm:py-16">
      <header>
        <span aria-hidden="true" className="mb-3 block h-[3px] w-10 bg-verify" />
        <div className="flex flex-wrap items-baseline gap-3">
          <p className="label text-verify-ink">Field-agent status</p>
          <span
            className={`rounded-full px-2.5 py-0.5 text-[0.6875rem] font-semibold uppercase tracking-[0.08em] ring-1 ${STATUS_PILL[profile.status]}`}
          >
            {profile.status}
          </span>
        </div>
        <h1 className="mt-3 display text-[2rem] text-ink sm:text-[2.5rem]">
          {copy.headline}
        </h1>
        <p className="mt-5 text-[1rem] leading-relaxed text-muted">{copy.body}</p>
        <p className="mt-2 text-[0.8125rem] text-faint">
          Submitted {formatDate(profile.createdAt)}
          {profile.activatedAt && ` · Activated ${formatDate(profile.activatedAt)}`}
          {profile.suspendedAt && ` · Suspended ${formatDate(profile.suspendedAt)}`}
        </p>
      </header>

      {profile.status === 'SUSPENDED' && profile.suspendedReason && (
        <div className="mt-8 rounded-card bg-seal-soft p-5 ring-1 ring-seal/25">
          <p className="label text-seal">Reason for suspension</p>
          <p className="mt-2 text-[0.9375rem] leading-relaxed text-ink">
            {profile.suspendedReason}
          </p>
          <p className="mt-3 text-[0.8125rem] text-muted">
            Believe this is a mistake? Reply to the notification email or
            write to{' '}
            <a href="mailto:hello@selleasy24.com" className="text-action underline">
              hello@selleasy24.com
            </a>{' '}
            — an admin will review within 2 business days.
          </p>
        </div>
      )}

      {profile.status === 'PENDING' && (
        <ol className="mt-8 space-y-3">
          {[
            'Application submitted',
            'Background verification',
            'Training module (2 hours online)',
            'Activation — account role upgraded to FIELD_AGENT',
          ].map((step, i) => (
            <li
              key={step}
              className="flex gap-4 rounded-card bg-surface p-4 shadow-card ring-1 ring-line"
            >
              <span
                className={
                  i === 0
                    ? 'grid h-7 w-7 shrink-0 place-items-center rounded-full bg-verify text-[0.8125rem] font-semibold text-verify-ink'
                    : 'grid h-7 w-7 shrink-0 place-items-center rounded-full bg-canvas-deep text-[0.8125rem] font-semibold text-muted'
                }
              >
                {i === 0 ? '✓' : i + 1}
              </span>
              <p className="text-[0.9375rem] text-ink">{step}</p>
            </li>
          ))}
        </ol>
      )}

      <section className="mt-10 rounded-card bg-surface p-6 shadow-card ring-1 ring-line sm:p-8">
        <h2 className="display text-[1.125rem] text-ink">What you submitted</h2>
        <dl className="mt-4 grid gap-4 sm:grid-cols-2">
          <div>
            <dt className="text-[0.6875rem] uppercase tracking-[0.08em] text-faint">
              Full name
            </dt>
            <dd className="mt-1 text-[0.9375rem] text-ink">{profile.fullName}</dd>
          </div>
          <div>
            <dt className="text-[0.6875rem] uppercase tracking-[0.08em] text-faint">
              Phone
            </dt>
            <dd className="mt-1 text-[0.9375rem] text-ink">{profile.phone}</dd>
          </div>
          <div>
            <dt className="text-[0.6875rem] uppercase tracking-[0.08em] text-faint">
              Email
            </dt>
            <dd className="mt-1 text-[0.9375rem] text-ink">{profile.email}</dd>
          </div>
          <div>
            <dt className="text-[0.6875rem] uppercase tracking-[0.08em] text-faint">
              Experience
            </dt>
            <dd className="mt-1 text-[0.9375rem] text-ink">{profile.experience}</dd>
          </div>
          <div className="sm:col-span-2">
            <dt className="text-[0.6875rem] uppercase tracking-[0.08em] text-faint">
              Service localities
            </dt>
            <dd className="mt-1 flex flex-wrap gap-1.5">
              {profile.serviceLocalities.map((l) => (
                <span
                  key={l}
                  className="rounded-full bg-canvas-deep px-2 py-0.5 text-[0.75rem] text-ink"
                >
                  {l}
                </span>
              ))}
            </dd>
          </div>
        </dl>
      </section>

      {profile.status === 'ACTIVE' && (
        <section className="mt-10 rounded-card bg-surface p-6 shadow-card ring-1 ring-line sm:p-8">
          <h2 className="display text-[1.125rem] text-ink">Your performance</h2>
          <dl className="mt-4 grid gap-4 sm:grid-cols-3">
            <div>
              <dt className="text-[0.6875rem] uppercase tracking-[0.08em] text-faint">
                Rating
              </dt>
              <dd className="mt-1 tabular text-[1.125rem] font-semibold text-ink">
                {profile.ratingAverage === null
                  ? '—'
                  : `${profile.ratingAverage.toFixed(1)}`}
                <span className="ml-1 text-[0.75rem] font-normal text-faint">
                  {profile.ratingCount > 0 ? `(${profile.ratingCount})` : 'not rated yet'}
                </span>
              </dd>
            </div>
            <div>
              <dt className="text-[0.6875rem] uppercase tracking-[0.08em] text-faint">
                Completed assignments
              </dt>
              <dd className="mt-1 tabular text-[1.125rem] font-semibold text-ink">
                {profile.completedAssignments}
              </dd>
            </div>
            <div>
              <dt className="text-[0.6875rem] uppercase tracking-[0.08em] text-faint">
                Active since
              </dt>
              <dd className="mt-1 text-[1.125rem] font-semibold text-ink">
                {formatDate(profile.activatedAt)}
              </dd>
            </div>
          </dl>
        </section>
      )}

      <div className="mt-10 border-t border-line pt-6 text-[0.875rem] text-muted">
        Questions? Email{' '}
        <a href="mailto:hello@selleasy24.com" className="text-action underline">
          hello@selleasy24.com
        </a>
        {' — '}we usually reply within a business day.
      </div>
    </div>
  );
}

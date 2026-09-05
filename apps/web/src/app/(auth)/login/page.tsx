import Link from 'next/link';
import { LoginForm } from './login-form';

/**
 * The `next` parameter is read here, on the server, and passed down as a prop.
 *
 * Using useSearchParams() in the form instead would force the whole page into a
 * client-side bailout and require a Suspense boundary — for a value the server
 * already has. The action re-validates it against open redirects regardless.
 */
export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const rawNext = params.next;
  const next = Array.isArray(rawNext) ? rawNext[0] : rawNext;

  // Set by the reset flow, which lands here rather than signing the user in —
  // a fresh password should be typed once to prove it took.
  const justReset = params.reset === 'done';

  return (
    <div className="mx-auto max-w-sm px-5 py-16">
      <h1 className="font-display text-[1.75rem] font-extrabold leading-tight tracking-tight text-ink">
        Sign in
      </h1>
      <p className="mt-2 text-[0.875rem] leading-relaxed text-muted">
        Sellers manage listings and enquiries here. Buyers can browse and contact
        owners without an account.
      </p>

      {justReset && (
        <p
          role="status"
          className="mt-5 rounded-control border-l-2 border-action bg-canvas-deep px-3.5 py-3 text-[0.875rem] leading-relaxed text-ink"
        >
          Your password is set. Sign in with it — any other device was signed
          out.
        </p>
      )}

      <div className="mt-7">
        <LoginForm next={next ?? ''} />
      </div>

      <p className="mt-3 text-[0.8125rem]">
        <Link href="/forgot-password" className="text-action hover:underline">
          Forgot your password?
        </Link>
      </p>

      {/*
        Signup CTA sits directly under the primary sign-in action and is
        styled as a secondary button, not a text link buried in a footer.
        A visitor who lands here without an account should not have to
        scan the page to find how to create one.
      */}
      <div className="mt-8 rounded-control border border-line bg-canvas-deep p-5">
        <p className="text-[0.9375rem] font-semibold text-ink">
          New to SellEasy24?
        </p>
        <p className="mt-1 text-[0.8125rem] leading-relaxed text-muted">
          Create an account to save homes, request site visits, list a
          property, or apply to be a field agent.
        </p>
        <Link
          href={`/register${next ? `?next=${encodeURIComponent(next)}` : ''}`}
          className="mt-4 inline-block rounded-control border border-action bg-surface px-5 py-2.5 text-[0.9375rem] font-semibold text-action transition-colors hover:bg-action hover:text-white"
        >
          Create an account
        </Link>
      </div>

      <p className="mt-6 text-[0.75rem] text-faint">
        Five failed attempts locks sign-in for fifteen minutes.
      </p>
    </div>
  );
}

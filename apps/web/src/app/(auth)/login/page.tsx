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

  return (
    <div className="mx-auto max-w-sm px-5 py-16">
      <h1 className="font-display text-[1.75rem] font-extrabold leading-tight tracking-tight text-ink">
        Sign in
      </h1>
      <p className="mt-2 text-[0.875rem] leading-relaxed text-muted">
        Sellers manage listings and enquiries here. Buyers can browse and contact
        owners without an account.
      </p>

      <div className="mt-7">
        <LoginForm next={next ?? ''} />
      </div>

      <div className="mt-7 space-y-2 border-t border-line pt-5 text-[0.8125rem]">
        <p className="text-muted">
          New here?{' '}
          <Link href="/register" className="text-action hover:underline">
            Create an account
          </Link>
        </p>
        <p className="text-faint">
          Five failed attempts locks sign-in for fifteen minutes.
        </p>
      </div>
    </div>
  );
}

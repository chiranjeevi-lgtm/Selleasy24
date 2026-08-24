import type { Metadata } from 'next';
import Link from 'next/link';
import { ResetForm } from './reset-form';

export const metadata: Metadata = {
  title: 'Set a new password',
  // A reset link is a temporary credential; keep it out of search results.
  robots: { index: false, follow: false },
};

interface PageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

export default async function ResetPasswordPage({ searchParams }: PageProps) {
  const params = await searchParams;
  const raw = params.token;
  const token = (Array.isArray(raw) ? raw[0] : raw) ?? '';

  /*
   * A link that arrived without a token is almost always one a mail client
   * mangled — so say what to do about it rather than showing a form that
   * cannot possibly work.
   */
  if (!token) {
    return (
      <div className="mx-auto max-w-sm px-5 py-16">
        <h1 className="font-display text-[1.75rem] font-extrabold leading-tight tracking-tight text-ink">
          This link is incomplete
        </h1>
        <p className="mt-2 text-[0.875rem] leading-relaxed text-muted">
          The reset link seems to have been cut short — some email apps do that
          to long links. Ask for a fresh one and open it in full.
        </p>
        <Link
          href="/forgot-password"
          className="mt-6 inline-block rounded-control bg-action px-5 py-2.5 text-[0.9375rem] font-semibold text-white transition-colors hover:bg-action-hover"
        >
          Send another link
        </Link>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-sm px-5 py-16">
      <h1 className="font-display text-[1.75rem] font-extrabold leading-tight tracking-tight text-ink">
        Set a new password
      </h1>
      <p className="mt-2 text-[0.875rem] leading-relaxed text-muted">
        Choose something you have not used here before.
      </p>

      <div className="mt-7">
        <ResetForm token={token} />
      </div>

      <p className="mt-6 text-[0.875rem] text-muted">
        Link expired?{' '}
        <Link href="/forgot-password" className="text-action underline-offset-4 hover:underline">
          Ask for a new one
        </Link>
      </p>
    </div>
  );
}

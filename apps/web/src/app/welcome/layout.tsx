import Link from 'next/link';
import { redirect } from 'next/navigation';
import { ApiError } from '@/lib/api';
import { serverApi } from '@/lib/server-api';

/**
 * Onboarding shell.
 *
 * Narrow, quiet, and with no navigation out except "do this later" — a page
 * asking one short question should not also offer six places to go instead.
 */
export default async function WelcomeLayout({ children }: { children: React.ReactNode }) {
  try {
    await serverApi.me();
  } catch (error) {
    if (error instanceof ApiError && (error.status === 401 || error.status === 403)) {
      redirect('/login?next=/welcome/phone');
    }
    throw error;
  }

  return (
    <div className="mx-auto max-w-[34rem] px-5 py-10 sm:py-14">
      {children}

      <p className="mt-10 border-t border-line pt-5 text-[0.75rem] leading-relaxed text-faint">
        Everything here is optional and only shapes what we show you. Your budget
        and income are never shown to a seller, and your number goes only to the
        one seller you choose to contact.{' '}
        <Link href="/" className="underline underline-offset-2 hover:text-muted">
          Skip all of this
        </Link>{' '}
        and start browsing if you would rather.
      </p>
    </div>
  );
}

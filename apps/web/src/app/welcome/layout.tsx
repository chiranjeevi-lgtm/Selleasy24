import Link from 'next/link';
import { redirect } from 'next/navigation';
import { ApiError } from '@/lib/api';
import { serverApi } from '@/lib/server-api';

/**
 * Onboarding shell — buyers only.
 *
 * The five welcome steps (phone → purpose → budget → areas → about) ask
 * buyer-specific questions: what they want, their spending range, their
 * monthly income, preferred localities. None of those apply to a seller
 * listing a property or a field agent servicing owners.
 *
 * The signUp action already routes sellers to /seller/phone and builders
 * to /seller/projects, but nothing was stopping a signed-in seller from
 * *landing* on /welcome/* directly (bookmark, URL edit, back-button
 * across sessions). This layout closes that door — any non-buyer role
 * is bounced to their proper landing surface.
 *
 * Narrow, quiet, and with no navigation out except "do this later" — a
 * page asking one short question should not also offer six places to
 * go instead.
 */
export default async function WelcomeLayout({ children }: { children: React.ReactNode }) {
  let me;
  try {
    me = await serverApi.me();
  } catch (error) {
    if (error instanceof ApiError && (error.status === 401 || error.status === 403)) {
      redirect('/login?next=/welcome/phone');
    }
    throw error;
  }

  // Role guard — mirrors safeRedirectTarget in (auth)/actions.ts so a
  // signed-in seller / builder / agent lands where they belong, not on
  // a set of buyer-preference forms that don't apply to them.
  if (me.role === 'OWNER' || me.role === 'BROKER') {
    redirect('/seller/listings');
  }
  if (me.role === 'BUILDER') {
    redirect('/seller/projects');
  }
  if (me.role === 'FIELD_AGENT' || me.role === 'AGENT_APPLICANT') {
    redirect('/agent/status');
  }
  if (me.role === 'VERIFIER' || me.role === 'MODERATOR' || me.role === 'ADMIN' || me.role === 'SUPER_ADMIN') {
    redirect('/');
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

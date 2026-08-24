import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { serverApi } from '@/lib/server-api';
import { PhoneForm } from '@/app/seller/phone/phone-form';
import { SkipLink, StepProgress, nextHref } from '../steps';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = { title: 'Verify your number' };

export default async function WelcomePhonePage() {
  const me = await serverApi.me().catch(() => null);

  // Already verified — most likely someone revisiting the URL. No reason to
  // make them confirm a number the platform already trusts.
  if (me?.isPhoneVerified) {
    redirect(nextHref('phone'));
  }

  return (
    <div>
      <StepProgress current="phone" />

      <h1 className="mt-6 display text-[1.625rem] text-ink sm:text-[1.875rem]">
        First, your number
      </h1>
      <p className="mt-2.5 text-[0.9375rem] leading-relaxed text-muted">
        We confirm it once, now, so that later — when you ask to see a property
        — nothing stops to check. The owner you contact gets this number. No
        other seller, agent or anyone else ever does.
      </p>

      <div className="mt-6">
        <PhoneForm
          initialPhone={me?.phone ?? null}
          variant="buyer"
          nextHref={nextHref('phone')}
          nextLabel="Continue"
        />
      </div>

      <div className="mt-5">
        <SkipLink current="phone" />
      </div>
    </div>
  );
}

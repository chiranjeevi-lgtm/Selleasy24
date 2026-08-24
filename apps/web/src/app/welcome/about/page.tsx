import type { Metadata } from 'next';
import { serverApi } from '@/lib/server-api';
import { StepProgress } from '../steps';
import { AboutForm } from './about-form';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = { title: 'About you' };

export default async function WelcomeAboutPage() {
  const profile = await serverApi.buyerProfile();

  return (
    <div>
      <StepProgress current="about" />

      <h1 className="mt-6 display text-[1.625rem] text-ink sm:text-[1.875rem]">
        Last one — what do you do?
      </h1>
      <p className="mt-2.5 text-[0.9375rem] leading-relaxed text-muted">
        It is the first question a lender asks, so having it saves you repeating
        yourself later. It does not change which properties you see, and no
        seller ever sees it.
      </p>

      <div className="mt-7">
        <AboutForm profile={profile} />
      </div>
    </div>
  );
}

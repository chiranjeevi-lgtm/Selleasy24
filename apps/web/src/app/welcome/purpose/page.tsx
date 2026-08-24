import type { Metadata } from 'next';
import { serverApi } from '@/lib/server-api';
import { SkipLink, StepProgress } from '../steps';
import { PurposeForm } from './purpose-form';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = { title: 'What are you looking for?' };

export default async function WelcomePurposePage() {
  const profile = await serverApi.buyerProfile();

  return (
    <div>
      <StepProgress current="purpose" />

      <h1 className="mt-6 display text-[1.625rem] text-ink sm:text-[1.875rem]">
        What are you looking for?
      </h1>
      <p className="mt-2.5 text-[0.9375rem] leading-relaxed text-muted">
        Two questions. Someone buying a home to live in and someone buying to let
        want different things from the same flat, so this changes what we put in
        front of you.
      </p>

      <div className="mt-7">
        <PurposeForm profile={profile} />
      </div>

      <div className="mt-5">
        <SkipLink current="purpose" />
      </div>
    </div>
  );
}

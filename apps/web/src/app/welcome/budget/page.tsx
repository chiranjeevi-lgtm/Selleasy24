import type { Metadata } from 'next';
import { serverApi } from '@/lib/server-api';
import { SkipLink, StepProgress } from '../steps';
import { BudgetForm } from './budget-form';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = { title: 'Your budget' };

export default async function WelcomeBudgetPage() {
  const profile = await serverApi.buyerProfile();

  return (
    <div>
      <StepProgress current="budget" />

      <h1 className="mt-6 display text-[1.625rem] text-ink sm:text-[1.875rem]">
        What is your budget?
      </h1>
      <p className="mt-2.5 text-[0.9375rem] leading-relaxed text-muted">
        A rough range is enough. We will show you a little above it too — budgets
        move — but nothing far out of reach.
      </p>

      <div className="mt-7">
        <BudgetForm profile={profile} />
      </div>

      <div className="mt-5">
        <SkipLink current="budget" />
      </div>
    </div>
  );
}

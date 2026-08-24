import type { Metadata } from 'next';
import { serverApi } from '@/lib/server-api';
import { SkipLink, StepProgress } from '../steps';
import { AreasForm } from './areas-form';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = { title: 'Where do you want to live?' };

export default async function WelcomeAreasPage() {
  const [profile, localities] = await Promise.all([
    serverApi.buyerProfile(),
    serverApi.localities(),
  ]);

  return (
    <div>
      <StepProgress current="areas" />

      <h1 className="mt-6 display text-[1.625rem] text-ink sm:text-[1.875rem]">
        Which areas?
      </h1>
      <p className="mt-2.5 text-[0.9375rem] leading-relaxed text-muted">
        Pick the parts of Hyderabad you would actually live in. Properties there
        come first — everything else is still searchable.
      </p>

      <div className="mt-7">
        <AreasForm
          localities={localities.map((locality) => ({
            id: locality.id,
            name: locality.name,
          }))}
          selected={profile.localities.map((locality) => locality.id)}
        />
      </div>

      <div className="mt-5">
        <SkipLink current="areas" />
      </div>
    </div>
  );
}

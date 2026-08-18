import type { Metadata } from 'next';
import Link from 'next/link';
import { serverApi } from '@/lib/server-api';
import { PhoneForm } from './phone-form';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Verify your phone',
};

export default async function PhonePage() {
  const me = await serverApi.me().catch(() => null);

  return (
    <div className="mx-auto max-w-[38rem]">
      <nav aria-label="Breadcrumb" className="mb-5 text-[0.875rem]">
        <Link href="/seller/listings" className="text-muted transition-colors hover:text-ink">
          My listings
        </Link>
        <span className="mx-2 text-faint" aria-hidden="true">/</span>
        <span className="text-ink">Verify phone</span>
      </nav>

      <h1 className="display text-[1.75rem] text-ink">Verify your phone number</h1>
      <p className="mt-2 text-[0.9375rem] leading-relaxed text-muted">
        Buyers reach you on this number, so we confirm it before a listing can go
        for review. It is shared only with buyers who enquire about your property.
      </p>

      {me?.isPhoneVerified && me.phone && (
        <p className="mt-4 rounded-card border border-line bg-surface px-4 py-3 text-[0.875rem] text-muted">
          <span className="font-medium text-ink tabular">{me.phone}</span> is already
          verified. Verifying again will replace it.
        </p>
      )}

      <div className="mt-6">
        <PhoneForm initialPhone={me?.phone ?? null} />
      </div>
    </div>
  );
}

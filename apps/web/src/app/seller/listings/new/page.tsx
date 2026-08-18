import Link from 'next/link';
import { serverApi } from '@/lib/server-api';
import { NewListingForm } from './new-listing-form';

export const dynamic = 'force-dynamic';

export default async function NewListingPage() {
  // Localities are fixed reference data — a select, never free text, so search
  // stays consistent.
  const localities = await serverApi.localities('Hyderabad').catch(() => []);

  return (
    <div className="max-w-2xl">
      <nav className="mb-5 text-[0.8125rem]">
        <Link href="/seller/listings" className="text-action hover:underline">
          Listings
        </Link>
        <span className="mx-2 text-faint" aria-hidden="true">
          /
        </span>
        <span className="text-muted">New</span>
      </nav>

      <h2 className="font-display text-[1.375rem] font-extrabold leading-tight tracking-tight text-ink">
        Property details
      </h2>
      <p className="mt-2 max-w-prose text-[0.875rem] leading-relaxed text-muted">
        Save these details first. You will add photos and ownership documents on
        the next screen, then submit the whole thing for verification.
      </p>

      <div className="mt-7">
        <NewListingForm localities={localities} />
      </div>
    </div>
  );
}

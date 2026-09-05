import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { ApiError } from '@/lib/api';
import { serverApi, type SavedSearchEntry } from '@/lib/server-api';
import { deleteSavedSearch, toggleAlerts } from './actions';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = {
  title: 'Saved searches',
  description:
    'Every search you have saved on SellEasy24 — re-run any of them, or turn on alerts when we support them.',
};

interface PageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

function summariseFilters(qs: string): Array<{ label: string; value: string }> {
  const p = new URLSearchParams(qs);
  const out: Array<{ label: string; value: string }> = [];
  const push = (label: string, value: string | null) => {
    if (value) out.push({ label, value });
  };
  push('Locality', p.get('neighborhoodId') ? 'Selected' : null);
  push('Bedrooms', p.get('bedrooms'));
  push('Property type', p.get('propertyType'));
  const maxPrice = p.get('maxPrice');
  if (maxPrice) {
    const n = Number(maxPrice);
    if (Number.isFinite(n)) {
      out.push({
        label: 'Max budget',
        value:
          n >= 10_000_000
            ? `₹${(n / 10_000_000).toFixed(2)} Cr`
            : `₹${(n / 100_000).toFixed(1)} L`,
      });
    }
  }
  const furnishing = p.get('furnishing');
  if (furnishing) out.push({ label: 'Furnishing', value: furnishing });
  return out;
}

function formatDate(iso: string): string {
  const d = new Date(iso);
  return `${d.getDate()} ${d.toLocaleString('en-IN', { month: 'short' })} ${d.getFullYear()}`;
}

function SavedRow({ search }: { search: SavedSearchEntry }) {
  const filters = summariseFilters(search.queryString);
  const deleteAction = deleteSavedSearch.bind(null, search.id);
  const toggleAction = toggleAlerts.bind(null, search.id, !search.alertsEnabled);

  return (
    <article className="rounded-card bg-surface p-6 shadow-card ring-1 ring-line">
      <header className="flex flex-wrap items-baseline justify-between gap-3">
        <div>
          <p className="display text-[1.125rem] text-ink">{search.name}</p>
          <p className="mt-1 text-[0.8125rem] text-faint">
            Saved {formatDate(search.createdAt)}
          </p>
        </div>
        <span
          className={
            search.alertsEnabled
              ? 'rounded-full bg-verify px-2.5 py-0.5 text-[0.6875rem] font-semibold uppercase tracking-[0.08em] text-verify-ink'
              : 'rounded-full bg-canvas-deep px-2.5 py-0.5 text-[0.6875rem] font-semibold uppercase tracking-[0.08em] text-muted'
          }
        >
          {search.alertsEnabled ? 'Alerts on' : 'Alerts off'}
        </span>
      </header>

      {filters.length > 0 && (
        <dl className="mt-4 flex flex-wrap gap-x-4 gap-y-2">
          {filters.map((f) => (
            <div key={f.label} className="text-[0.8125rem]">
              <dt className="inline text-muted">{f.label}: </dt>
              <dd className="inline font-medium text-ink">{f.value}</dd>
            </div>
          ))}
        </dl>
      )}

      <footer className="mt-5 flex flex-wrap gap-3 border-t border-line-soft pt-4">
        <Link
          href={`/?${search.queryString}`}
          className="rounded-control bg-action px-4 py-2 text-[0.8125rem] font-semibold text-white transition-colors hover:bg-action-hover"
        >
          Run this search
        </Link>

        <form action={toggleAction}>
          <button
            type="submit"
            className="rounded-control border border-line bg-surface px-4 py-2 text-[0.8125rem] font-medium text-ink transition-colors hover:border-muted"
            title="Alerts are captured; email/push delivery ships in a follow-up."
          >
            {search.alertsEnabled ? 'Turn alerts off' : 'Turn alerts on'}
          </button>
        </form>

        <form action={deleteAction} className="ml-auto">
          <button
            type="submit"
            className="rounded-control px-4 py-2 text-[0.8125rem] font-medium text-seal transition-colors hover:bg-seal-soft"
          >
            Delete
          </button>
        </form>
      </footer>
    </article>
  );
}

export default async function SavedSearchesPage({ searchParams }: PageProps) {
  const params = await searchParams;
  const errorRaw = params.error;
  const errorMessage =
    typeof errorRaw === 'string' ? errorRaw : Array.isArray(errorRaw) ? errorRaw[0] : undefined;
  const savedFlash = params.saved === '1';

  let data: { items: SavedSearchEntry[] };
  try {
    data = await serverApi.mySavedSearches();
  } catch (error) {
    if (error instanceof ApiError && (error.status === 401 || error.status === 403)) {
      redirect('/login?next=/saved-searches');
    }
    throw error;
  }

  return (
    <div className="mx-auto max-w-[64rem] px-5 py-12 sm:px-8 sm:py-16">
      <header className="max-w-2xl">
        <span aria-hidden="true" className="mb-3 block h-[3px] w-10 bg-verify" />
        <h1 className="display text-[2.25rem] text-ink sm:text-[3rem]">
          Your saved searches
        </h1>
        <p className="mt-5 text-[1.0625rem] leading-relaxed text-muted">
          Filters you&rsquo;ve saved — re-run any of them, or turn on
          alerts to be notified when new inventory matches. Up to 20 saved
          per account.
        </p>
      </header>

      {savedFlash && (
        <div className="mt-8 rounded-card bg-verify-soft p-4 ring-1 ring-verify/25">
          <p className="text-[0.9375rem] font-semibold text-verify-ink">
            Search saved. Find it in the list below.
          </p>
        </div>
      )}

      {errorMessage && (
        <div className="mt-8 rounded-card bg-seal-soft p-4 ring-1 ring-seal/25">
          <p className="text-[0.9375rem] font-medium text-seal">{errorMessage}</p>
        </div>
      )}

      {data.items.length === 0 ? (
        <div className="mt-12 rounded-card border border-dashed border-line bg-surface px-6 py-16 text-center">
          <p className="text-[1.0625rem] font-medium text-ink">
            No saved searches yet
          </p>
          <p className="mx-auto mt-2 max-w-md text-[0.9375rem] leading-relaxed text-muted">
            Apply filters on the search page, then click the &ldquo;Save
            search&rdquo; button next to the results header. You can come
            back here to re-run them any time.
          </p>
          <Link
            href="/"
            className="mt-6 inline-block rounded-control bg-action px-5 py-2.5 text-[0.9375rem] font-semibold text-white transition-colors hover:bg-action-hover"
          >
            Browse verified homes
          </Link>
        </div>
      ) : (
        <ul className="mt-10 space-y-4">
          {data.items.map((s) => (
            <li key={s.id}>
              <SavedRow search={s} />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

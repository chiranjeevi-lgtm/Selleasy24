import { createSavedSearch } from '@/app/saved-searches/actions';

/**
 * "Save this search" — small inline form appears above the results grid
 * whenever any filter is active. Client-free: server action handles the
 * POST + redirect to /saved-searches?saved=1.
 *
 * Rendered by the homepage only when `values` has at least one truthy
 * entry. If the buyer isn't signed in the server action returns a 401 that
 * surfaces as an error on /saved-searches — a redirect to /login from the
 * action would be nicer but requires the current URL to preserve as `next`,
 * which is more coupling than the value warrants right now.
 */
export function SaveSearchForm({
  values,
}: {
  values: Record<string, string | undefined>;
}) {
  const queryString = new URLSearchParams();
  for (const [key, value] of Object.entries(values)) {
    if (value) queryString.set(key, value);
  }
  const qs = queryString.toString();
  if (!qs) return null;

  return (
    <form
      action={createSavedSearch}
      className="flex flex-wrap items-center gap-2"
    >
      <input type="hidden" name="queryString" value={qs} />
      <input
        type="text"
        name="name"
        placeholder="Name this search (optional)"
        maxLength={120}
        className="w-56 rounded-control border border-line bg-surface px-3 py-1.5 text-[0.8125rem] text-ink outline-none transition-colors focus:border-action"
      />
      <button
        type="submit"
        className="rounded-control border border-verify bg-verify px-3.5 py-1.5 text-[0.8125rem] font-semibold text-verify-ink transition-transform duration-200 hover:-translate-y-px"
      >
        Save this search
      </button>
    </form>
  );
}

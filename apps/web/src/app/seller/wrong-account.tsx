import Link from 'next/link';

/**
 * Shown when a page in the selling area is not for this kind of account.
 *
 * The nav does not offer these links to a builder, so reaching one means a
 * typed URL or an old bookmark. Without this the page throws on the API's 403
 * and the person gets a 500, which tells them nothing and looks like a fault
 * on our side rather than a page that was never theirs.
 */
export function WrongAccount({
  what,
  goTo,
  goToLabel,
}: {
  what: string;
  goTo: string;
  goToLabel: string;
}) {
  return (
    <div className="rounded-card border border-dashed border-line px-6 py-14 text-center">
      <p className="text-[0.9375rem] text-ink">{what} are not part of this account</p>
      <p className="mx-auto mt-2 max-w-sm text-[0.8125rem] leading-relaxed text-muted">
        Developer accounts manage projects rather than individual resale
        properties. If that is wrong, contact us and we will sort it out.
      </p>
      <Link
        href={goTo}
        className="mt-5 inline-block rounded-control border border-action px-4 py-2 text-[0.875rem] text-action transition-colors hover:bg-action hover:text-surface"
      >
        {goToLabel}
      </Link>
    </div>
  );
}

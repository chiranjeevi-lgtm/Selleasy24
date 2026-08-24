import Link from 'next/link';
import type { Recommendation } from '@/lib/server-api';
import { formatArea, formatRupeesShort } from '@/lib/format';

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000';

function photoUrl(url: string): string {
  return url.startsWith('http') ? url : `${API_BASE}${url}`;
}

/**
 * Properties matched to what the buyer told us.
 *
 * Every card carries the reasons it is here. That is the whole difference
 * between this and the "recommended for you" strip on every other portal —
 * a ranking nobody can interrogate is indistinguishable from paid placement,
 * and this platform's entire argument is that it shows its working.
 *
 * The component is not rendered at all when there is nothing to say. Filling
 * the space with arbitrary listings under a personalised heading would be the
 * exact dishonesty we are competing against.
 */
export function Recommended({
  items,
  completedOnboarding,
}: {
  items: Recommendation[];
  /** Drives whether we offer to ask more, or to change what we know. */
  completedOnboarding: boolean;
}) {
  if (items.length === 0) {
    return null;
  }

  return (
    <section
      className="mx-auto max-w-[76rem] px-5 pt-14 sm:px-8"
      aria-labelledby="recommended-heading"
    >
      <div className="flex flex-wrap items-baseline justify-between gap-3 border-b border-line pb-3.5">
        <div>
          <h2 id="recommended-heading" className="display text-[1.375rem] text-ink">
            Matched to what you told us
          </h2>
          <p className="mt-1.5 text-[0.875rem] text-muted">
            Each one says why it is here. If the reasons are wrong, change what
            we know and they will change too.
          </p>
        </div>

        <Link
          href={completedOnboarding ? '/welcome/purpose' : '/welcome/phone'}
          className="text-[0.875rem] text-action underline-offset-4 transition-colors hover:underline"
        >
          {completedOnboarding ? 'Update your preferences' : 'Tell us more'}
        </Link>
      </div>

      <ul className="mt-6 grid gap-x-6 gap-y-8 sm:grid-cols-2 lg:grid-cols-3">
        {items.map((item) => (
          <li key={item.id}>
            <Link href={`/listings/${item.id}`} className="group block">
              <div className="relative aspect-[4/3] overflow-hidden rounded-card bg-canvas-deep shadow-card ring-1 ring-line transition-all duration-300 group-hover:shadow-lift group-hover:ring-action/25">
                {item.photos[0] ? (
                  /* eslint-disable-next-line @next/next/no-img-element */
                  <img
                    src={photoUrl(item.photos[0].url)}
                    alt=""
                    className="h-full w-full object-cover transition-transform duration-500 ease-out group-hover:scale-[1.04]"
                    loading="lazy"
                  />
                ) : (
                  <div className="flex h-full items-center justify-center">
                    <span className="label text-faint">Photographs coming</span>
                  </div>
                )}
              </div>

              <div className="pt-3.5">
                <div className="flex items-baseline justify-between gap-3">
                  <p className="display text-[1.375rem] leading-none tabular text-action">
                    {formatRupeesShort(item.price)}
                  </p>
                  <span className="label text-faint tabular">{item.matchScore}% match</span>
                </div>

                <h3 className="mt-2 text-[1rem] font-semibold leading-snug text-ink">
                  {item.property.bedrooms} BHK in {item.property.locality}
                </h3>

                <p className="mt-1 text-[0.8125rem] text-muted tabular">
                  {formatArea(item.property.areaSqft)}
                </p>
              </div>
            </Link>

            {/*
              The reasons, outside the link so they read as our explanation
              rather than as part of the property's own description.
            */}
            <ul className="mt-2.5 space-y-1">
              {item.reasons.map((reason) => (
                <li
                  key={reason}
                  className="flex items-start gap-1.5 text-[0.8125rem] leading-snug text-muted"
                >
                  <span aria-hidden="true" className="mt-[3px] text-verify-ink">
                    ✓
                  </span>
                  <span>{reason}</span>
                </li>
              ))}
            </ul>
          </li>
        ))}
      </ul>
    </section>
  );
}

/**
 * Shown to a signed-in buyer who has told us nothing yet.
 *
 * An invitation rather than a nag, and it states what it is for — "personalise
 * your experience" means nothing to anyone.
 */
export function RecommendationsPrompt() {
  return (
    <section className="mx-auto max-w-[76rem] px-5 pt-14 sm:px-8">
      <div className="rounded-card border border-dashed border-line bg-surface px-6 py-7 sm:flex sm:items-center sm:justify-between sm:gap-6">
        <div className="max-w-prose">
          <h2 className="text-[1.0625rem] font-semibold text-ink">
            Tell us what you are after
          </h2>
          <p className="mt-1.5 text-[0.875rem] leading-relaxed text-muted">
            Four short questions — budget, areas, size — and we will put the
            properties that actually fit at the top, with the reason next to each
            one. It takes about a minute and you can skip any of it.
          </p>
        </div>

        <Link
          href="/welcome/purpose"
          className="mt-5 inline-block shrink-0 rounded-control bg-action px-5 py-2.5 text-[0.9375rem] font-semibold text-white transition-colors hover:bg-action-hover sm:mt-0"
        >
          Get started
        </Link>
      </div>
    </section>
  );
}

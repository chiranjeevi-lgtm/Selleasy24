'use client';

import { useEffect, useState } from 'react';
import { api, type LocalityReview, type LocalityReviewsResponse } from '@/lib/api';

/**
 * Approved-reviews display for a locality overview page.
 *
 * Read-only for this session — the submit + edit flow needs auth wiring
 * (server actions or bearer-token cookie plumbing) that comes next. Once
 * that lands, this same component grows a form section conditional on the
 * authenticated user state; the display layer here doesn't change.
 *
 * Runs on the client because we hit a live endpoint and want the summary
 * card to update on refresh without a full page reload. Server-side render
 * would work too but adds an extra fetch to the initial page cost.
 */

function StarBar({ rating }: { rating: number }) {
  return (
    <div className="flex items-center gap-0.5" aria-label={`${rating} out of 5`}>
      {[1, 2, 3, 4, 5].map((n) => (
        <svg
          key={n}
          viewBox="0 0 20 20"
          aria-hidden="true"
          className={`h-4 w-4 ${n <= rating ? 'text-verify' : 'text-line'}`}
          fill="currentColor"
        >
          <path d="M10 1.5l2.5 5.5 6 .8-4.4 4.1 1.1 6-5.2-2.9-5.2 2.9 1.1-6L1.5 7.8l6-.8L10 1.5z" />
        </svg>
      ))}
    </div>
  );
}

function BucketBar({ count, max }: { count: number; max: number }) {
  const pct = max === 0 ? 0 : (count / max) * 100;
  return (
    <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-line-soft">
      <div
        className="h-full bg-verify transition-all duration-300"
        style={{ width: `${pct}%` }}
      />
    </div>
  );
}

const dateFormat = new Intl.DateTimeFormat('en-IN', {
  year: 'numeric',
  month: 'long',
});

export function LocalityReviews({ neighborhoodId }: { neighborhoodId: string }) {
  const [data, setData] = useState<LocalityReviewsResponse | null>(null);
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading');
  const [errorMessage, setErrorMessage] = useState<string>('');

  useEffect(() => {
    let cancelled = false;
    setStatus('loading');
    api
      .localityReviews(neighborhoodId, { limit: 20 })
      .then((response) => {
        if (cancelled) return;
        setData(response);
        setStatus('ready');
      })
      .catch((error: unknown) => {
        if (cancelled) return;
        setStatus('error');
        setErrorMessage(
          error instanceof Error ? error.message : 'Reviews are temporarily unavailable.',
        );
      });
    return () => {
      cancelled = true;
    };
  }, [neighborhoodId]);

  if (status === 'loading') {
    return (
      <div className="rounded-card bg-surface p-6 shadow-card ring-1 ring-line">
        <p className="text-[0.9375rem] text-muted">Loading resident reviews…</p>
      </div>
    );
  }

  if (status === 'error') {
    return (
      <div className="rounded-card border border-line-soft bg-surface p-6">
        <p className="text-[0.9375rem] text-muted">{errorMessage}</p>
      </div>
    );
  }

  if (!data || data.summary.totalCount === 0) {
    return (
      <div className="rounded-card border border-dashed border-line bg-surface px-6 py-10 text-center">
        <p className="text-[1rem] font-semibold text-ink">
          No resident reviews yet
        </p>
        <p className="mx-auto mt-2 max-w-md text-[0.9375rem] leading-relaxed text-muted">
          The first review for this locality is the most useful one — it
          shapes how every buyer after you decides. Sign in to your account
          and share what you&rsquo;ve seen.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <ReviewSummary summary={data.summary} />
      <ul className="space-y-5">
        {data.items.map((review) => (
          <li key={review.id}>
            <ReviewCard review={review} />
          </li>
        ))}
      </ul>
      {data.total > data.items.length && (
        <p className="text-center text-[0.875rem] text-muted">
          Showing {data.items.length} of {data.total} reviews.
        </p>
      )}
    </div>
  );
}

function ReviewSummary({
  summary,
}: {
  summary: LocalityReviewsResponse['summary'];
}) {
  const distributionEntries = ([5, 4, 3, 2, 1] as const).map((rating) => ({
    rating,
    count: summary.distribution[String(rating) as '1' | '2' | '3' | '4' | '5'] ?? 0,
  }));
  const maxCount = Math.max(...distributionEntries.map((e) => e.count), 1);

  return (
    <div className="grid gap-8 rounded-card bg-surface p-6 shadow-card ring-1 ring-line sm:grid-cols-[auto_1fr] sm:p-8">
      <div className="text-center sm:text-left">
        <p className="tabular display text-[3rem] text-ink">
          {summary.averageRating?.toFixed(1) ?? '—'}
        </p>
        <div className="mt-1 inline-block sm:block">
          <StarBar rating={Math.round(summary.averageRating ?? 0)} />
        </div>
        <p className="mt-1 text-[0.8125rem] text-muted">
          {summary.totalCount} review{summary.totalCount === 1 ? '' : 's'}
        </p>
      </div>

      <div>
        <p className="label text-faint">Ratings breakdown</p>
        <div className="mt-3 space-y-2">
          {distributionEntries.map(({ rating, count }) => (
            <div key={rating} className="flex items-center gap-3">
              <span className="w-8 text-right text-[0.75rem] font-medium text-muted">
                {rating} ★
              </span>
              <BucketBar count={count} max={maxCount} />
              <span className="w-8 text-left text-[0.75rem] text-muted tabular">
                {count}
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function ReviewCard({ review }: { review: LocalityReview }) {
  return (
    <article className="rounded-card bg-surface p-6 shadow-card ring-1 ring-line">
      <header className="flex flex-wrap items-baseline justify-between gap-3">
        <div className="flex items-baseline gap-3">
          <StarBar rating={review.rating} />
          <p className="text-[0.9375rem] font-semibold text-ink">
            {review.authorFirstName}
          </p>
          {review.tenureYears !== null && review.tenureYears > 0 && (
            <p className="text-[0.75rem] text-muted">
              Lived here {review.tenureYears} year
              {review.tenureYears === 1 ? '' : 's'}
            </p>
          )}
        </div>
        <p className="text-[0.75rem] text-faint">
          {dateFormat.format(new Date(review.createdAt))}
        </p>
      </header>

      <dl className="mt-5 grid gap-4 sm:grid-cols-2">
        <div>
          <dt className="label text-verify">What works</dt>
          <dd className="mt-2 text-[0.9375rem] leading-relaxed text-ink">
            {review.pros}
          </dd>
        </div>
        <div>
          <dt className="label text-seal">What doesn&rsquo;t</dt>
          <dd className="mt-2 text-[0.9375rem] leading-relaxed text-ink">
            {review.cons}
          </dd>
        </div>
      </dl>
    </article>
  );
}

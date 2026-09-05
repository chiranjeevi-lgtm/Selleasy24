'use client';

import { useEffect, useMemo, useState } from 'react';
import { api, ApiError, type Locality, type ValuationResult } from '@/lib/api';

/**
 * Property valuation tool.
 *
 * Client-side form + async POST to /valuations/estimate. Deliberately does
 * NOT persist inputs anywhere: a valuation tool is a decision aid, not a
 * data-collection funnel (same principle as the EMI calculator).
 *
 * The result panel is opinionated: we show the confidence tier prominently
 * because "estimated ₹1.15 Cr" without a confidence signal is exactly the
 * kind of black-box number that trains buyers to distrust the estimate the
 * one time it's actually wrong.
 */

const PROPERTY_TYPES = [
  { value: 'APARTMENT', label: 'Apartment' },
  { value: 'FLAT', label: 'Flat' },
  { value: 'HOUSE', label: 'Independent house' },
  { value: 'BUILDING', label: 'Building' },
] as const;

const BEDROOM_OPTIONS = ['1', '2', '3', '4', '5'] as const;

function formatCompactINR(amount: number): string {
  if (!Number.isFinite(amount) || amount <= 0) return '₹0';
  if (amount >= 10_000_000) return `₹${(amount / 10_000_000).toFixed(2)} Cr`;
  if (amount >= 100_000) return `₹${(amount / 100_000).toFixed(2)} L`;
  return `₹${Math.round(amount).toLocaleString('en-IN')}`;
}

function formatPerSqft(amount: number): string {
  if (!Number.isFinite(amount) || amount <= 0) return '—';
  return `₹${Math.round(amount).toLocaleString('en-IN')}`;
}

const CONFIDENCE_STYLE: Record<
  ValuationResult['confidence'],
  { label: string; className: string; description: string }
> = {
  high: {
    label: 'High confidence',
    className: 'bg-verify text-verify-ink',
    description: '20+ recent comparables backing this range.',
  },
  medium: {
    label: 'Medium confidence',
    className: 'bg-verify-soft text-verify-ink ring-1 ring-verify/40',
    description: '10–20 comparables — solid signal, some variance.',
  },
  low: {
    label: 'Low confidence',
    className: 'bg-canvas-deep text-ink ring-1 ring-line',
    description: 'Only a handful of comparables — treat the range as a hint, not a valuation.',
  },
  insufficient: {
    label: 'Insufficient data',
    className: 'bg-seal-soft text-seal ring-1 ring-seal/30',
    description: 'Not enough matching inventory to publish an honest range.',
  },
};

export function ValuationCalculator() {
  const [localities, setLocalities] = useState<Locality[]>([]);
  const [localitiesLoading, setLocalitiesLoading] = useState(true);

  const [propertyType, setPropertyType] = useState<string>('APARTMENT');
  const [bedrooms, setBedrooms] = useState<string>('3');
  const [areaSqft, setAreaSqft] = useState<number>(1500);
  const [neighborhoodId, setNeighborhoodId] = useState<string>('');

  const [status, setStatus] = useState<'idle' | 'loading' | 'ready' | 'error'>('idle');
  const [result, setResult] = useState<ValuationResult | null>(null);
  const [errorMessage, setErrorMessage] = useState<string>('');

  useEffect(() => {
    let cancelled = false;
    setLocalitiesLoading(true);
    api
      .localities('Hyderabad')
      .then((rows) => {
        if (cancelled) return;
        setLocalities(rows);
        // Default to the first locality so the form has a sensible starting
        // state — otherwise "Estimate" pressed without touching the dropdown
        // fires a request with no location.
        if (rows[0] && !neighborhoodId) setNeighborhoodId(rows[0].id);
      })
      .catch(() => {
        // The user can still submit if they select a locality manually via
        // fallback UI — swallowing here so an API blip doesn't block the tool.
      })
      .finally(() => {
        if (!cancelled) setLocalitiesLoading(false);
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const canSubmit = useMemo(() => {
    return (
      Boolean(neighborhoodId) &&
      Boolean(propertyType) &&
      Number(bedrooms) >= 0 &&
      areaSqft >= 100
    );
  }, [neighborhoodId, propertyType, bedrooms, areaSqft]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!canSubmit) return;
    setStatus('loading');
    setResult(null);
    setErrorMessage('');
    try {
      const payload = await api.estimateValuation({
        neighborhoodId,
        propertyType,
        bedrooms: Number(bedrooms),
        areaSqft,
      });
      setResult(payload);
      setStatus('ready');
    } catch (error) {
      setStatus('error');
      setErrorMessage(
        error instanceof ApiError
          ? error.message
          : 'Something went wrong. Try again.',
      );
    }
  }

  return (
    <div className="rounded-card bg-surface p-6 shadow-card ring-1 ring-line sm:p-8">
      <form onSubmit={handleSubmit} className="grid gap-6 lg:grid-cols-[1.1fr_1fr]">
        <div className="space-y-5">
          <label className="block">
            <span className="text-[0.75rem] font-medium text-muted">Locality</span>
            <select
              value={neighborhoodId}
              onChange={(e) => setNeighborhoodId(e.target.value)}
              disabled={localitiesLoading}
              className="mt-1.5 w-full rounded-control border border-line bg-surface px-3 py-2 text-[0.9375rem] text-ink outline-none transition-colors focus:border-action focus:ring-2 focus:ring-action/15"
            >
              {localitiesLoading && <option value="">Loading localities…</option>}
              {!localitiesLoading && localities.length === 0 && (
                <option value="">No localities available</option>
              )}
              {localities.map((locality) => (
                <option key={locality.id} value={locality.id}>
                  {locality.name}
                </option>
              ))}
            </select>
          </label>

          <label className="block">
            <span className="text-[0.75rem] font-medium text-muted">Property type</span>
            <select
              value={propertyType}
              onChange={(e) => setPropertyType(e.target.value)}
              className="mt-1.5 w-full rounded-control border border-line bg-surface px-3 py-2 text-[0.9375rem] text-ink outline-none transition-colors focus:border-action focus:ring-2 focus:ring-action/15"
            >
              {PROPERTY_TYPES.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>

          <fieldset>
            <legend className="text-[0.75rem] font-medium text-muted">Configuration</legend>
            <div className="mt-2 flex flex-wrap gap-2">
              {BEDROOM_OPTIONS.map((option) => (
                <label key={option}>
                  <input
                    type="radio"
                    name="bedrooms"
                    value={option}
                    checked={bedrooms === option}
                    onChange={(e) => setBedrooms(e.target.value)}
                    className="peer sr-only"
                  />
                  <span className="inline-block cursor-pointer rounded-control border border-line px-3.5 py-1.5 text-[0.875rem] text-muted transition-colors hover:border-muted hover:text-ink peer-checked:border-action peer-checked:bg-action peer-checked:text-white">
                    {option} BHK
                  </span>
                </label>
              ))}
            </div>
          </fieldset>

          <label className="block">
            <span className="text-[0.75rem] font-medium text-muted">
              Area (sqft) — built-up
            </span>
            <input
              type="number"
              value={areaSqft}
              min={100}
              max={100_000}
              step={50}
              onChange={(e) => setAreaSqft(Number(e.target.value))}
              className="mt-1.5 w-full rounded-control border border-line bg-surface px-3 py-2 text-[0.9375rem] text-ink outline-none transition-colors focus:border-action focus:ring-2 focus:ring-action/15"
            />
          </label>

          <button
            type="submit"
            disabled={!canSubmit || status === 'loading'}
            className="rounded-control bg-action px-5 py-2.5 text-[0.9375rem] font-semibold text-white transition-colors hover:bg-action-hover disabled:cursor-not-allowed disabled:opacity-60"
          >
            {status === 'loading' ? 'Estimating…' : 'Estimate value'}
          </button>
        </div>

        <div className="rounded-card bg-canvas-deep p-6">
          {status === 'idle' && (
            <>
              <p className="label text-faint">Estimated value</p>
              <p className="mt-3 text-[0.9375rem] leading-relaxed text-muted">
                Enter a locality, configuration and area, then press Estimate.
                The range is computed from verified listings on SellEasy24,
                not third-party guesses.
              </p>
            </>
          )}

          {status === 'loading' && (
            <>
              <p className="label text-faint">Estimating…</p>
              <p className="mt-3 text-[0.9375rem] text-muted">Finding comparables and computing the range.</p>
            </>
          )}

          {status === 'error' && (
            <>
              <p className="label text-seal">Estimate failed</p>
              <p className="mt-3 text-[0.9375rem] text-ink">{errorMessage}</p>
            </>
          )}

          {status === 'ready' && result && (
            <div>
              <div className="flex items-baseline justify-between gap-3">
                <p className="label text-faint">Estimated value</p>
                <span
                  className={`rounded-full px-2.5 py-0.5 text-[0.6875rem] font-semibold uppercase tracking-[0.08em] ${CONFIDENCE_STYLE[result.confidence].className}`}
                >
                  {CONFIDENCE_STYLE[result.confidence].label}
                </span>
              </div>

              {result.confidence === 'insufficient' ? (
                <>
                  <p className="mt-3 display text-[1.5rem] text-ink">
                    Not enough data
                  </p>
                  <p className="mt-2 text-[0.875rem] leading-relaxed text-muted">
                    {result.disclaimer}
                  </p>
                </>
              ) : (
                <>
                  <p className="mt-3 tabular display text-[2rem] text-ink sm:text-[2.5rem]">
                    {formatCompactINR(result.estimatedMid)}
                  </p>
                  <p className="mt-1 text-[0.9375rem] tabular text-muted">
                    Range: {formatCompactINR(result.estimatedLow)} –{' '}
                    {formatCompactINR(result.estimatedHigh)}
                  </p>

                  <dl className="mt-6 space-y-2 border-t border-line pt-4 text-[0.875rem]">
                    <div className="flex items-baseline justify-between">
                      <dt className="text-muted">Per sqft (median)</dt>
                      <dd className="tabular font-medium text-ink">
                        {formatPerSqft(result.perSqft.mid)}
                      </dd>
                    </div>
                    <div className="flex items-baseline justify-between">
                      <dt className="text-muted">Comparables used</dt>
                      <dd className="tabular font-medium text-ink">
                        {result.comparableCount}
                      </dd>
                    </div>
                  </dl>

                  <p className="mt-4 text-[0.75rem] leading-relaxed text-faint">
                    {CONFIDENCE_STYLE[result.confidence].description}{' '}
                    {result.disclaimer}
                  </p>
                </>
              )}
            </div>
          )}
        </div>
      </form>

      {status === 'ready' && result && result.comparables.length > 0 && (
        <details className="mt-8 group">
          <summary className="inline-flex cursor-pointer items-center gap-2 rounded-control border border-line bg-surface px-3.5 py-2 text-[0.875rem] font-medium text-ink transition-colors hover:border-muted">
            <span>Show the {result.comparables.length} comparables used</span>
            <svg viewBox="0 0 12 12" aria-hidden="true" className="h-2.5 w-2.5 transition-transform group-open:rotate-180">
              <path d="M1.5 4 6 8.5 10.5 4" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </summary>

          <div className="mt-4 overflow-hidden rounded-card border border-line">
            <table className="w-full">
              <thead className="bg-canvas-deep">
                <tr>
                  <th scope="col" className="px-4 py-3 text-left text-[0.6875rem] font-semibold uppercase tracking-[0.08em] text-muted">
                    Config
                  </th>
                  <th scope="col" className="px-4 py-3 text-right text-[0.6875rem] font-semibold uppercase tracking-[0.08em] text-muted">
                    Area
                  </th>
                  <th scope="col" className="px-4 py-3 text-right text-[0.6875rem] font-semibold uppercase tracking-[0.08em] text-muted">
                    ₹/sqft
                  </th>
                  <th scope="col" className="px-4 py-3 text-right text-[0.6875rem] font-semibold uppercase tracking-[0.08em] text-muted">
                    Distance
                  </th>
                </tr>
              </thead>
              <tbody className="bg-surface">
                {result.comparables.map((c, i) => (
                  <tr key={i} className={i === 0 ? '' : 'border-t border-line-soft'}>
                    <td className="px-4 py-2.5 text-[0.875rem] text-ink">{c.bedrooms} BHK</td>
                    <td className="tabular px-4 py-2.5 text-right text-[0.875rem] text-ink">
                      {c.areaSqft.toLocaleString('en-IN')} sqft
                    </td>
                    <td className="tabular px-4 py-2.5 text-right text-[0.875rem] font-medium text-ink">
                      {formatPerSqft(c.pricePerSqft)}
                    </td>
                    <td className="tabular px-4 py-2.5 text-right text-[0.875rem] text-muted">
                      {c.distanceKm === null ? '—' : `${c.distanceKm.toFixed(1)} km`}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </details>
      )}
    </div>
  );
}

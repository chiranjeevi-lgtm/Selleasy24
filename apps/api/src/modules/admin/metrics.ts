/**
 * Statistical helpers for the operations dashboard.
 *
 * Kept apart from the service because these are the only parts worth reasoning
 * about on their own, and because a dashboard that quietly reports a median
 * drawn from two samples is worse than one that reports nothing.
 */

/** UTC day bucket, matching the rest of the codebase. */
export function dayKey(date: Date): string {
  return date.toISOString().slice(0, 10);
}

/**
 * The median, or null when there is nothing to take one of.
 *
 * Returning null rather than 0 matters: a dashboard showing "0 hours to
 * decision" because nothing has been decided yet is actively misleading, and
 * whoever reads it will believe the queue is instant.
 */
export function median(values: number[]): number | null {
  if (values.length === 0) {
    return null;
  }
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0
    ? (sorted[middle - 1]! + sorted[middle]!) / 2
    : sorted[middle]!;
}

/**
 * Nearest-rank percentile.
 *
 * The 90th is what says whether the slow tail is under control — a median
 * inside the SLA tells you nothing about the submissions that waited three
 * days, and those are the ones people complain about.
 */
export function percentile(values: number[], p: number): number | null {
  if (values.length === 0) {
    return null;
  }
  const sorted = [...values].sort((a, b) => a - b);
  const rank = Math.ceil((p / 100) * sorted.length);
  return sorted[Math.min(sorted.length - 1, Math.max(0, rank - 1))]!;
}

/** A percentage of a total, or null when the total is zero. */
export function rate(part: number, total: number): number | null {
  if (total === 0) {
    return null;
  }
  return Math.round((part / total) * 1000) / 10;
}

export const HOUR_MS = 3_600_000;

/**
 * Below this, a median or percentile is reported but flagged as thin.
 *
 * The number itself is still returned — suppressing it would leave the reader
 * guessing — but the client is told not to present it as a finding.
 */
export const MIN_CONFIDENT_SAMPLE = 8;

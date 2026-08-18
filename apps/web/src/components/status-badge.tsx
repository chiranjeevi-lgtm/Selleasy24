/**
 * Listing status, in the seller's language.
 *
 * The database says PENDING_REVIEW; a seller needs to know what that means for
 * them and what happens next. Each status carries one short line of direction —
 * a status that leaves someone guessing is a support ticket waiting to happen.
 */

interface StatusPresentation {
  label: string;
  /** What the seller should understand or do. */
  meaning: string;
  className: string;
}

const PRESENTATION: Record<string, StatusPresentation> = {
  DRAFT: {
    label: 'Draft',
    meaning: 'Only you can see this. Add photos and documents, then submit it.',
    className: 'border-line text-muted',
  },
  PENDING_REVIEW: {
    label: 'In review',
    meaning: 'An officer is checking your documents. Usually within 24 hours.',
    className: 'border-action/35 text-action',
  },
  APPROVED: {
    label: 'Live',
    meaning: 'Buyers can find this listing and see what we verified.',
    className: 'border-seal/35 text-seal',
  },
  REJECTED: {
    label: 'Needs changes',
    meaning: 'Read the reason below, fix it, and submit again.',
    className: 'border-seal/35 text-seal',
  },
  ARCHIVED: {
    label: 'Archived',
    meaning: 'No longer shown to buyers.',
    className: 'border-line text-faint',
  },
  SUSPENDED: {
    label: 'Suspended',
    meaning: 'Hidden while we investigate a report. We will contact you.',
    className: 'border-seal/35 text-seal',
  },
};

function presentation(status: string): StatusPresentation {
  return (
    PRESENTATION[status] ?? {
      label: status,
      meaning: '',
      className: 'border-line text-muted',
    }
  );
}

export function StatusBadge({ status }: { status: string }) {
  const { label, className } = presentation(status);
  return (
    <span className={`stamp-label border px-2 py-[3px] ${className}`}>{label}</span>
  );
}

export function StatusMeaning({ status }: { status: string }) {
  const { meaning } = presentation(status);
  if (!meaning) {
    return null;
  }
  return <p className="text-[0.8125rem] leading-relaxed text-muted">{meaning}</p>;
}

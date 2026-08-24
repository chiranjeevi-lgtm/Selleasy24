/**
 * Publication status, in the seller's or builder's own language.
 *
 * The database says PENDING_REVIEW; the person reading needs to know what that
 * means for them and what happens next. Each status carries one short line of
 * direction — a status that leaves someone guessing is a support ticket waiting
 * to happen.
 */

interface StatusPresentation {
  label: string;
  /** What the seller or builder should understand or do. */
  meaning: string;
  className: string;
}

/**
 * Colour carries meaning in this palette: gold marks verification, navy marks
 * anything actionable, and red is reserved for problems.
 *
 * "Live" used to be painted in the problem red, which made a published listing
 * indistinguishable at a glance from a rejected or suspended one — the three
 * states a seller most needs to tell apart.
 */
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
    className: 'border-verify/50 bg-verify-soft text-verify-ink',
  },
  REJECTED: {
    label: 'Needs changes',
    meaning: 'Read the reason below, fix it, and submit again.',
    className: 'border-seal/35 text-seal',
  },
  PAUSED: {
    label: 'Paused',
    meaning: 'Hidden from buyers. Put it back whenever you like — it does not go through review again.',
    className: 'border-line bg-canvas-deep text-ink',
  },
  SOLD: {
    label: 'Sold',
    meaning: 'Off the market. Thank you for telling us — it is what keeps this site worth using.',
    className: 'border-verify/50 bg-verify-soft text-verify-ink',
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

/**
 * Project wording. The states are the same; what the person has to do differs,
 * and telling a builder to "add photos and documents" without naming the RERA
 * certificate is the kind of vagueness that produces a rejected submission.
 */
const PROJECT_MEANINGS: Record<string, string> = {
  DRAFT: 'Only you can see this. Add configurations, photos and the statutory documents, then submit it.',
  PENDING_REVIEW: 'An officer is checking your RERA registration and sanctioned plan. Usually within 24 hours.',
  APPROVED: 'Buyers can find this project and see exactly what we checked.',
  REJECTED: 'Read the reason below, fix it, and submit again.',
  ARCHIVED: 'No longer shown to buyers.',
  SUSPENDED: 'Hidden while we investigate a report. We will contact you.',
  // PAUSED and SOLD are listing-only states — a project is not withdrawn or
  // sold as a single unit — so they deliberately have no project wording.
};

function presentation(status: string, kind: 'listing' | 'project'): StatusPresentation {
  const base = PRESENTATION[status] ?? {
    label: status,
    meaning: '',
    className: 'border-line text-muted',
  };

  if (kind === 'project' && PROJECT_MEANINGS[status]) {
    return { ...base, meaning: PROJECT_MEANINGS[status] };
  }

  return base;
}

export function StatusBadge({
  status,
  kind = 'listing',
}: {
  status: string;
  kind?: 'listing' | 'project';
}) {
  const { label, className } = presentation(status, kind);
  return <span className={`label rounded-full border px-2.5 py-[3px] ${className}`}>{label}</span>;
}

export function StatusMeaning({
  status,
  kind = 'listing',
}: {
  status: string;
  kind?: 'listing' | 'project';
}) {
  const { meaning } = presentation(status, kind);
  if (!meaning) {
    return null;
  }
  return <p className="text-[0.8125rem] leading-relaxed text-muted">{meaning}</p>;
}

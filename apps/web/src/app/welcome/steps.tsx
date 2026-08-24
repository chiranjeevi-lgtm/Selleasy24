import Link from 'next/link';

/**
 * The onboarding steps, named once.
 *
 * Order matters and is the order of these entries — each page reads its
 * position from here rather than hardcoding "step 3 of 5", which is how a
 * reordered flow ends up counting wrong.
 */
export const STEPS = [
  { slug: 'phone', href: '/welcome/phone', label: 'Verify number' },
  { slug: 'purpose', href: '/welcome/purpose', label: 'What you want' },
  { slug: 'budget', href: '/welcome/budget', label: 'Budget' },
  { slug: 'areas', href: '/welcome/areas', label: 'Areas' },
  { slug: 'about', href: '/welcome/about', label: 'About you' },
] as const;

export type StepSlug = (typeof STEPS)[number]['slug'];

export function nextHref(current: StepSlug): string {
  const index = STEPS.findIndex((step) => step.slug === current);
  // Past the last step the flow is over and the buyer goes to search.
  return STEPS[index + 1]?.href ?? '/';
}

/**
 * Progress.
 *
 * A buyer part-way through a form wants to know how much is left — an
 * unbounded sequence of questions is what makes people abandon. Showing the
 * count is the cheapest way to say "this is nearly done".
 */
export function StepProgress({ current }: { current: StepSlug }) {
  const index = STEPS.findIndex((step) => step.slug === current);

  return (
    <div>
      <p className="label text-faint">
        Step {index + 1} of {STEPS.length}
      </p>

      <ol className="mt-2.5 flex gap-1.5" aria-label="Progress">
        {STEPS.map((step, position) => {
          const done = position < index;
          const active = position === index;
          return (
            <li
              key={step.slug}
              className="h-1 flex-1 overflow-hidden rounded-full bg-line"
              aria-current={active ? 'step' : undefined}
            >
              <span
                className={`block h-full transition-all duration-500 ${
                  done || active ? 'w-full bg-action' : 'w-0'
                }`}
              />
              <span className="sr-only">
                {step.label}
                {done ? ' — done' : active ? ' — current' : ''}
              </span>
            </li>
          );
        })}
      </ol>
    </div>
  );
}

/**
 * Skip.
 *
 * On every step, deliberately. A buyer who cannot reach a property in under a
 * minute leaves, and a preference extracted by force is worth less than no
 * preference at all — we can ask again later, once they have seen why it helps.
 */
export function SkipLink({ current }: { current: StepSlug }) {
  const isLast = STEPS[STEPS.length - 1]?.slug === current;

  return (
    <Link
      href={isLast ? '/' : nextHref(current)}
      className="text-[0.875rem] text-muted underline-offset-4 transition-colors hover:text-ink hover:underline"
    >
      {isLast ? 'Finish without answering' : 'Skip this'}
    </Link>
  );
}

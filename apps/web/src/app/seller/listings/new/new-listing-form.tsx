'use client';

import { useActionState, useCallback, useEffect, useRef, useState } from 'react';
import { useFormStatus } from 'react-dom';
import { createListing, type ActionState } from '../../actions';
import {
  AMENITY_OPTIONS,
  APPROVING_AUTHORITY_OPTIONS,
  FACING_OPTIONS,
  FURNISHING_OPTIONS,
  OWNERSHIP_OPTIONS,
  POSSESSION_OPTIONS,
} from '@/lib/property-options';
import {
  ChipCheckboxGroup,
  ChipRadioGroup,
  FormError,
  SelectInput,
  TextInput,
  TextareaInput,
} from '@/components/form-fields';

interface Locality {
  id: string;
  name: string;
  pincode: string;
}

/**
 * Where an in-progress form is kept between visits.
 *
 * A listing is a long form and sellers abandon it — the PRD asks for draft and
 * resume. The server-side draft only exists once the listing is created, so
 * everything before that first save lives here. Cleared on success.
 */
const DRAFT_KEY = 'selleasy24:new-listing-draft';

const STEPS = [
  { id: 'basics', title: 'Basic details', blurb: 'What you are selling' },
  { id: 'location', title: 'Location', blurb: 'Where it is' },
  { id: 'layout', title: 'Size and layout', blurb: 'Rooms, area, floor' },
  { id: 'profile', title: 'Property profile', blurb: 'Condition and paperwork' },
  { id: 'price', title: 'Price and contact', blurb: 'What you want for it' },
] as const;

type StepId = (typeof STEPS)[number]['id'];

/**
 * Which step each field lives on.
 *
 * The server validates the whole listing at once, so a rule broken on step 3 —
 * carpet area larger than built-up, say — surfaces only when the form is
 * submitted from step 5. Without this map the seller is shown "Validation
 * failed" on a step whose fields are all fine, with no way to find the real
 * problem.
 */
const FIELD_STEP: Record<string, number> = {
  title: 0,
  propertyType: 0,
  description: 0,

  address: 1,
  neighborhoodId: 1,
  pincode: 1,

  bedrooms: 2,
  bathrooms: 2,
  balconies: 2,
  areaSqft: 2,
  carpetAreaSqft: 2,
  floor: 2,
  totalFloors: 2,

  possession: 3,
  furnishing: 3,
  facing: 3,
  coveredParking: 3,
  openParking: 3,
  yearBuilt: 3,
  ownership: 3,
  approvingAuthority: 3,
  amenities: 3,

  price: 4,
  priceNegotiable: 4,
  contactPreference: 4,
};

function Submit() {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="rounded-control bg-action px-5 py-2.5 text-[0.875rem] font-semibold text-white transition-colors hover:bg-action-hover disabled:cursor-not-allowed disabled:opacity-55"
    >
      {pending ? 'Saving…' : 'Save and add photos'}
    </button>
  );
}

/**
 * The step rail.
 *
 * Mirrors what sellers already see on 99acres and Housing: every step listed,
 * each carrying its own state, so it is obvious how much is left and what has
 * been skipped. Steps behind the current one are clickable — going back to fix
 * something should never mean starting again.
 */
function StepRail({
  current,
  furthest,
  onJump,
  completeness,
}: {
  current: number;
  furthest: number;
  onJump: (index: number) => void;
  completeness: number;
}) {
  return (
    <nav aria-label="Listing steps" className="lg:sticky lg:top-24">
      <ol className="space-y-1">
        {STEPS.map((step, index) => {
          const state =
            index < furthest ? 'done' : index === current ? 'current' : 'todo';
          const reachable = index <= furthest;

          return (
            <li key={step.id}>
              <button
                type="button"
                onClick={() => reachable && onJump(index)}
                disabled={!reachable}
                aria-current={index === current ? 'step' : undefined}
                className={`flex w-full items-start gap-3 rounded-control px-3 py-2.5 text-left transition-colors ${
                  index === current ? 'bg-canvas-deep' : 'hover:bg-canvas-deep'
                } disabled:cursor-default disabled:hover:bg-transparent`}
              >
                <span
                  aria-hidden="true"
                  className={`mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full border text-[0.6875rem] font-semibold ${
                    state === 'done'
                      ? 'border-action bg-action text-white'
                      : state === 'current'
                        ? 'border-action text-action'
                        : 'border-line text-faint'
                  }`}
                >
                  {state === 'done' ? '✓' : index + 1}
                </span>
                <span className="min-w-0">
                  <span
                    className={`block text-[0.875rem] font-medium ${
                      state === 'todo' ? 'text-faint' : 'text-ink'
                    }`}
                  >
                    {step.title}
                  </span>
                  <span className="block text-[0.75rem] text-faint">{step.blurb}</span>
                </span>
              </button>
            </li>
          );
        })}
      </ol>

      {/*
        Completeness, not progress. It counts the optional detail buyers filter
        on, so it keeps climbing after the required fields are done — which is
        the entire point, since those optional fields are what the PRD's top
        pain point is about.
      */}
      <div className="mt-5 rounded-card border border-line px-4 py-3.5">
        <div className="flex items-baseline justify-between gap-2">
          <p className="text-[0.8125rem] font-medium text-ink">Listing strength</p>
          <p className="text-[0.9375rem] font-semibold tabular text-ink">{completeness}%</p>
        </div>
        <div
          className="mt-2 h-1.5 overflow-hidden rounded-full bg-canvas-deep"
          role="progressbar"
          aria-valuenow={completeness}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-label="Listing strength"
        >
          <div
            className="h-full rounded-full bg-action transition-[width] duration-500"
            style={{ width: `${completeness}%` }}
          />
        </div>
        <p className="mt-2 text-[0.75rem] leading-snug text-muted">
          Listings that answer more of these get more enquiries, because buyers
          filter on them.
        </p>
      </div>
    </nav>
  );
}

export function NewListingForm({
  localities,
  initialStep = 0,
}: {
  localities: Locality[];
  /** Entry point for previews and deep links; drafts restore their own step. */
  initialStep?: number;
}) {
  const [state, action] = useActionState<ActionState, FormData>(createListing, {});
  const errors = state.fieldErrors ?? {};

  /**
   * The first server-side error, and the step it belongs to.
   *
   * Sorted by step so a seller is taken to the earliest problem rather than an
   * arbitrary one — working forwards is how they filled the form in the first
   * place.
   */
  const serverErrorEntries = Object.entries(errors)
    .map(([field, message]) => ({ field, message, step: FIELD_STEP[field] ?? 0 }))
    .sort((a, b) => a.step - b.step);
  const firstServerError = serverErrorEntries[0];

  const formRef = useRef<HTMLFormElement>(null);
  const [step, setStep] = useState(initialStep);
  // Highest step reached, so the rail lets you jump back without re-walking.
  const [furthest, setFurthest] = useState(initialStep);
  const [completeness, setCompleteness] = useState(0);
  const [stepError, setStepError] = useState<string | undefined>();

  /**
   * Optional fields worth points, matching the server's weighting closely
   * enough that the number does not visibly jump after saving.
   */
  const recomputeCompleteness = useCallback(() => {
    const form = formRef.current;
    if (!form) return;

    const data = new FormData(form);
    const filled = (key: string) => {
      const value = data.get(key);
      return typeof value === 'string' && value.trim() !== '';
    };

    const weights: Array<[boolean, number]> = [
      [filled('ownership'), 14],
      [filled('approvingAuthority'), 14],
      [data.getAll('amenities').length >= 3, 12],
      [filled('carpetAreaSqft'), 12],
      [filled('coveredParking') || filled('openParking'), 10],
      [filled('furnishing'), 10],
      [filled('floor') && filled('totalFloors'), 10],
      [filled('yearBuilt'), 8],
      [filled('facing'), 6],
      [filled('balconies'), 4],
    ];

    setCompleteness(weights.reduce((sum, [ok, weight]) => sum + (ok ? weight : 0), 0));
  }, []);

  // Restore an abandoned draft, then keep it current as the seller types.
  useEffect(() => {
    const form = formRef.current;
    if (!form) return;

    try {
      const saved = localStorage.getItem(DRAFT_KEY);
      if (saved) {
        const values = JSON.parse(saved) as Record<string, string | string[]>;
        for (const [key, value] of Object.entries(values)) {
          const fields = form.elements.namedItem(key);
          if (!fields) continue;

          if (Array.isArray(value)) {
            for (const node of form.querySelectorAll<HTMLInputElement>(
              `input[name="${key}"]`,
            )) {
              node.checked = value.includes(node.value);
            }
          } else if (fields instanceof RadioNodeList) {
            fields.value = value;
          } else if (
            fields instanceof HTMLInputElement ||
            fields instanceof HTMLSelectElement ||
            fields instanceof HTMLTextAreaElement
          ) {
            if (fields instanceof HTMLInputElement && fields.type === 'checkbox') {
              fields.checked = value === 'on';
            } else {
              fields.value = value;
            }
          }
        }
      }
    } catch {
      // A corrupt or unreadable draft must never block the form. Start clean.
      localStorage.removeItem(DRAFT_KEY);
    }

    recomputeCompleteness();
  }, [recomputeCompleteness]);

  const persistDraft = useCallback(() => {
    const form = formRef.current;
    if (!form) return;

    const data = new FormData(form);
    const values: Record<string, string | string[]> = {};
    for (const key of new Set(data.keys())) {
      const all = data.getAll(key).map(String);
      values[key] = key === 'amenities' ? all : (all[0] ?? '');
    }

    try {
      localStorage.setItem(DRAFT_KEY, JSON.stringify(values));
    } catch {
      // Storage full or blocked (private mode). The form still works; only
      // resume-after-leaving is lost, which is not worth interrupting for.
    }
  }, []);

  const handleChange = useCallback(() => {
    persistDraft();
    recomputeCompleteness();
  }, [persistDraft, recomputeCompleteness]);

  /**
   * Validates only the fields inside one step.
   *
   * The whole form stays mounted so nothing is lost when moving between steps
   * and the final FormData carries every answer. That means native validation
   * would fire on fields the seller cannot see, so the form is `noValidate` and
   * each step is checked explicitly here instead.
   */
  const validateStep = useCallback((index: number): boolean => {
    const section = formRef.current?.querySelector<HTMLElement>(
      `[data-step="${STEPS[index]!.id}"]`,
    );
    if (!section) return true;

    const controls = section.querySelectorAll<
      HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement
    >('input, select, textarea');

    for (const control of controls) {
      if (!control.checkValidity()) {
        setStepError(control.validationMessage);
        control.focus();
        control.reportValidity();
        return false;
      }
    }

    setStepError(undefined);
    return true;
  }, []);

  const goTo = useCallback((index: number) => {
    setStep(index);
    setStepError(undefined);
    // Long steps otherwise leave you mid-page on the next one.
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }, []);

  const next = useCallback(() => {
    if (!validateStep(step)) return;
    const target = Math.min(step + 1, STEPS.length - 1);
    setFurthest((f) => Math.max(f, target));
    goTo(target);
  }, [goTo, step, validateStep]);

  /**
   * Guards the real submit.
   *
   * Every step is re-checked, and an invalid one pulls the seller back to it —
   * without this, a field left blank three steps ago fails server-side with no
   * indication of where the problem is.
   */
  const handleSubmit = useCallback(
    (event: React.FormEvent<HTMLFormElement>) => {
      for (let index = 0; index < STEPS.length; index += 1) {
        if (!validateStep(index)) {
          event.preventDefault();
          goTo(index);
          return;
        }
      }
      // Past validation, so the listing is about to be created server-side and
      // the local copy is no longer the source of truth.
      localStorage.removeItem(DRAFT_KEY);
    },
    [goTo, validateStep],
  );

  /*
   * Jump to the step holding the first server-side error.
   *
   * Keyed on the field name so it fires once per distinct rejection rather than
   * on every render — otherwise a seller correcting the field would be yanked
   * back to it while still typing.
   */
  const jumpedFor = useRef<string | undefined>(undefined);
  useEffect(() => {
    if (!firstServerError) {
      jumpedFor.current = undefined;
      return;
    }
    if (jumpedFor.current === firstServerError.field) {
      return;
    }
    jumpedFor.current = firstServerError.field;
    setFurthest((f) => Math.max(f, firstServerError.step));
    goTo(firstServerError.step);
  }, [firstServerError, goTo]);

  const isLast = step === STEPS.length - 1;
  const currentStep: StepId = STEPS[step]!.id;

  return (
    <div className="grid gap-8 lg:grid-cols-[15rem_1fr] lg:gap-12">
      <StepRail current={step} furthest={furthest} onJump={goTo} completeness={completeness} />

      <form
        ref={formRef}
        action={action}
        onSubmit={handleSubmit}
        onChange={handleChange}
        noValidate
        className="min-w-0"
      >
        {/*
          Prefer the specific field message over the API's generic wrapper.
          "Validation failed" tells a seller nothing they can act on; "Carpet
          area must be smaller than built-up area" tells them exactly what to
          change, and the effect above has already taken them to that step.
        */}
        <FormError
          message={firstServerError?.message ?? state.error ?? stepError}
        />

        {/* Every step stays in the DOM so no answer is lost when navigating,
            and the submitted FormData is always complete. */}
        <section data-step="basics" hidden={currentStep !== 'basics'} className="space-y-5">
          <StepHeading index={0} />

          <TextInput
            name="title"
            label="Listing title"
            required
            minLength={10}
            maxLength={255}
            placeholder="3 BHK flat in Gachibowli with covered parking"
            hint="What a buyer sees first. Be specific — configuration, locality, one standout feature."
            error={errors.title}
          />

          <SelectInput
            name="propertyType"
            label="Property type"
            required
            defaultValue="FLAT"
            error={errors.propertyType}
          >
            <option value="FLAT">Flat</option>
            <option value="APARTMENT">Apartment</option>
            <option value="HOUSE">Independent house</option>
            <option value="BUILDING">Building</option>
          </SelectInput>

          <TextareaInput
            name="description"
            label="Description"
            required
            rows={6}
            minLength={50}
            maxLength={5000}
            placeholder="Floor, facing direction, parking, lift, water supply, what is nearby…"
            hint="At least 50 characters. Thin descriptions are the hallmark of the listings buyers have learned to distrust."
            error={errors.description}
          />
        </section>

        <section data-step="location" hidden={currentStep !== 'location'} className="space-y-5">
          <StepHeading index={1} />

          <TextInput
            name="address"
            label="Address"
            required
            minLength={10}
            maxLength={500}
            placeholder="Plot 42, Vittal Rao Nagar"
            error={errors.address}
          />

          <div className="grid gap-5 sm:grid-cols-2">
            <SelectInput
              name="neighborhoodId"
              label="Locality"
              required
              defaultValue=""
              error={errors.neighborhoodId}
            >
              <option value="" disabled>
                Choose a locality
              </option>
              {localities.map((locality) => (
                <option key={locality.id} value={locality.id}>
                  {locality.name}
                </option>
              ))}
            </SelectInput>

            <TextInput
              name="pincode"
              label="Pincode"
              required
              inputMode="numeric"
              pattern="[1-9][0-9]{5}"
              placeholder="500032"
              error={errors.pincode}
            />
          </div>
        </section>

        <section data-step="layout" hidden={currentStep !== 'layout'} className="space-y-5">
          <StepHeading index={2} />

          <div className="grid gap-5 sm:grid-cols-3">
            <TextInput
              name="bedrooms"
              label="Bedrooms"
              type="number"
              required
              min={0}
              max={20}
              error={errors.bedrooms}
            />
            <TextInput
              name="bathrooms"
              label="Bathrooms"
              type="number"
              required
              min={0}
              max={20}
              error={errors.bathrooms}
            />
            <TextInput
              name="balconies"
              label="Balconies"
              type="number"
              min={0}
              max={10}
              error={errors.balconies}
            />
          </div>

          <div className="grid gap-5 sm:grid-cols-2">
            <TextInput
              name="areaSqft"
              label="Built-up area (sq ft)"
              type="number"
              required
              min={50}
              max={100000}
              error={errors.areaSqft}
            />
            <TextInput
              name="carpetAreaSqft"
              label="Carpet area (sq ft)"
              type="number"
              min={30}
              max={100000}
              hint="Usable area inside the walls. Buyers trust a listing that gives both."
              error={errors.carpetAreaSqft}
            />
          </div>

          <div className="grid gap-5 sm:grid-cols-2">
            <TextInput
              name="floor"
              label="Floor"
              type="number"
              min={-5}
              max={200}
              hint="Ground floor is 0."
              error={errors.floor}
            />
            <TextInput
              name="totalFloors"
              label="Total floors in the building"
              type="number"
              min={1}
              max={200}
              error={errors.totalFloors}
            />
          </div>
        </section>

        <section data-step="profile" hidden={currentStep !== 'profile'} className="space-y-6">
          <StepHeading index={3} />

          <ChipRadioGroup
            name="possession"
            legend="Availability"
            required
            options={POSSESSION_OPTIONS}
            defaultValue="READY_TO_MOVE"
            error={errors.possession}
          />

          <ChipRadioGroup
            name="furnishing"
            legend="Furnishing"
            options={FURNISHING_OPTIONS}
            error={errors.furnishing}
          />

          <div className="grid gap-5 sm:grid-cols-3">
            <SelectInput name="facing" label="Facing" defaultValue="" error={errors.facing}>
              <option value="">Not sure</option>
              {FACING_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </SelectInput>
            <TextInput
              name="coveredParking"
              label="Covered parking"
              type="number"
              min={0}
              max={20}
              error={errors.coveredParking}
            />
            <TextInput
              name="openParking"
              label="Open parking"
              type="number"
              min={0}
              max={20}
              error={errors.openParking}
            />
          </div>

          <div className="grid gap-5 sm:grid-cols-2">
            <TextInput
              name="yearBuilt"
              label="Year built"
              type="number"
              min={1900}
              max={new Date().getUTCFullYear() + 5}
              error={errors.yearBuilt}
            />
            <SelectInput
              name="ownership"
              label="Ownership"
              defaultValue=""
              hint="Checked against your sale deed during verification."
              error={errors.ownership}
            >
              <option value="">Not sure</option>
              {OWNERSHIP_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </SelectInput>
          </div>

          <ChipRadioGroup
            name="approvingAuthority"
            legend="Approved by"
            options={APPROVING_AUTHORITY_OPTIONS}
            hint="The authority that sanctioned the building plan. Buyers look for this first."
            error={errors.approvingAuthority}
          />

          <ChipCheckboxGroup
            name="amenities"
            legend="Amenities"
            options={AMENITY_OPTIONS}
            hint="Buyers filter on these. Listing at least three makes a real difference."
          />
        </section>

        <section data-step="price" hidden={currentStep !== 'price'} className="space-y-5">
          <StepHeading index={4} />

          <TextInput
            name="price"
            label="Asking price (₹)"
            type="number"
            required
            min={100000}
            step={1000}
            placeholder="9500000"
            hint="Whole rupees. Buyers see this against the locality median, so an inflated figure works against you."
            error={errors.price}
          />

          <label className="flex cursor-pointer items-center gap-2 text-[0.8125rem] text-muted">
            <input type="checkbox" name="priceNegotiable" className="h-3.5 w-3.5 accent-action" />
            Price is negotiable
          </label>

          <ChipRadioGroup
            name="contactPreference"
            legend="How should buyers reach you?"
            options={[
              { value: 'ANY', label: 'Any' },
              { value: 'PHONE', label: 'Phone' },
              { value: 'WHATSAPP', label: 'WhatsApp' },
              { value: 'EMAIL', label: 'Email' },
            ]}
            defaultValue="ANY"
            error={errors.contactPreference}
          />

          <p className="rounded-card border border-line bg-canvas-deep px-4 py-3 text-[0.8125rem] leading-relaxed text-muted">
            Saving creates a draft. Photographs and ownership documents come
            next, and nothing is published until an officer has checked them.
          </p>
        </section>

        <div className="mt-8 flex items-center justify-between gap-4 border-t border-line pt-6">
          <button
            type="button"
            onClick={() => goTo(Math.max(step - 1, 0))}
            disabled={step === 0}
            className="rounded-control border border-line px-4 py-2.5 text-[0.875rem] font-medium text-ink transition-colors hover:bg-canvas-deep disabled:cursor-not-allowed disabled:opacity-45"
          >
            Back
          </button>

          <p aria-live="polite" className="text-[0.8125rem] text-faint">
            Step {step + 1} of {STEPS.length}
          </p>

          {isLast ? (
            <Submit />
          ) : (
            <button
              type="button"
              onClick={next}
              className="rounded-control bg-action px-5 py-2.5 text-[0.875rem] font-semibold text-white transition-colors hover:bg-action-hover"
            >
              Continue
            </button>
          )}
        </div>
      </form>
    </div>
  );
}

function StepHeading({ index }: { index: number }) {
  const step = STEPS[index]!;
  return (
    <div className="mb-1">
      <h2 className="display text-[1.25rem] text-ink">{step.title}</h2>
      <p className="mt-0.5 text-[0.875rem] text-muted">{step.blurb}</p>
    </div>
  );
}

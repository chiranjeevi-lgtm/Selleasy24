'use client';

import { useActionState, useState } from 'react';
import { useFormStatus } from 'react-dom';
import {
  ChipCheckboxGroup,
  ChipRadioGroup,
  FormError,
  SelectInput,
  SubmitButton,
  TextInput,
  TextareaInput,
} from '@/components/form-fields';
import { createProject, type ProjectActionState } from '../actions';

const STAGES = [
  { value: 'PRE_LAUNCH', label: 'Pre-launch' },
  { value: 'UNDER_CONSTRUCTION', label: 'Under construction' },
  { value: 'NEARING_POSSESSION', label: 'Nearing possession' },
  { value: 'READY_TO_MOVE', label: 'Ready to move' },
  { value: 'DELIVERED', label: 'Delivered' },
] as const;

const AUTHORITIES = [
  { value: 'GHMC', label: 'GHMC' },
  { value: 'HMDA', label: 'HMDA' },
  { value: 'DTCP', label: 'DTCP' },
  { value: 'OTHER', label: 'Other' },
] as const;

const AMENITIES = [
  { value: 'LIFT', label: 'Lift' },
  { value: 'POWER_BACKUP', label: 'Power backup' },
  { value: 'SECURITY', label: '24×7 security' },
  { value: 'CCTV', label: 'CCTV' },
  { value: 'GATED_COMMUNITY', label: 'Gated community' },
  { value: 'GYM', label: 'Gym' },
  { value: 'SWIMMING_POOL', label: 'Swimming pool' },
  { value: 'CLUBHOUSE', label: 'Clubhouse' },
  { value: 'CHILDRENS_PLAY_AREA', label: 'Children’s play area' },
  { value: 'PARK', label: 'Park' },
  { value: 'WATER_SUPPLY_24_7', label: '24×7 water' },
  { value: 'RAINWATER_HARVESTING', label: 'Rainwater harvesting' },
  { value: 'SOLAR_WATER_HEATER', label: 'Solar water heater' },
  { value: 'INTERCOM', label: 'Intercom' },
  { value: 'FIRE_SAFETY', label: 'Fire safety' },
  { value: 'VISITOR_PARKING', label: 'Visitor parking' },
  { value: 'MAINTENANCE_STAFF', label: 'Maintenance staff' },
  { value: 'VAASTU_COMPLIANT', label: 'Vaastu compliant' },
] as const;

const COMPLETED_STAGES = ['READY_TO_MOVE', 'DELIVERED'];

export function NewProjectForm({
  localities,
}: {
  localities: Array<{ id: string; name: string }>;
}) {
  const [state, action] = useActionState<ProjectActionState, FormData>(createProject, {});

  /*
   * Stage drives which date the form asks for. A delivered project needs the
   * date it was handed over; anything unfinished needs the date it is expected.
   * Asking for both at once produces one that contradicts the other, and the
   * API rejects that combination anyway.
   */
  const [stage, setStage] = useState<string>('UNDER_CONSTRUCTION');
  const isDelivered = stage === 'DELIVERED';
  const needsPossession = !COMPLETED_STAGES.includes(stage);

  const today = new Date().toISOString().slice(0, 10);

  return (
    <form action={action} className="space-y-7">
      <FormError message={state.error} />

      {/* --- The project --- */}
      <fieldset className="space-y-4">
        <legend className="label text-faint">The project</legend>

        <TextInput
          name="name"
          label="Project name"
          required
          minLength={3}
          maxLength={200}
          placeholder="Aurum Heights"
          {...(state.fields?.name && { error: state.fields.name })}
        />

        <TextareaInput
          name="description"
          label="Description"
          rows={5}
          required
          minLength={50}
          maxLength={5000}
          hint="At least 50 characters. Say what stage construction is at — a buyer reading this is trying to work out what they are actually buying."
          placeholder="Three towers of G+14 on four and a half acres off the Outer Ring Road…"
          {...(state.fields?.description && { error: state.fields.description })}
        />
      </fieldset>

      {/* --- Where --- */}
      <fieldset className="space-y-4">
        <legend className="label text-faint">Where it is</legend>

        <TextInput
          name="address"
          label="Address"
          required
          minLength={10}
          maxLength={500}
          placeholder="Survey 118, Kokapet, Rangareddy District"
          {...(state.fields?.address && { error: state.fields.address })}
        />

        <div className="grid gap-4 sm:grid-cols-2">
          <SelectInput
            name="neighborhoodId"
            label="Locality"
            required
            defaultValue=""
            hint="Chosen from the list, never typed — it is what buyers filter on."
            {...(state.fields?.neighborhoodId && { error: state.fields.neighborhoodId })}
          >
            <option value="" disabled>
              Select a locality
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
            maxLength={6}
            placeholder="500075"
            {...(state.fields?.pincode && { error: state.fields.pincode })}
          />
        </div>
      </fieldset>

      {/* --- Stage --- */}
      <fieldset className="space-y-4">
        <legend className="label text-faint">Where it has got to</legend>

        {/*
          Not a ChipRadioGroup: the date field below depends on this, so it needs
          an onChange the shared component does not expose.
        */}
        <div role="radiogroup" aria-label="Stage">
          <span className="block text-[0.8125rem] font-medium text-ink">Stage</span>
          <div className="mt-1.5 flex flex-wrap gap-2">
            {STAGES.map((option) => (
              <label
                key={option.value}
                className={`cursor-pointer rounded-full border px-3.5 py-1.5 text-[0.8125rem] font-medium transition-colors ${
                  stage === option.value
                    ? 'border-action bg-action text-white'
                    : 'border-line text-ink hover:border-action/40 hover:bg-canvas-deep'
                }`}
              >
                <input
                  type="radio"
                  name="stage"
                  value={option.value}
                  checked={stage === option.value}
                  onChange={() => setStage(option.value)}
                  className="sr-only"
                />
                {option.label}
              </label>
            ))}
          </div>
        </div>

        {needsPossession && (
          <TextInput
            name="possessionDate"
            label="Expected possession"
            type="date"
            required
            min={today}
            hint="Buyers see this as a month, not a day — nobody hands over a tower on a promised date."
            {...(state.fields?.possessionDate && { error: state.fields.possessionDate })}
          />
        )}

        {isDelivered && (
          <TextInput
            name="deliveredOn"
            label="Handed over on"
            type="date"
            required
            max={today}
            hint="The date the project was actually handed over. Kept separate from the promised date on purpose — the gap between the two is the record buyers judge you on."
            {...(state.fields?.deliveredOn && { error: state.fields.deliveredOn })}
          />
        )}
      </fieldset>

      {/* --- Statutory --- */}
      <fieldset className="space-y-4">
        <legend className="label text-faint">Registration</legend>

        <TextInput
          name="reraNumber"
          label="TS-RERA project registration number"
          required
          minLength={8}
          maxLength={40}
          placeholder="P02400004567"
          hint="The project registration, not your promoter registration. This is printed on the public page so buyers can look it up themselves."
          {...(state.fields?.reraNumber && { error: state.fields.reraNumber })}
        />

        <ChipRadioGroup
          name="approvingAuthority"
          legend="Approving authority"
          options={AUTHORITIES}
          hint="Who sanctioned the building plan."
        />
      </fieldset>

      {/* --- Scale --- */}
      <fieldset className="space-y-4">
        <legend className="label text-faint">Scale</legend>

        <div className="grid gap-4 sm:grid-cols-3">
          <TextInput name="totalTowers" label="Towers" type="number" min={1} max={200} />
          <TextInput name="totalUnits" label="Total units" type="number" min={1} max={50000} />
          <TextInput
            name="landAreaAcres"
            label="Land area (acres)"
            type="number"
            step="0.01"
            min={0.01}
          />
        </div>
      </fieldset>

      <ChipCheckboxGroup
        name="amenities"
        legend="Amenities"
        options={AMENITIES}
        hint="What the completed project will have. Everything here is checked against the sanctioned plan."
      />

      <div className="flex flex-wrap items-center gap-3 border-t border-line pt-5">
        <Submit />
        <p className="text-[0.75rem] leading-relaxed text-faint">
          Saved as a draft. Configurations, photographs and documents come next.
        </p>
      </div>
    </form>
  );
}

function Submit() {
  const { pending } = useFormStatus();
  return <SubmitButton pending={pending}>{pending ? 'Saving…' : 'Save and continue'}</SubmitButton>;
}

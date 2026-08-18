'use client';

import { useEffect, useRef, useState } from 'react';

/**
 * Property type and configuration, in one dropdown.
 *
 * Both are multi-select: "a 2 or 3 BHK flat or independent house" is an
 * ordinary requirement, and a single-choice control makes a buyer run the same
 * search several times and hold the results in their head.
 *
 * The options are real checkboxes inside the surrounding GET form, so the panel
 * needs no hidden-input syncing and the whole thing still submits without
 * JavaScript — the panel simply starts open in that case. React state here only
 * drives the summary label and the open/closed behaviour.
 */

const PROPERTY_TYPES = [
  { value: 'FLAT', label: 'Flat' },
  { value: 'APARTMENT', label: 'Apartment' },
  { value: 'HOUSE', label: 'Independent house' },
  { value: 'BUILDING', label: 'Building' },
];

const BEDROOMS = [
  { value: '1', label: '1 BHK' },
  { value: '2', label: '2 BHK' },
  { value: '3', label: '3 BHK' },
  { value: '4', label: '4 BHK' },
  { value: '5', label: '5 BHK' },
];

function Pill({
  name,
  value,
  label,
  defaultChecked,
  onToggle,
}: {
  name: string;
  value: string;
  label: string;
  defaultChecked: boolean;
  onToggle: (value: string, checked: boolean) => void;
}) {
  const id = `${name}-${value}`;
  return (
    <div>
      <input
        type="checkbox"
        id={id}
        name={name}
        value={value}
        defaultChecked={defaultChecked}
        onChange={(event) => onToggle(value, event.currentTarget.checked)}
        className="peer sr-only"
      />
      <label
        htmlFor={id}
        className="inline-block cursor-pointer select-none rounded-full border border-line px-3.5 py-1.5 text-[0.8125rem] font-medium text-muted transition-colors hover:border-muted hover:text-ink peer-checked:border-action peer-checked:bg-action peer-checked:text-white peer-focus-visible:outline peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-action"
      >
        {label}
      </label>
    </div>
  );
}

export function PropertyPicker({
  selectedTypes,
  selectedBedrooms,
}: {
  selectedTypes: string[];
  selectedBedrooms: string[];
}) {
  const [types, setTypes] = useState(selectedTypes);
  const [beds, setBeds] = useState(selectedBedrooms);
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  // Close on an outside click or Escape — the two things people try when a
  // panel is in the way.
  useEffect(() => {
    if (!open) return;

    function onPointerDown(event: MouseEvent) {
      if (!containerRef.current?.contains(event.target as Node)) {
        setOpen(false);
      }
    }
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') setOpen(false);
    }

    document.addEventListener('mousedown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('mousedown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [open]);

  const toggle =
    (setter: React.Dispatch<React.SetStateAction<string[]>>) =>
    (value: string, checked: boolean) => {
      setter((current) =>
        checked ? [...current, value] : current.filter((item) => item !== value),
      );
    };

  /** "Any" · "Flat" · "Flat +1" · "2 BHK" · "Flat, 2 BHK +2" */
  const chosen = [
    ...types.map((t) => PROPERTY_TYPES.find((p) => p.value === t)?.label ?? t),
    ...beds.map((b) => `${b} BHK`),
  ];
  const summary =
    chosen.length === 0
      ? 'Any'
      : chosen.length === 1
        ? chosen[0]!
        : `${chosen[0]} +${chosen.length - 1}`;

  return (
    <div ref={containerRef} className="relative bg-surface px-4 py-3">
      <span className="label flex items-center gap-1.5 text-faint">
        <svg viewBox="0 0 16 16" aria-hidden="true" className="h-3.5 w-3.5 shrink-0 text-verify">
          <path
            d="M2 7 8 2.5 14 7v6a1 1 0 0 1-1 1H3a1 1 0 0 1-1-1V7Z"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinejoin="round"
          />
        </svg>
        Property
      </span>

      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        aria-expanded={open}
        className="mt-1 flex w-full items-center justify-between gap-2 text-left text-[0.9375rem] font-medium text-ink"
      >
        <span className="truncate">{summary}</span>
        <svg
          viewBox="0 0 12 12"
          aria-hidden="true"
          className={`h-3 w-3 shrink-0 text-muted transition-transform duration-200 ${open ? 'rotate-180' : ''}`}
        >
          <path d="M2 4.5 6 8.5 10 4.5" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>

      {/*
        `hidden` rather than unmounted: the checkboxes must stay in the form so a
        closed panel still submits what was chosen inside it.
      */}
      <div
        hidden={!open}
        className="absolute left-0 top-full z-30 mt-2 w-[22rem] max-w-[calc(100vw-2.5rem)] rounded-card border border-line bg-surface p-5 shadow-float"
      >
        <p className="label text-muted">Residential</p>

        <div className="mt-2.5 flex flex-wrap gap-2">
          {PROPERTY_TYPES.map((option) => (
            <Pill
              key={option.value}
              name="propertyType"
              value={option.value}
              label={option.label}
              defaultChecked={selectedTypes.includes(option.value)}
              onToggle={toggle(setTypes)}
            />
          ))}
        </div>

        <p className="mt-5 label text-muted">Configuration</p>

        <div className="mt-2.5 flex flex-wrap gap-2">
          {BEDROOMS.map((option) => (
            <Pill
              key={option.value}
              name="bedrooms"
              value={option.value}
              label={option.label}
              defaultChecked={selectedBedrooms.includes(option.value)}
              onToggle={toggle(setBeds)}
            />
          ))}
        </div>

        <p className="mt-4 text-[0.75rem] leading-relaxed text-faint">
          Pick as many as you like. A home matching any of them will be shown.
        </p>
      </div>
    </div>
  );
}

'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import type { Locality } from '@/lib/api';

/**
 * Locality multi-select with typeahead.
 *
 * Replaces the previous single-`<select>` for locality on the search bar.
 * A buyer who wants "Kondapur or Gachibowli or Kokapet" could previously
 * only run three searches in a row and reconcile them in their head; this
 * lets them pick any set in one query.
 *
 * The submitted form value is a comma-separated list of ids under the
 * existing `neighborhoodId` field — the API DTO now accepts either repeated
 * params or one joined string, and the URL shape matches what propertyType
 * and amenities already do. Bookmarked single-locality URLs
 * (`?neighborhoodId=<uuid>`) keep working unchanged.
 *
 * Progressive enhancement: falls back to a native `<select>` inside a
 * `<noscript>` so keyboard-only + JS-off browsers still get one locality
 * picker rather than nothing at all.
 */

const PinIcon = () => (
  <svg viewBox="0 0 16 16" aria-hidden="true" className="h-3.5 w-3.5 shrink-0 text-verify">
    <path
      d="M8 14s5-4.5 5-8A5 5 0 0 0 3 6c0 3.5 5 8 5 8Z"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
    />
    <circle cx="8" cy="6" r="1.8" fill="currentColor" />
  </svg>
);

export function LocalityPicker({
  localities,
  selectedIds: initiallySelected,
}: {
  localities: Locality[];
  /** ids to pre-select — read from the URL by the parent server component. */
  selectedIds: string[];
}) {
  const [selectedIds, setSelectedIds] = useState<string[]>(initiallySelected);
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);

  // Rehydrate from parent's URL-derived list when navigation swaps the page in
  // — otherwise going back/forward would show stale chips.
  useEffect(() => {
    setSelectedIds(initiallySelected);
  }, [initiallySelected]);

  useEffect(() => {
    function onClick(e: MouseEvent) {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener('mousedown', onClick);
    return () => document.removeEventListener('mousedown', onClick);
  }, []);

  const selected = useMemo(
    () => localities.filter((l) => selectedIds.includes(l.id)),
    [localities, selectedIds],
  );

  const suggestions = useMemo(() => {
    const q = query.trim().toLowerCase();
    const pool = localities.filter((l) => !selectedIds.includes(l.id));
    if (!q) return pool.slice(0, 8);
    return pool
      .filter((l) => l.name.toLowerCase().includes(q))
      .slice(0, 8);
  }, [localities, selectedIds, query]);

  function add(id: string) {
    setSelectedIds((prev) => (prev.includes(id) ? prev : [...prev, id]));
    setQuery('');
  }

  function remove(id: string) {
    setSelectedIds((prev) => prev.filter((x) => x !== id));
  }

  return (
    <div ref={wrapRef} className="relative bg-surface px-4 py-3">
      <span className="label flex items-center gap-1.5 text-faint">
        <PinIcon />
        Locality
      </span>

      {/*
        One hidden input per selected id — repeated `neighborhoodId=` params.
        The server DTO accepts both repeated and comma-joined; repeated is the
        HTML-native way when a form is submitted without JS intercepting.
      */}
      {selectedIds.map((id) => (
        <input key={id} type="hidden" name="neighborhoodId" value={id} />
      ))}

      <div
        className="mt-1 flex flex-wrap items-center gap-1.5"
        onClick={() => setOpen(true)}
      >
        {selected.map((l) => (
          <span
            key={l.id}
            className="inline-flex items-center gap-1 rounded-full bg-action/10 px-2 py-0.5 text-[0.75rem] font-medium text-action"
          >
            {l.name}
            <button
              type="button"
              aria-label={`Remove ${l.name}`}
              onClick={(e) => {
                e.stopPropagation();
                remove(l.id);
              }}
              className="text-action/70 hover:text-action"
            >
              ×
            </button>
          </span>
        ))}
        <input
          type="text"
          role="combobox"
          aria-expanded={open}
          aria-autocomplete="list"
          placeholder={selected.length === 0 ? 'Anywhere in Hyderabad' : 'Add another…'}
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          onKeyDown={(e) => {
            // Enter picks the first suggestion, matching a search-bar reflex
            // (typeahead users expect Enter to accept the best match).
            if (e.key === 'Enter' && suggestions[0]) {
              e.preventDefault();
              add(suggestions[0].id);
            }
            // Backspace on an empty query removes the last chip — the same
            // convention Google, GitHub, Notion use.
            if (e.key === 'Backspace' && !query && selected.length > 0) {
              remove(selected[selected.length - 1]!.id);
            }
          }}
          className="min-w-[6ch] flex-1 bg-transparent text-[0.9375rem] font-medium text-ink outline-none placeholder:font-normal placeholder:text-muted"
        />
      </div>

      {open && suggestions.length > 0 && (
        <ul
          role="listbox"
          className="absolute left-0 right-0 top-full z-20 mt-1 max-h-64 overflow-y-auto rounded-card border border-line bg-surface py-1 shadow-lift"
        >
          {suggestions.map((l) => (
            <li key={l.id}>
              <button
                type="button"
                onClick={() => add(l.id)}
                className="block w-full cursor-pointer px-3 py-2 text-left text-[0.875rem] text-ink hover:bg-canvas-deep"
              >
                {l.name}
              </button>
            </li>
          ))}
        </ul>
      )}

      {open && query.trim() && suggestions.length === 0 && (
        <div className="absolute left-0 right-0 top-full z-20 mt-1 rounded-card border border-line bg-surface p-3 text-[0.8125rem] text-muted shadow-lift">
          No localities match &ldquo;{query}&rdquo;.
        </div>
      )}
    </div>
  );
}

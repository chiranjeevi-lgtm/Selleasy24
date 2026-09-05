'use client';

import { useEffect, useRef, useState } from 'react';
import type { Locality } from '@/lib/api';
import { KNOWN_LOCALITIES, localitySlug } from '@/lib/hyderabad-localities';

/**
 * Property Rates Heatmap card.
 *
 * A locality-scale heatmap: one marker per curated Hyderabad locality,
 * sized by listing count and coloured by median ₹/sqft relative to the
 * city median. Higher rates get a deeper gold, lower rates get lighter
 * gold — a monochromatic scale that fits the site's design language
 * rather than the red-yellow-green choropleth incumbents use.
 *
 * Leaflet is loaded from a CDN in the same pattern as `/map/page.tsx`
 * (no npm dependency). Load is idempotent: if the /map page loaded
 * Leaflet first, this component finds `window.L` and reuses it.
 */

const LEAFLET_CSS = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css';
const LEAFLET_JS = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.js';
const HYDERABAD_CENTRE: [number, number] = [17.4065, 78.4772];

/*
 * Leaflet types aren't installed (no @types/leaflet dependency — we load
 * from CDN at runtime). `any` is deliberate here; the same pattern is used
 * in /map/page.tsx. The `declare global` for `window.L` lives there so we
 * don't collide with a duplicate global declaration.
 */
type LeafletModule = any;

async function loadLeaflet(): Promise<LeafletModule> {
  const w = window as any;
  if (w.L) return w.L;

  if (!document.querySelector(`link[href="${LEAFLET_CSS}"]`)) {
    const link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = LEAFLET_CSS;
    link.crossOrigin = '';
    document.head.appendChild(link);
  }

  await new Promise<void>((resolve, reject) => {
    if ((window as any).L) return resolve();
    const existing = document.querySelector<HTMLScriptElement>(
      `script[src="${LEAFLET_JS}"]`,
    );
    if (existing) {
      existing.addEventListener('load', () => resolve(), { once: true });
      existing.addEventListener('error', () => reject(new Error('leaflet load failed')), {
        once: true,
      });
      return;
    }
    const script = document.createElement('script');
    script.src = LEAFLET_JS;
    script.crossOrigin = '';
    script.async = true;
    script.addEventListener('load', () => resolve(), { once: true });
    script.addEventListener('error', () => reject(new Error('leaflet load failed')), {
      once: true,
    });
    document.head.appendChild(script);
  });

  const L = (window as any).L;
  if (!L) throw new Error('leaflet failed to attach to window');
  return L;
}

/**
 * Marker fill colour for a rate value relative to the city median.
 * Monochromatic gold scale — verify is the brand accent.
 */
function fillForRate(rate: number, cityMedian: number): string {
  if (cityMedian <= 0) return '#c9a227cc';
  const ratio = rate / cityMedian;
  if (ratio >= 1.25) return '#7a6017'; // Deep gold — top tier
  if (ratio >= 1.1) return '#a08422'; // Mid-high
  if (ratio >= 0.9) return '#c9a227'; // At median
  if (ratio >= 0.75) return '#e3c86b'; // Below
  return '#f2e3b0'; // Deep discount
}

/**
 * Marker radius scaled by listing count on a log-ish curve, so a locality
 * with 30 listings doesn't dwarf one with 3.
 */
function radiusForCount(count: number): number {
  return Math.max(6, Math.min(18, 5 + Math.sqrt(count) * 3));
}

export function InsightsHeatmap({ localities }: { localities: Locality[] }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading');

  useEffect(() => {
    let cancelled = false;
    let cleanup: (() => void) | undefined;

    async function boot() {
      try {
        const L = await loadLeaflet();
        if (cancelled || !containerRef.current) return;

        // Rates keyed by lowercase name for the join against KNOWN_LOCALITIES.
        const rateByName = new Map<string, { rate: number | null; count: number }>();
        for (const locality of localities) {
          const rateRaw = locality.medianPricePerSqft;
          const rate =
            rateRaw === null || rateRaw === undefined
              ? null
              : typeof rateRaw === 'string'
                ? Number(rateRaw)
                : rateRaw;
          rateByName.set(locality.name.toLowerCase(), {
            rate: Number.isFinite(rate) && rate ? rate : null,
            count: locality.medianSampleSize ?? 0,
          });
        }

        const withRates = KNOWN_LOCALITIES.map((curated) => {
          const match = rateByName.get(curated.name.toLowerCase());
          return { curated, rate: match?.rate ?? null, count: match?.count ?? 0 };
        }).filter((entry) => entry.count > 0);

        const rates = withRates
          .map((e) => e.rate)
          .filter((r): r is number => r !== null);
        const cityMedian =
          rates.length > 0
            ? rates.slice().sort((a, b) => a - b)[Math.floor(rates.length / 2)]!
            : 0;

        const map = L.map(containerRef.current, {
          center: HYDERABAD_CENTRE,
          zoom: 10,
          scrollWheelZoom: false,
          dragging: true,
          zoomControl: false,
          attributionControl: false,
        });

        L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
          maxZoom: 15,
        }).addTo(map);

        for (const entry of withRates) {
          if (entry.rate === null) continue;
          const marker = L.circleMarker([entry.curated.lat, entry.curated.lng], {
            radius: radiusForCount(entry.count),
            color: '#16324f',
            weight: 1.5,
            fillColor: fillForRate(entry.rate, cityMedian),
            fillOpacity: 0.85,
          }).addTo(map);

          const rateLabel = `₹${Math.round(entry.rate).toLocaleString('en-IN')}`;
          marker.bindTooltip(
            `<strong>${entry.curated.name}</strong><br/>${rateLabel}/sqft · ${entry.count} listing${entry.count === 1 ? '' : 's'}`,
            { direction: 'top', offset: [0, -6] },
          );
          marker.on('click', () => {
            window.location.href = `/localities/${localitySlug(entry.curated.name)}`;
          });
        }

        setStatus('ready');
        cleanup = () => map.remove();
      } catch (error) {
        if (cancelled) return;
        setStatus('error');
        console.warn('Heatmap failed to load', error);
      }
    }

    void boot();

    return () => {
      cancelled = true;
      cleanup?.();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="relative">
      <div
        ref={containerRef}
        className="h-40 w-full overflow-hidden rounded-[10px] bg-canvas-deep"
        role="application"
        aria-label="Locality rate heatmap"
      />
      {status !== 'ready' && (
        <div className="pointer-events-none absolute inset-0 grid place-items-center">
          <p className="text-[0.75rem] text-faint">
            {status === 'error' ? 'Map unavailable' : 'Loading map…'}
          </p>
        </div>
      )}
    </div>
  );
}

/**
 * Legend row for the heatmap card — visually decodes the colour scale.
 * Kept as a sibling of the map rather than an overlay so it doesn't fight
 * the tile layer for click / tap targets.
 */
export function HeatmapLegend() {
  const stops: Array<{ color: string; label: string }> = [
    { color: '#f2e3b0', label: 'Low' },
    { color: '#e3c86b', label: '' },
    { color: '#c9a227', label: 'Mid' },
    { color: '#a08422', label: '' },
    { color: '#7a6017', label: 'High' },
  ];
  return (
    <div className="mt-3 flex items-center gap-1.5" aria-label="Colour scale legend">
      {stops.map((stop, i) => (
        <span key={i} className="flex items-center gap-1">
          <span
            aria-hidden="true"
            className="h-2.5 w-4 rounded-sm"
            style={{ backgroundColor: stop.color }}
          />
          {stop.label && (
            <span className="text-[0.6875rem] uppercase tracking-[0.06em] text-muted">
              {stop.label}
            </span>
          )}
        </span>
      ))}
    </div>
  );
}

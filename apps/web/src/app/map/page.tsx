'use client';

import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import { api, type Locality } from '@/lib/api';
import {
  HYDERABAD_CENTRE,
  findKnownLocality,
  type KnownLocality,
} from '@/lib/hyderabad-localities';

/**
 * Locality-scale map.
 *
 * Leaflet is loaded from a CDN rather than installed as an npm dependency, so
 * this page adds no lockfile churn and cannot conflict with anything on main.
 * If Leaflet later moves in-tree, the useEffect below is the only place that
 * changes.
 *
 * Precise per-listing pins wait on the schema's `Property.latitude/longitude`
 * columns being populated — see the comment in schema.prisma. Until then, the
 * map shows every locality that has stock, sized by inventory count, and clicks
 * through to a filtered search rather than a listing.
 */

interface LocalityPin {
  id: string;
  name: string;
  count: number;
  coord: KnownLocality;
}

const LEAFLET_CSS = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css';
const LEAFLET_JS = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.js';

/*
 * Leaflet is loaded via CDN in useEffect, not npm — so no `@types/leaflet`
 * to import from. `any` is deliberate; runtime-only usage is fine and the
 * insights-heatmap component uses the same pattern.
 */
type LeafletModule = any;

async function loadLeaflet(): Promise<LeafletModule> {
  const L = (window as any).L;
  if (L) return L;

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

  const loaded = (window as any).L;
  if (!loaded) throw new Error('leaflet failed to attach to window');
  return loaded;
}

export default function MapPage() {
  const containerRef = useRef<HTMLDivElement>(null);
  const [pins, setPins] = useState<LocalityPin[]>([]);
  const [status, setStatus] = useState<'idle' | 'loading' | 'ready' | 'error'>('idle');
  const [errorMessage, setErrorMessage] = useState<string>('');

  useEffect(() => {
    let cancelled = false;

    async function bootstrap() {
      setStatus('loading');
      try {
        // The search endpoint caps `limit` at 50 server-side; requesting more
        // fails with a validation error. Fifty is enough to size the pins for
        // the busy localities; the pin isn't hidden if a locality has more
        // inventory than that, its count is just under-reported until we
        // paginate. Left as a follow-up.
        const [localities, results] = await Promise.all([
          api.localities('Hyderabad'),
          api.searchListings({ city: 'Hyderabad', limit: '50' }),
        ]);

        if (cancelled) return;

        const counts = new Map<string, number>();
        for (const listing of results.items) {
          const key = listing.property.locality;
          counts.set(key, (counts.get(key) ?? 0) + 1);
        }

        const preparedPins: LocalityPin[] = [];
        for (const locality of localities as Locality[]) {
          const coord = findKnownLocality(locality.name);
          if (!coord) continue;
          preparedPins.push({
            id: locality.id,
            name: locality.name,
            count: counts.get(locality.name) ?? 0,
            coord,
          });
        }
        setPins(preparedPins);

        const L = await loadLeaflet();
        if (cancelled || !containerRef.current) return;

        const map = L.map(containerRef.current, {
          center: [HYDERABAD_CENTRE.lat, HYDERABAD_CENTRE.lng],
          zoom: 11,
          scrollWheelZoom: true,
        });

        L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
          attribution: '&copy; OpenStreetMap contributors',
          maxZoom: 19,
        }).addTo(map);

        for (const pin of preparedPins) {
          const marker = L.circleMarker([pin.coord.lat, pin.coord.lng], {
            radius: 8 + Math.min(pin.count, 20),
            color: '#c9a227',
            weight: 2,
            fillColor: '#16324f',
            fillOpacity: 0.85,
          }).addTo(map);

          const popupHtml = `
            <div style="font-family: system-ui, sans-serif; min-width: 160px">
              <div style="font-weight: 700; color: #14181f; font-size: 15px">${pin.name}</div>
              <div style="color: #6b7078; font-size: 13px; margin-top: 2px">${pin.count} ${
                pin.count === 1 ? 'home' : 'homes'
              }</div>
              <a href="/?neighborhoodId=${pin.id}"
                 style="display:inline-block; margin-top: 8px; padding: 6px 12px; background: #16324f; color: white; text-decoration: none; border-radius: 8px; font-size: 13px; font-weight: 600">
                Browse
              </a>
            </div>`;
          marker.bindPopup(popupHtml);
        }

        setStatus('ready');

        return () => {
          map.remove();
        };
      } catch (error) {
        if (cancelled) return;
        setStatus('error');
        setErrorMessage(error instanceof Error ? error.message : 'Something went wrong.');
      }
    }

    const cleanup = bootstrap();
    return () => {
      cancelled = true;
      void cleanup.then((fn) => fn?.());
    };
  }, []);

  return (
    <div className="mx-auto max-w-[76rem] px-5 py-8 sm:px-8">
      <header className="mb-6">
        <span aria-hidden="true" className="mb-3 block h-[3px] w-10 bg-verify" />
        <h1 className="display text-[2rem] text-ink sm:text-[2.5rem]">
          Where homes are — on the map
        </h1>
        <p className="mt-3 max-w-2xl text-[0.9375rem] leading-relaxed text-muted">
          Every pin is a locality with verified inventory. Click any pin to open
          that area&rsquo;s homes. Precise per-home pins arrive once seller
          coordinates roll out.
        </p>
      </header>

      <div className="relative overflow-hidden rounded-card shadow-card ring-1 ring-line">
        <div
          ref={containerRef}
          className="h-[68vh] min-h-[420px] w-full bg-canvas-deep"
          aria-label="Interactive map of Hyderabad localities"
          role="application"
        />

        {status !== 'ready' && (
          <div className="pointer-events-none absolute inset-0 grid place-items-center bg-canvas/80 text-center">
            <div className="max-w-sm rounded-card bg-surface p-6 shadow-lift ring-1 ring-line">
              {status === 'error' ? (
                <>
                  <p className="text-[1rem] font-semibold text-seal">Map failed to load</p>
                  <p className="mt-2 text-[0.875rem] text-muted">{errorMessage}</p>
                </>
              ) : (
                <>
                  <p className="text-[1rem] font-semibold text-ink">Loading map…</p>
                  <p className="mt-2 text-[0.875rem] text-muted">
                    Fetching localities and drawing pins.
                  </p>
                </>
              )}
            </div>
          </div>
        )}
      </div>

      {status === 'ready' && pins.length === 0 && (
        <p className="mt-4 text-[0.875rem] text-muted">
          No mapped localities have inventory yet. Try the{' '}
          <Link href="/" className="underline underline-offset-4 hover:text-ink">
            main search
          </Link>{' '}
          instead.
        </p>
      )}

      {status === 'ready' && pins.length > 0 && (
        <ul className="mt-6 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {pins
            .filter((pin) => pin.count > 0)
            .sort((a, b) => b.count - a.count)
            .map((pin) => (
              <li key={pin.id}>
                <Link
                  href={`/?neighborhoodId=${pin.id}`}
                  className="flex items-center justify-between rounded-control border border-line bg-surface px-4 py-2.5 text-[0.9375rem] text-ink transition-colors hover:border-muted"
                >
                  <span>{pin.name}</span>
                  <span className="text-[0.8125rem] text-muted">
                    {pin.count} {pin.count === 1 ? 'home' : 'homes'}
                  </span>
                </Link>
              </li>
            ))}
        </ul>
      )}
    </div>
  );
}

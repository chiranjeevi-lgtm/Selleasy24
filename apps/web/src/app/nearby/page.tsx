'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import {
  HYDERABAD_CENTRE,
  distanceKm,
  nearestLocality,
} from '@/lib/hyderabad-localities';

/**
 * "Near me" landing.
 *
 * The browser geolocation API resolves to a lat/lng; the buyer is routed
 * into the main search with `nearLat` / `nearLng` / `radiusKm` set, so
 * results come back as an honest distance-sorted list (closest first, via
 * Haversine on the search API) rather than snapping to whichever locality
 * centroid happens to be nearest. Denial or timeout falls through to the
 * unfiltered Hyderabad search — nobody hits a dead end.
 *
 * The nearest curated locality name is still resolved for display purposes
 * ("Nearest locality: Kondapur, about 1.2 km away") so the buyer has an
 * orienting label above the results — the search itself is coordinate-based.
 */
type State =
  | { kind: 'asking' }
  | { kind: 'denied' | 'unsupported' | 'timeout' }
  | { kind: 'outside'; distanceKm: number }
  | {
      kind: 'located';
      lat: number;
      lng: number;
      /** Nearest curated locality name, if any is within MAX_MATCH_KM. */
      localityName: string | null;
      distanceKm: number;
    };

/** Default radius when the buyer lands on /nearby. Tunable via a link on
 * the results banner (5 / 10 / 20 km) once they are on the search page. */
const DEFAULT_RADIUS_KM = 5;
const MAX_MATCH_KM = 25;
const HYDERABAD_RADIUS_KM = 60;

export default function NearbyPage() {
  const [state, setState] = useState<State>({ kind: 'asking' });

  useEffect(() => {
    if (typeof window === 'undefined') return;

    // Guards every state transition below. Two independent races need it:
    //   1. Component unmount (user navigates away mid-lookup) — the
    //      geolocation callback fires anyway and would setState on a dead
    //      component.
    //   2. Timer vs. slow geolocation — if the 15s timeout fires first and
    //      the browser eventually returns a location, a bare setState would
    //      overwrite `timeout` with `matched` mid-read. Using functional
    //      setState with a still-asking check keeps the first terminal
    //      state and drops any late arrival on the floor.
    let cancelled = false;
    const advance = (next: State) => {
      if (cancelled) return;
      setState((current) => (current.kind === 'asking' ? next : current));
    };

    if (!('geolocation' in navigator)) {
      advance({ kind: 'unsupported' });
      return;
    }

    const timer = window.setTimeout(() => {
      advance({ kind: 'timeout' });
    }, 15_000);

    navigator.geolocation.getCurrentPosition(
      (position) => {
        window.clearTimeout(timer);
        const point = {
          lat: position.coords.latitude,
          lng: position.coords.longitude,
        };

        const distanceFromHyderabad = distanceKm(point, HYDERABAD_CENTRE);
        if (distanceFromHyderabad > HYDERABAD_RADIUS_KM) {
          advance({ kind: 'outside', distanceKm: distanceFromHyderabad });
          return;
        }

        // Curated locality lookup is purely for the display label — the
        // actual search is coordinate-based, so a miss here still returns a
        // usable result (just without a locality name on the banner).
        const nearest = nearestLocality(point, MAX_MATCH_KM);
        advance({
          kind: 'located',
          lat: point.lat,
          lng: point.lng,
          localityName: nearest?.locality.name ?? null,
          distanceKm: nearest?.km ?? 0,
        });
      },
      (error) => {
        window.clearTimeout(timer);
        advance({
          kind: error.code === error.PERMISSION_DENIED ? 'denied' : 'timeout',
        });
      },
      { enableHighAccuracy: false, maximumAge: 5 * 60 * 1000, timeout: 12_000 },
    );

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, []);

  return (
    <div className="mx-auto max-w-[46rem] px-5 py-12 sm:px-8 sm:py-16">
      <span aria-hidden="true" className="mb-3 block h-[3px] w-10 bg-verify" />
      <h1 className="display text-[2rem] text-ink sm:text-[2.5rem]">
        Homes near you
      </h1>

      {state.kind === 'asking' && (
        <div className="mt-8 rounded-card bg-surface p-6 shadow-card ring-1 ring-line">
          <p className="text-[1rem] font-semibold text-ink">
            Finding your locality…
          </p>
          <p className="mt-2 text-[0.9375rem] leading-relaxed text-muted">
            Your browser is asking for permission to share your location. We use
            it once, to work out which Hyderabad area to show you — nothing is
            stored on our side.
          </p>
        </div>
      )}

      {state.kind === 'located' && (
        <div className="mt-8 rounded-card bg-surface p-6 shadow-card ring-1 ring-line">
          <p className="label text-verify">You're here</p>
          {state.localityName ? (
            <>
              <p className="mt-2 display text-[1.5rem] text-ink">
                Near {state.localityName}
              </p>
              <p className="mt-1 text-[0.875rem] text-muted">
                About {state.distanceKm.toFixed(1)} km from the {state.localityName} centre.
              </p>
            </>
          ) : (
            <p className="mt-2 display text-[1.5rem] text-ink">Location found</p>
          )}
          <div className="mt-6 flex flex-wrap gap-2">
            {/* Coordinate-based search — the API filters by Haversine distance
                and auto-sorts closest-first, honest to the "near me" promise
                rather than snapping to the nearest curated centroid. */}
            <Link
              href={`/?nearLat=${state.lat.toFixed(6)}&nearLng=${state.lng.toFixed(6)}&radiusKm=${DEFAULT_RADIUS_KM}`}
              className="rounded-control bg-action px-5 py-2.5 text-[0.9375rem] font-semibold text-white transition-colors hover:bg-action-hover"
            >
              Verified homes within {DEFAULT_RADIUS_KM} km
            </Link>
            <Link
              href={`/?nearLat=${state.lat.toFixed(6)}&nearLng=${state.lng.toFixed(6)}&radiusKm=10`}
              className="rounded-control border border-line bg-surface px-5 py-2.5 text-[0.9375rem] font-medium text-ink transition-colors hover:border-muted"
            >
              Widen to 10 km
            </Link>
            <Link
              href="/map"
              className="rounded-control border border-line bg-surface px-5 py-2.5 text-[0.9375rem] font-medium text-ink transition-colors hover:border-muted"
            >
              See the whole map
            </Link>
          </div>
        </div>
      )}

      {state.kind === 'outside' && (
        <FallbackCard
          title="SellEasy24 covers Hyderabad right now"
          body={`You're about ${Math.round(state.distanceKm)} km from central Hyderabad. We'll be in more cities soon — for now, take a look at what's verified here.`}
        />
      )}

      {state.kind === 'denied' && (
        <FallbackCard
          title="Location access denied"
          body="No problem — you can browse verified homes across Hyderabad or open the map to pick an area."
        />
      )}

      {state.kind === 'timeout' && (
        <FallbackCard
          title="Location took too long"
          body="Your browser didn't return a location in time. Browse all Hyderabad homes, or try again from a spot with better signal."
        />
      )}

      {state.kind === 'unsupported' && (
        <FallbackCard
          title="Your browser can't share a location"
          body="Nothing to worry about — you can still browse verified homes across Hyderabad."
        />
      )}
    </div>
  );
}

function FallbackCard({ title, body }: { title: string; body: string }) {
  return (
    <div className="mt-8 rounded-card bg-surface p-6 shadow-card ring-1 ring-line">
      <p className="text-[1rem] font-semibold text-ink">{title}</p>
      <p className="mt-2 text-[0.9375rem] leading-relaxed text-muted">{body}</p>
      <div className="mt-6 flex flex-wrap gap-2">
        <Link
          href="/"
          className="rounded-control bg-action px-5 py-2.5 text-[0.9375rem] font-semibold text-white transition-colors hover:bg-action-hover"
        >
          Browse Hyderabad homes
        </Link>
        <Link
          href="/map"
          className="rounded-control border border-line bg-surface px-5 py-2.5 text-[0.9375rem] font-medium text-ink transition-colors hover:border-muted"
        >
          Open the map
        </Link>
      </div>
    </div>
  );
}

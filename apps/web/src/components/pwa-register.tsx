'use client';

import { useEffect } from 'react';

/**
 * Registers the service worker.
 *
 * Kept as its own client component so the root layout stays a server
 * component. The registration is idempotent — the browser reuses the
 * existing worker if the file hasn't changed.
 *
 * Deliberately silent on failure: a browser without service worker support
 * (older iOS, some enterprise environments) should still get a working
 * site, just without the offline shell.
 */
export function PWARegister() {
  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (!('serviceWorker' in navigator)) return;

    const register = () => {
      navigator.serviceWorker.register('/sw.js', { scope: '/' }).catch(() => {
        // Swallow — the site still works without a worker.
      });
    };

    if (document.readyState === 'complete') {
      register();
    } else {
      window.addEventListener('load', register, { once: true });
    }
  }, []);

  return null;
}

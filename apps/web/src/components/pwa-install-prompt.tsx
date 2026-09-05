'use client';

import { useEffect, useState } from 'react';

/**
 * Install prompt banner.
 *
 * Chromium fires `beforeinstallprompt` when the site meets install criteria
 * (manifest + icons + HTTPS). We intercept it, stash the event, and expose a
 * dismissible banner instead of letting the browser show its own affordance —
 * so the ask is styled like the rest of the site and the user can decline
 * without it reappearing on every visit.
 *
 * The dismissal is remembered in localStorage rather than a cookie: a person
 * who said no once shouldn't be asked again on the same device.
 */
interface BeforeInstallPromptEvent extends Event {
  readonly platforms: string[];
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

const DISMISSED_KEY = 'selleasy24:install-dismissed';

export function PWAInstallPrompt() {
  const [event, setEvent] = useState<BeforeInstallPromptEvent | null>(null);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (localStorage.getItem(DISMISSED_KEY) === 'true') return;

    // Standalone-mode detection: if the site is already installed, don't ask.
    const isStandalone =
      window.matchMedia('(display-mode: standalone)').matches ||
      // iOS reports install status on the navigator instead.
      ('standalone' in window.navigator && (window.navigator as unknown as { standalone: boolean }).standalone);
    if (isStandalone) return;

    const handler = (e: Event) => {
      e.preventDefault();
      setEvent(e as BeforeInstallPromptEvent);
      setVisible(true);
    };

    window.addEventListener('beforeinstallprompt', handler);
    return () => window.removeEventListener('beforeinstallprompt', handler);
  }, []);

  if (!visible || !event) return null;

  const install = async () => {
    await event.prompt();
    const choice = await event.userChoice;
    if (choice.outcome === 'dismissed') {
      localStorage.setItem(DISMISSED_KEY, 'true');
    }
    setVisible(false);
    setEvent(null);
  };

  const dismiss = () => {
    localStorage.setItem(DISMISSED_KEY, 'true');
    setVisible(false);
  };

  return (
    <div
      role="dialog"
      aria-labelledby="install-prompt-title"
      className="fixed inset-x-4 bottom-4 z-40 mx-auto max-w-md rounded-card bg-surface p-4 shadow-float ring-1 ring-line sm:left-auto sm:right-6"
    >
      <div className="flex items-start gap-3">
        <div
          aria-hidden="true"
          className="grid h-10 w-10 shrink-0 place-items-center rounded-control bg-action"
        >
          <svg viewBox="0 0 20 20" className="h-5 w-5 text-verify" fill="currentColor">
            <path d="M10 2v10m0 0-3.5-3.5M10 12l3.5-3.5M4 15v1.5A1.5 1.5 0 0 0 5.5 18h9a1.5 1.5 0 0 0 1.5-1.5V15" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </div>
        <div className="min-w-0 flex-1">
          <p id="install-prompt-title" className="text-[0.9375rem] font-semibold text-ink">
            Install SellEasy24
          </p>
          <p className="mt-1 text-[0.8125rem] leading-relaxed text-muted">
            Add the app to your home screen for faster access and offline
            browsing of saved homes.
          </p>
          <div className="mt-3 flex items-center gap-2">
            <button
              type="button"
              onClick={install}
              className="rounded-control bg-action px-4 py-2 text-[0.8125rem] font-semibold text-white transition-colors hover:bg-action-hover"
            >
              Install
            </button>
            <button
              type="button"
              onClick={dismiss}
              className="rounded-control px-3 py-2 text-[0.8125rem] font-medium text-muted transition-colors hover:text-ink"
            >
              Not now
            </button>
          </div>
        </div>
        <button
          type="button"
          onClick={dismiss}
          aria-label="Dismiss install prompt"
          className="text-faint transition-colors hover:text-ink"
        >
          <svg viewBox="0 0 16 16" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.8">
            <path d="M4 4l8 8M12 4l-8 8" strokeLinecap="round" />
          </svg>
        </button>
      </div>
    </div>
  );
}

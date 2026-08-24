import Link from 'next/link';
import { signOut } from '@/app/actions';

/**
 * Console chrome.
 *
 * The seal-red rule across the top is the same device the public endorsement uses
 * — here it marks the whole surface as the place verification decisions are made.
 */
type Tab = 'dashboard' | 'queue' | 'projects' | 'reports';

const TABS: ReadonlyArray<{ id: Tab; href: string; label: string }> = [
  { id: 'dashboard', href: '/dashboard', label: 'Dashboard' },
  { id: 'queue', href: '/queue', label: 'Review queue' },
  // A separate queue from listings rather than one merged view: the two reviews
  // check different documents against different registers, and interleaving them
  // would mean switching context on every row.
  { id: 'projects', href: '/projects', label: 'Projects' },
  { id: 'reports', href: '/reports', label: 'Reports' },
];

export function ConsoleShell({
  user,
  active,
  children,
}: {
  user: { fullName: string; role: string };
  active: Tab;
  children: React.ReactNode;
}) {
  const tabClass = (tab: Tab) =>
    `px-3 py-1.5 text-[0.8125rem] transition-colors ${
      active === tab
        ? 'border-b-2 border-seal text-ink'
        : 'border-b-2 border-transparent text-graphite hover:text-ink'
    }`;

  return (
    <div>
      <div className="h-[3px] bg-seal" />
      <header className="border-b border-paper-edge bg-paper">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-4 px-5 py-3">
          <div>
            <p className="stamp-label text-seal">Verification console</p>
            <p className="mt-0.5 text-[0.8125rem] text-graphite">
              {user.fullName} · {user.role.toLowerCase().replace('_', ' ')}
            </p>
          </div>

          <div className="flex items-center gap-1">
            <nav className="flex items-center">
              {TABS.map((tab) => (
                <Link key={tab.id} href={tab.href} className={tabClass(tab.id)}>
                  {tab.label}
                </Link>
              ))}
            </nav>
            <form action={signOut}>
              <button
                type="submit"
                className="ml-2 px-2.5 py-1.5 text-[0.8125rem] text-graphite transition-colors hover:text-ink"
              >
                Sign out
              </button>
            </form>
          </div>
        </div>
      </header>

      <div className="mx-auto max-w-6xl px-5 py-7">{children}</div>
    </div>
  );
}

import { redirect } from 'next/navigation';
import { adminApi, ApiError } from '@/lib/api';
import { ConsoleShell } from '@/components/console-shell';
import { formatAge } from '@/lib/format';
import { ResolveForm } from './resolve-form';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Reports' };

const REASON_LABEL: Record<string, string> = {
  FAKE_LISTING: 'Says it is fake',
  ALREADY_SOLD: 'Says it is already sold',
  INCORRECT_DETAILS: 'Says details are wrong',
  DUPLICATE: 'Says it is a duplicate',
  SPAM_OR_ABUSE: 'Spam or abuse',
  OTHER: 'Other',
};

export default async function ReportsPage() {
  let user;
  let reports;
  try {
    [user, reports] = await Promise.all([adminApi.me(), adminApi.reports()]);
  } catch (error) {
    if (error instanceof ApiError && (error.status === 401 || error.status === 403)) {
      redirect('/login');
    }
    throw error;
  }

  return (
    <ConsoleShell user={user} active="reports">
      <div>
        <h1 className="font-display text-[1.375rem] font-extrabold leading-none tracking-tight text-ink">
          Reported listings
        </h1>
        <p className="mt-1.5 max-w-prose text-[0.8125rem] leading-relaxed text-graphite">
          Oldest first. Whatever you write as the outcome is visible to whoever
          filed the report — that follow-up is the point, and it is what every rival
          platform fails to provide.
        </p>
      </div>

      {reports.length === 0 ? (
        <div className="mt-7 border border-dashed border-paper-edge px-6 py-16 text-center">
          <p className="text-[0.9375rem] text-ink">No open reports</p>
          <p className="mx-auto mt-2 max-w-sm text-[0.8125rem] leading-relaxed text-graphite">
            Reports from buyers appear here. Anyone can file one without an
            account.
          </p>
        </div>
      ) : (
        <ul className="mt-6 space-y-3">
          {reports.map((report) => (
            <li key={report.id} className="border border-paper-edge bg-paper px-4 py-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-[0.875rem] font-medium text-ink">
                    {REASON_LABEL[report.reason] ?? report.reason}
                  </p>
                  <p className="mt-0.5 text-[0.8125rem] text-graphite">
                    {report.listing.title}
                    <span className="text-graphite-light">
                      {' '}
                      · listing is {report.listing.status.toLowerCase().replace('_', ' ')}
                    </span>
                  </p>
                </div>
                <div className="text-right">
                  <span className="stamp-label text-graphite-light">
                    {formatAge(report.createdAt)}
                  </span>
                  <p className="mt-0.5 text-[0.6875rem] text-graphite-light">
                    {report.reporter ? 'signed in' : 'anonymous'}
                  </p>
                </div>
              </div>

              {report.details && (
                <blockquote className="mt-3 border-l-2 border-paper-edge pl-3 text-[0.8125rem] leading-relaxed text-ink">
                  {report.details}
                </blockquote>
              )}

              <div className="mt-4 border-t border-paper-edge pt-3.5">
                <ResolveForm reportId={report.id} />
              </div>
            </li>
          ))}
        </ul>
      )}
    </ConsoleShell>
  );
}

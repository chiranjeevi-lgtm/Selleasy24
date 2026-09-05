import { redirect } from 'next/navigation';
import { adminApi, ApiError, type AllLeadsEntry, type LeadStatus } from '@/lib/api';
import { ConsoleShell } from '@/components/console-shell';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Enquiries' };

/**
 * All enquiries across the platform — admin oversight.
 *
 * The seller sees enquiries on their own listings via /seller/leads; this
 * page is the same data but scoped platform-wide, and only reachable
 * behind admin/moderator authentication. Notification emails admins
 * receive are intentionally PII-free — buyer name/phone/email/message
 * appear only on this page, where the admin's own session gates access.
 */

const STATUS_LABEL: Record<LeadStatus, string> = {
  NEW: 'New',
  CONTACTED: 'Contacted',
  QUALIFIED: 'Qualified',
  CLOSED_WON: 'Closed — won',
  CLOSED_LOST: 'Closed — lost',
};

const STATUS_STYLE: Record<LeadStatus, string> = {
  NEW: 'bg-seal-soft text-seal',
  CONTACTED: 'bg-paper-edge text-graphite',
  QUALIFIED: 'bg-paper-edge text-ink',
  CLOSED_WON: 'bg-paper-edge text-ink',
  CLOSED_LOST: 'bg-paper-edge text-graphite',
};

function formatDateTime(iso: string): string {
  const d = new Date(iso);
  const date = `${d.getDate()} ${d.toLocaleString('en-IN', { month: 'short' })} ${d.getFullYear()}`;
  const time = d.toLocaleTimeString('en-IN', {
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  });
  return `${date} · ${time}`;
}

function LeadRow({ lead }: { lead: AllLeadsEntry }) {
  const targetLabel = lead.listing?.title ?? lead.project?.name ?? '—';
  const sellerLabel = lead.listing?.seller.fullName ?? lead.project?.builder.fullName ?? '—';
  const sellerEmail = lead.listing?.seller.email ?? lead.project?.builder.email ?? '—';
  const kind = lead.listing ? 'Listing' : lead.project ? 'Project' : '—';

  return (
    <article className="rounded border border-paper-edge bg-paper p-4">
      <header className="flex flex-wrap items-baseline justify-between gap-3">
        <div>
          <p className="text-[0.6875rem] uppercase tracking-[0.08em] text-graphite">
            {kind} · Lead {lead.id.slice(0, 8)}
          </p>
          <p className="mt-0.5 text-[1rem] font-semibold text-ink">{targetLabel}</p>
          <p className="mt-0.5 text-[0.75rem] text-graphite">
            To {sellerLabel} ({sellerEmail})
            {lead.projectUnit && ` · ${lead.projectUnit.bedrooms} BHK`}
          </p>
        </div>
        <div className="flex flex-col items-end gap-1">
          <span
            className={`rounded-full px-2 py-0.5 text-[0.6875rem] font-semibold uppercase tracking-[0.06em] ${STATUS_STYLE[lead.status]}`}
          >
            {STATUS_LABEL[lead.status]}
          </span>
          <p className="tabular text-[0.6875rem] text-graphite">{formatDateTime(lead.createdAt)}</p>
          {lead.contactedAt && (
            <p className="tabular text-[0.6875rem] text-graphite">
              Contacted {formatDateTime(lead.contactedAt)}
            </p>
          )}
        </div>
      </header>

      <div className="mt-3 grid grid-cols-1 gap-3 border-t border-paper-edge pt-3 sm:grid-cols-3">
        <div>
          <p className="text-[0.6875rem] uppercase tracking-[0.06em] text-graphite">Buyer</p>
          <p className="mt-1 text-[0.875rem] font-medium text-ink">{lead.name}</p>
        </div>
        <div>
          <p className="text-[0.6875rem] uppercase tracking-[0.06em] text-graphite">Phone</p>
          <p className="mt-1 tabular text-[0.875rem] text-ink">
            <a href={`tel:${lead.phone}`} className="hover:underline">
              {lead.phone}
            </a>
          </p>
        </div>
        <div>
          <p className="text-[0.6875rem] uppercase tracking-[0.06em] text-graphite">Email</p>
          <p className="mt-1 text-[0.875rem] text-ink">
            {lead.email ? (
              <a href={`mailto:${lead.email}`} className="hover:underline">
                {lead.email}
              </a>
            ) : (
              <span className="text-graphite">—</span>
            )}
          </p>
        </div>
      </div>

      {lead.message && (
        <div className="mt-3 border-t border-paper-edge pt-3">
          <p className="text-[0.6875rem] uppercase tracking-[0.06em] text-graphite">Message</p>
          <p className="mt-1 whitespace-pre-wrap text-[0.875rem] leading-relaxed text-ink">
            {lead.message}
          </p>
        </div>
      )}
    </article>
  );
}

const STATUS_FILTERS: Array<{ value: string; label: string }> = [
  { value: '', label: 'All' },
  { value: 'NEW', label: 'New' },
  { value: 'CONTACTED', label: 'Contacted' },
  { value: 'QUALIFIED', label: 'Qualified' },
  { value: 'CLOSED_WON', label: 'Won' },
  { value: 'CLOSED_LOST', label: 'Lost' },
];

interface PageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

export default async function LeadsPage({ searchParams }: PageProps) {
  const params = await searchParams;
  const rawStatus = params.status;
  const status = typeof rawStatus === 'string' ? rawStatus : undefined;

  let user;
  try {
    user = await adminApi.me();
  } catch (error) {
    if (error instanceof ApiError && (error.status === 401 || error.status === 403)) {
      redirect('/login?next=/leads');
    }
    throw error;
  }

  const validStatus =
    status && (STATUS_FILTERS.some((s) => s.value === status) && status !== '')
      ? (status as LeadStatus)
      : undefined;

  let data;
  try {
    data = await adminApi.allLeads(validStatus ? { status: validStatus, limit: 100 } : { limit: 100 });
  } catch (error) {
    if (error instanceof ApiError) {
      throw error;
    }
    data = { total: 0, limit: 100, offset: 0, items: [] as AllLeadsEntry[] };
  }

  return (
    <ConsoleShell user={user} active="leads">
      <header className="flex flex-wrap items-baseline justify-between gap-4">
        <div>
          <h1 className="font-display text-[1.75rem] font-extrabold text-ink">
            All enquiries
          </h1>
          <p className="mt-1 text-[0.875rem] text-graphite">
            {data.total} total · admin oversight of every enquiry submitted on the platform. Buyer contact details are visible here only because this page is behind admin authentication.
          </p>
        </div>
      </header>

      <nav className="mt-6 flex flex-wrap gap-2" aria-label="Filter by status">
        {STATUS_FILTERS.map((f) => {
          const active = (validStatus ?? '') === f.value;
          const href = f.value ? `/leads?status=${f.value}` : '/leads';
          return (
            <a
              key={f.value || 'all'}
              href={href}
              className={
                active
                  ? 'rounded border border-seal bg-seal-soft px-3 py-1 text-[0.75rem] font-semibold text-seal'
                  : 'rounded border border-paper-edge bg-paper px-3 py-1 text-[0.75rem] text-graphite transition-colors hover:border-graphite hover:text-ink'
              }
            >
              {f.label}
            </a>
          );
        })}
      </nav>

      {data.items.length === 0 ? (
        <div className="mt-8 rounded border border-dashed border-paper-edge px-6 py-16 text-center">
          <p className="text-[1rem] font-medium text-ink">No enquiries {validStatus ? `in ${STATUS_LABEL[validStatus]}` : 'yet'}</p>
          <p className="mx-auto mt-2 max-w-md text-[0.875rem] text-graphite">
            When a buyer contacts a seller (or a builder), the enquiry appears here
            in real time, and an admin-notification email is dispatched.
          </p>
        </div>
      ) : (
        <ul className="mt-6 space-y-3">
          {data.items.map((lead) => (
            <li key={lead.id}>
              <LeadRow lead={lead} />
            </li>
          ))}
        </ul>
      )}
    </ConsoleShell>
  );
}

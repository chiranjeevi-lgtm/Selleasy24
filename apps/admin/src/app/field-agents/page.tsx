import { redirect } from 'next/navigation';
import { adminApi, ApiError, type FieldAgentEntry } from '@/lib/api';
import { ConsoleShell } from '@/components/console-shell';
import { activateAgent, suspendAgent } from './actions';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Field agents' };

/**
 * Field-agent moderation queue.
 *
 * Groups records by status: Pending applications at the top (the queue
 * that needs admin action), Active below, Suspended after that.
 * Rejected / inactive rows are hidden by default — the admin can
 * re-surface them via URL flag if needed later.
 *
 * Actions are inline forms per row (no modal), server actions for the
 * mutation. Every row that changes triggers a `revalidatePath` so the row
 * moves visibly to the correct section on next paint.
 */

const EXPERIENCE_LABELS: Record<string, string> = {
  none: 'None — new to the market',
  '1-2': '1–2 years',
  '3-5': '3–5 years',
  '5+': '5+ years',
};

function formatDate(iso: string | null): string {
  if (!iso) return '—';
  const d = new Date(iso);
  return `${d.getDate()} ${d.toLocaleString('en-IN', { month: 'short' })} ${d.getFullYear()}`;
}

function hoursAgo(iso: string): number {
  return Math.round((Date.now() - new Date(iso).getTime()) / 3_600_000);
}

function ExperiencePill({ value }: { value: string }) {
  return (
    <span className="rounded-full bg-paper-edge px-2 py-0.5 text-[0.6875rem] font-medium uppercase tracking-[0.06em] text-graphite">
      {EXPERIENCE_LABELS[value] ?? value}
    </span>
  );
}

function LocalityChips({ items }: { items: string[] }) {
  const visible = items.slice(0, 5);
  const hidden = items.length - visible.length;
  return (
    <div className="flex flex-wrap gap-1">
      {visible.map((l) => (
        <span
          key={l}
          className="rounded bg-paper-edge px-1.5 py-0.5 text-[0.6875rem] text-ink"
        >
          {l}
        </span>
      ))}
      {hidden > 0 && (
        <span className="text-[0.6875rem] text-graphite">+{hidden} more</span>
      )}
    </div>
  );
}

function AgentRow({ agent }: { agent: FieldAgentEntry }) {
  const activateWithId = activateAgent.bind(null, agent.id);
  const suspendWithId = suspendAgent.bind(null, agent.id);

  const showActivate =
    agent.status === 'PENDING' || agent.status === 'SUSPENDED' || agent.status === 'INACTIVE';
  const showSuspend = agent.status === 'ACTIVE';
  const isLegacyOrphan = agent.userId === null;

  return (
    <article className="rounded border border-paper-edge bg-paper p-4">
      <header className="flex flex-wrap items-baseline justify-between gap-3">
        <div>
          <p className="text-[1rem] font-semibold text-ink">{agent.fullName}</p>
          <p className="mt-0.5 text-[0.8125rem] text-graphite">
            {agent.email} · {agent.phone}
          </p>
        </div>
        <p className="tabular text-[0.75rem] text-graphite">
          Applied {formatDate(agent.createdAt)}
          {agent.status === 'PENDING' && ` · ${hoursAgo(agent.createdAt)}h in queue`}
        </p>
      </header>

      <dl className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-3">
        <div>
          <dt className="text-[0.6875rem] uppercase tracking-[0.06em] text-graphite">
            Experience
          </dt>
          <dd className="mt-1">
            <ExperiencePill value={agent.experience} />
          </dd>
        </div>
        <div className="sm:col-span-2">
          <dt className="text-[0.6875rem] uppercase tracking-[0.06em] text-graphite">
            Service localities
          </dt>
          <dd className="mt-1">
            <LocalityChips items={agent.serviceLocalities} />
          </dd>
        </div>
      </dl>

      {agent.notes && (
        <div className="mt-3">
          <p className="text-[0.6875rem] uppercase tracking-[0.06em] text-graphite">Notes</p>
          <p className="mt-1 text-[0.875rem] leading-relaxed text-ink">{agent.notes}</p>
        </div>
      )}

      {agent.status === 'ACTIVE' && (
        <div className="mt-3 grid grid-cols-3 gap-4 border-t border-paper-edge pt-3 text-[0.75rem]">
          <div>
            <p className="text-graphite">Rating</p>
            <p className="tabular font-semibold text-ink">
              {agent.ratingAverage === null
                ? '—'
                : `${agent.ratingAverage.toFixed(1)} (${agent.ratingCount})`}
            </p>
          </div>
          <div>
            <p className="text-graphite">Completed</p>
            <p className="tabular font-semibold text-ink">{agent.completedAssignments}</p>
          </div>
          <div>
            <p className="text-graphite">Activated</p>
            <p className="tabular font-semibold text-ink">{formatDate(agent.activatedAt)}</p>
          </div>
        </div>
      )}

      {agent.status === 'SUSPENDED' && agent.suspendedReason && (
        <div className="mt-3 rounded border-l-2 border-seal bg-seal-soft px-3 py-2">
          <p className="text-[0.6875rem] uppercase tracking-[0.06em] text-seal">
            Suspended {formatDate(agent.suspendedAt)}
          </p>
          <p className="mt-1 text-[0.8125rem] text-ink">{agent.suspendedReason}</p>
        </div>
      )}

      <footer className="mt-4 flex flex-wrap gap-3 border-t border-paper-edge pt-3">
        {showActivate && !isLegacyOrphan && (
          <form action={activateWithId} className="flex flex-wrap items-center gap-2">
            <button
              type="submit"
              className="rounded bg-ink px-3 py-1.5 text-[0.8125rem] font-medium text-paper transition-colors hover:bg-ink/80"
            >
              {agent.status === 'PENDING' ? 'Activate' : 'Re-activate'}
            </button>
            <span className="text-[0.6875rem] text-graphite">
              Linked user <code className="tabular">{agent.userId!.slice(0, 8)}…</code> — role will be upgraded to FIELD_AGENT.
            </span>
          </form>
        )}
        {showActivate && isLegacyOrphan && (
          <div className="flex flex-wrap items-center gap-2 rounded border border-dashed border-seal/40 bg-seal-soft px-3 py-1.5">
            <span className="text-[0.75rem] text-seal">
              Legacy record — no linked user. Ask the applicant to re-apply through the current form (creates account + application in one step). Delete this row via DB when done.
            </span>
          </div>
        )}
        {showSuspend && (
          <form action={suspendWithId} className="flex flex-wrap items-center gap-2">
            <input
              type="text"
              name="reason"
              required
              minLength={10}
              maxLength={500}
              placeholder="Reason (min 10 chars, shown to the agent)"
              className="w-96 rounded border border-paper-edge bg-white px-2 py-1 text-[0.8125rem] text-ink outline-none focus:border-seal"
            />
            <button
              type="submit"
              className="rounded border border-seal px-3 py-1.5 text-[0.8125rem] font-medium text-seal transition-colors hover:bg-seal-soft"
            >
              Suspend
            </button>
          </form>
        )}
      </footer>
    </article>
  );
}

function Section({
  title,
  count,
  agents,
  emptyMessage,
}: {
  title: string;
  count: number;
  agents: FieldAgentEntry[];
  emptyMessage: string;
}) {
  return (
    <section className="mt-8 first:mt-0">
      <header className="flex items-baseline justify-between gap-4">
        <h2 className="text-[1.125rem] font-semibold text-ink">{title}</h2>
        <p className="tabular text-[0.875rem] text-graphite">{count}</p>
      </header>
      {agents.length === 0 ? (
        <p className="mt-3 rounded border border-dashed border-paper-edge px-4 py-6 text-center text-[0.875rem] text-graphite">
          {emptyMessage}
        </p>
      ) : (
        <ul className="mt-3 space-y-3">
          {agents.map((a) => (
            <li key={a.id}>
              <AgentRow agent={a} />
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

interface PageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

export default async function FieldAgentsPage({ searchParams }: PageProps) {
  const params = await searchParams;
  const errorRaw = params.error;
  const errorMessage =
    typeof errorRaw === 'string' ? errorRaw : Array.isArray(errorRaw) ? errorRaw[0] : undefined;

  let user;
  try {
    user = await adminApi.me();
  } catch (error) {
    if (error instanceof ApiError && (error.status === 401 || error.status === 403)) {
      redirect('/login?next=/field-agents');
    }
    throw error;
  }

  // Fetch all statuses in parallel. The Pending queue is what needs
  // action, but showing Active + Suspended lets the admin see the whole
  // roster on one page without a filter chip.
  const [pending, active, suspended] = await Promise.all([
    adminApi.fieldAgentQueue('PENDING').catch(() => ({ total: 0, items: [] as FieldAgentEntry[], limit: 20, offset: 0 })),
    adminApi.fieldAgentQueue('ACTIVE').catch(() => ({ total: 0, items: [] as FieldAgentEntry[], limit: 20, offset: 0 })),
    adminApi.fieldAgentQueue('SUSPENDED').catch(() => ({ total: 0, items: [] as FieldAgentEntry[], limit: 20, offset: 0 })),
  ]);

  return (
    <ConsoleShell user={user} active="field-agents">
      <header>
        <h1 className="font-display text-[1.75rem] font-extrabold text-ink">
          Field-agent applications
        </h1>
        <p className="mt-1 text-[0.875rem] text-graphite">
          Activation sets User.role = FIELD_AGENT AND FieldAgent.status =
          ACTIVE in one transaction. Suspension is reversible.
        </p>
      </header>

      {errorMessage && (
        <div className="mt-6 rounded border-l-2 border-seal bg-seal-soft px-4 py-3">
          <p className="text-[0.8125rem] font-medium text-seal">{errorMessage}</p>
        </div>
      )}

      <Section
        title="Pending applications"
        count={pending.total}
        agents={pending.items}
        emptyMessage="No pending applications right now. Applicants submit via /become-an-agent on the buyer site."
      />

      <Section
        title="Active agents"
        count={active.total}
        agents={active.items}
        emptyMessage="No active field agents yet."
      />

      <Section
        title="Suspended agents"
        count={suspended.total}
        agents={suspended.items}
        emptyMessage="No suspended agents."
      />
    </ConsoleShell>
  );
}

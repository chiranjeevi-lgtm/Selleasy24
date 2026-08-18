import Link from 'next/link';
import { redirect } from 'next/navigation';
import { adminApi, ApiError } from '@/lib/api';
import { ConsoleShell } from '@/components/console-shell';
import { formatArea, formatRupees } from '@/lib/format';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Review queue' };

/**
 * How long this submission has waited, against the 24-hour SLA.
 *
 * Ageing is shown per row rather than only in aggregate because the queue is
 * worked oldest-first: a verifier needs to see, at a glance, which item is about
 * to breach — and queue depth and age are the business alerts that matter here,
 * far more than any server metric.
 */
function Waiting({ hours, breached }: { hours: number; breached: boolean }) {
  const label =
    hours < 1 ? 'under an hour' : hours === 1 ? '1 hour' : `${hours} hours`;

  return (
    <span
      className={`stamp-label tabular ${breached ? 'text-seal' : 'text-graphite-light'}`}
    >
      {breached ? `overdue · ${label}` : `waiting ${label}`}
    </span>
  );
}

export default async function QueuePage() {
  let user;
  let queue;
  try {
    [user, queue] = await Promise.all([adminApi.me(), adminApi.queue()]);
  } catch (error) {
    if (error instanceof ApiError && (error.status === 401 || error.status === 403)) {
      redirect('/login');
    }
    throw error;
  }

  return (
    <ConsoleShell user={user} active="queue">
      <div className="flex flex-wrap items-baseline justify-between gap-4">
        <div>
          <h1 className="font-display text-[1.375rem] font-extrabold leading-none tracking-tight text-ink">
            Awaiting verification
          </h1>
          <p className="mt-1.5 text-[0.8125rem] text-graphite">
            Oldest first. Target is a decision within {queue.slaHours} hours.
          </p>
        </div>

        <div className="flex items-baseline gap-4">
          <div className="text-right">
            <p className="font-display text-[1.5rem] font-extrabold leading-none text-ink tabular">
              {queue.total}
            </p>
            <p className="stamp-label mt-1 text-graphite-light">In queue</p>
          </div>
          <div className="text-right">
            <p
              className={`font-display text-[1.5rem] font-extrabold leading-none tabular ${
                queue.overdue > 0 ? 'text-seal' : 'text-graphite-light'
              }`}
            >
              {queue.overdue}
            </p>
            <p className="stamp-label mt-1 text-graphite-light">Overdue</p>
          </div>
        </div>
      </div>

      {queue.items.length === 0 ? (
        <div className="mt-7 border border-dashed border-paper-edge px-6 py-16 text-center">
          <p className="text-[0.9375rem] text-ink">Queue is clear</p>
          <p className="mx-auto mt-2 max-w-sm text-[0.8125rem] leading-relaxed text-graphite">
            Nothing is waiting for a decision. New submissions appear here as soon
            as a seller sends them in.
          </p>
        </div>
      ) : (
        <ul className="mt-6 space-y-2.5">
          {queue.items.map((item) => (
            <li
              key={item.id}
              className={`border bg-paper ${item.slaBreached ? 'border-seal/40' : 'border-paper-edge'}`}
            >
              <Link
                href={`/review/${item.id}`}
                className="block px-4 py-3.5 transition-colors hover:bg-console/40"
              >
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="truncate text-[0.9375rem] font-medium text-ink">
                      {item.title}
                    </p>
                    <p className="mt-0.5 truncate text-[0.8125rem] text-graphite">
                      {item.property.address} · {item.property.neighborhood.name}
                    </p>
                  </div>
                  <Waiting hours={item.waitingHours} breached={item.slaBreached} />
                </div>

                <div className="mt-3 flex flex-wrap items-baseline gap-x-4 gap-y-1.5 border-t border-paper-edge pt-2.5 text-[0.75rem] text-graphite">
                  <span className="tabular text-ink">
                    {formatRupees(Number(item.price))}
                  </span>
                  <span className="tabular">{formatArea(item.property.areaSqft)}</span>
                  <span className="tabular">{item.property.bedrooms} BHK</span>
                  <span>
                    {item.seller.fullName}
                    {/* A broker's RERA number is a precondition to list, so its
                        absence is something the verifier should see up front. */}
                    {item.seller.sellerKind === 'BROKER' && (
                      <span className={item.seller.reraNumber ? 'text-graphite' : 'text-seal'}>
                        {' '}
                        · {item.seller.reraNumber ?? 'no RERA number'}
                      </span>
                    )}
                  </span>
                  <span className="tabular">{item._count.photos} photos</span>
                  <span className="tabular">{item._count.documents} documents</span>
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </ConsoleShell>
  );
}

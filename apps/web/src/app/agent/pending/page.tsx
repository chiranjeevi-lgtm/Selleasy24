import { redirect } from 'next/navigation';

/**
 * Old canonical URL — kept as a redirect so bookmarks and the earlier
 * post-signup landing target continue to work. The status page moved to
 * /agent/status (which handles PENDING / ACTIVE / SUSPENDED / INACTIVE)
 * so the URL doesn't imply pending-only.
 */
export default function AgentPendingRedirect(): never {
  redirect('/agent/status');
}

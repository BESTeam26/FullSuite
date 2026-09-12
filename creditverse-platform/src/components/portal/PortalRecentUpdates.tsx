/**
 * What has happened on this partner's clients, in their language.
 *
 * Only rows the activity engine already marked `shared_with_partner` — the
 * classification is made where the entry is WRITTEN, by the trigger that knows
 * what the change was, rather than judged again here by a component that does
 * not. An internal note about a client this partner owns stays internal.
 *
 * No actor names: which BES employee mailed a round is workforce information,
 * not an account update (rule 16).
 */
import { formatDate } from "@/lib/format-date";
import { useMyPartnerUpdates } from "@/lib/data/use-partner-portal-actions";

export function PortalRecentUpdates() {
  const updates = useMyPartnerUpdates();
  const rows = updates.data ?? [];

  return (
    <section className="rounded-xl border border-border bg-card p-4">
      <h2 className="text-sm font-bold text-foreground">Recent updates</h2>
      {updates.isLoading ? (
        <p className="mt-2 text-sm text-muted-foreground">Loading…</p>
      ) : rows.length === 0 ? (
        <p className="mt-2 text-sm text-muted-foreground">
          Nothing to report yet. Updates appear here as BES works your clients.
        </p>
      ) : (
        <ul className="mt-3 space-y-2">
          {rows.map((u) => (
            <li key={u.id} className="flex gap-3 text-sm">
              <span className="w-20 shrink-0 text-xs text-muted-foreground">{formatDate(u.happenedAt)}</span>
              <span className="min-w-0 text-foreground">
                <span className="font-medium">{u.clientName}</span>
                {" — "}
                {u.detail?.trim() || u.action}
              </span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

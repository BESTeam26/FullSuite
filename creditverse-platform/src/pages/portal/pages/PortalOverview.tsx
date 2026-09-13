/**
 * The Partner Portal's home.
 *
 * Dee, 2026-09-13: "The Home page should summarize the Partner's account
 * without feeling like a billing dashboard… Billing is visible, but it is not
 * the first thing dominating the portal."
 *
 * So the order is hers: what needs doing, then their clients, then the work
 * BES is doing for them, then updates and messages — and billing last, as a
 * summary with a link rather than a table. A portal that opens on a balance
 * reads as a debt collector.
 */
import { Link } from "react-router-dom";
import { AlertTriangle, ArrowRight, CheckCircle2, ClipboardList, MessagesSquare, Users, Wallet, Workflow } from "lucide-react";
import { formatDate } from "@/lib/format-date";
import { formatMoneyIn } from "@/lib/format-money";
import { cn } from "@/lib/utils";
import { useMyPartnerActions, useMyPartnerUpdates } from "@/lib/data/use-partner-portal-actions";
import { useMyPartnerClients } from "@/lib/data/use-agency-partners";
import { useChannels } from "@/lib/data/use-channels";
import type { PortalSummary } from "@/lib/portal/portal-nav";

const Card = ({ label, value, tone, to, icon: Icon }: {
  label: string; value: string; tone?: string; to: string; icon: typeof Users;
}) => (
  <Link
    to={to}
    className="rounded-xl border border-border bg-card px-3.5 py-3 transition-colors hover:border-primary/50 hover:bg-muted/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
  >
    <span className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
      <Icon className="h-3.5 w-3.5" /> {label}
    </span>
    <span className={cn("mt-1 block text-2xl font-bold tabular-nums", tone ?? "text-foreground")}>{value}</span>
  </Link>
);

const Panel = ({ title, to, linkLabel, children }: {
  title: string; to?: string; linkLabel?: string; children: React.ReactNode;
}) => (
  <section className="rounded-xl border border-border bg-card p-4">
    <div className="mb-2 flex items-center justify-between gap-2">
      <h2 className="text-xs font-bold uppercase tracking-wider text-muted-foreground">{title}</h2>
      {to && (
        <Link to={to} className="inline-flex items-center gap-1 text-[11px] font-medium text-primary hover:underline">
          {linkLabel ?? "View all"} <ArrowRight className="h-3 w-3" />
        </Link>
      )}
    </div>
    {children}
  </section>
);

export function PortalOverview({ summary }: { summary: PortalSummary }) {
  const actions = useMyPartnerActions();
  const clients = useMyPartnerClients(false);
  const updates = useMyPartnerUpdates(5);
  const channels = useChannels();

  const open = (actions.data ?? []).filter((a) => a.status === "open");
  const someClients = (clients.data ?? []).slice(0, 5);
  const conversations = (channels.data ?? []).slice(0, 3);

  return (
    <div className="space-y-4">
      {summary.suspended && (
        <section className="rounded-xl border-2 border-red-500/50 bg-red-500/5 p-4">
          <h2 className="flex items-center gap-2 text-sm font-bold text-red-900">
            <AlertTriangle className="h-4 w-4 shrink-0" /> Account suspended — payment required
          </h2>
          <p className="mt-1 text-sm text-foreground">
            Work on your account is paused while {formatMoneyIn(summary.balanceCents / 100, "USD")} remains
            outstanding. Nothing has been deleted — your clients, files and history are exactly where they
            were, and work resumes as soon as the balance is settled.
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            <Link to="/partner/billing"
              className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
              <Wallet className="h-3.5 w-3.5" /> View billing
            </Link>
            <Link to="/partner/messages"
              className="inline-flex items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-xs font-semibold text-foreground hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
              <MessagesSquare className="h-3.5 w-3.5" /> Contact BES
            </Link>
          </div>
        </section>
      )}

      {/* Dee's order, and the reason for it: operational first, financial last. */}
      <div className="grid gap-2.5 sm:grid-cols-3 lg:grid-cols-5">
        <Card label="Active clients" value={String(summary.activeClients)} to="/partner/clients" icon={Users} />
        <Card label="Action needed" value={String(summary.actionsNeeded)} to="/partner/actions" icon={ClipboardList}
          tone={summary.actionsNeeded > 0 ? "text-amber-700" : "text-muted-foreground"} />
        <Card label="Active services" value={String(summary.activeServices)} to="/partner/services" icon={Workflow} />
        <Card label="Unread messages" value={String(summary.unreadMessages)} to="/partner/messages" icon={MessagesSquare}
          tone={summary.unreadMessages > 0 ? "text-primary" : "text-muted-foreground"} />
        <Card label="Balance due" value={formatMoneyIn(summary.balanceCents / 100, "USD")} to="/partner/billing" icon={Wallet}
          tone={summary.balanceCents > 0 ? "text-foreground" : "text-status-success"} />
      </div>

      <Panel title="Action needed" to="/partner/actions">
        {open.length === 0 ? (
          <p className="flex items-center gap-2 py-2 text-sm text-foreground">
            <CheckCircle2 className="h-4 w-4 text-status-success" /> You&apos;re all caught up.
          </p>
        ) : (
          <ul className="divide-y divide-border/50">
            {open.slice(0, 4).map((a) => (
              <li key={a.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
                <span className="min-w-0">
                  <span className="block truncate text-sm font-medium text-foreground">
                    {a.clientName ? `${a.clientName} — ` : ""}{a.title}
                  </span>
                  <span className="block text-[11px] text-muted-foreground">
                    Requested {formatDate(a.requestedAt)}{a.requestedByName ? ` by ${a.requestedByName}` : ""}
                  </span>
                </span>
                <Link to="/partner/actions"
                  className="shrink-0 rounded-lg bg-primary px-2.5 py-1 text-xs font-semibold text-primary-foreground hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
                  Review
                </Link>
              </li>
            ))}
          </ul>
        )}
      </Panel>

      {!summary.suspended && (
        <Panel title="Your clients" to="/partner/clients" linkLabel="View all clients">
          {someClients.length === 0 ? (
            <p className="py-2 text-sm text-muted-foreground">No clients yet.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[32rem] text-left text-xs">
                <thead>
                  <tr className="border-b border-border/60">
                    <th className="py-1.5 pr-3 font-semibold text-muted-foreground">Client</th>
                    <th className="py-1.5 pr-3 font-semibold text-muted-foreground">Status</th>
                    <th className="py-1.5 pr-3 font-semibold text-muted-foreground">Round</th>
                    <th className="py-1.5 pr-3 font-semibold text-muted-foreground">Open items</th>
                    <th className="py-1.5 font-semibold text-muted-foreground">Last update</th>
                  </tr>
                </thead>
                <tbody>
                  {someClients.map((c) => (
                    <tr key={c.publicId} className="border-b border-border/40 last:border-b-0">
                      <td className="py-1.5 pr-3 font-medium text-foreground">{c.name}</td>
                      <td className="py-1.5 pr-3 text-muted-foreground">{c.status}</td>
                      <td className="py-1.5 pr-3 text-muted-foreground">{c.round}</td>
                      <td className="py-1.5 pr-3 tabular-nums text-muted-foreground">{c.openItems}</td>
                      <td className="py-1.5 text-muted-foreground">
                        {c.lastActivityAt ? formatDate(c.lastActivityAt.slice(0, 10)) : "—"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Panel>
      )}

      <div className="grid gap-4 lg:grid-cols-2">
        <Panel title="Recent updates" to="/partner/updates">
          {(updates.data ?? []).length === 0 ? (
            <p className="py-2 text-sm text-muted-foreground">Nothing new.</p>
          ) : (
            <ul className="divide-y divide-border/50">
              {(updates.data ?? []).slice(0, 5).map((u) => (
                <li key={u.id} className="py-1.5">
                  <p className="text-xs text-foreground">
                    <span className="font-medium">{u.clientName}</span> · {u.action}
                  </p>
                  <p className="text-[11px] text-muted-foreground">{formatDate(u.happenedAt?.slice(0, 10))}</p>
                </li>
              ))}
            </ul>
          )}
        </Panel>

        <Panel title="Messages" to="/partner/messages" linkLabel="Open messages">
          {conversations.length === 0 ? (
            <p className="py-2 text-sm text-muted-foreground">
              No conversation yet. You can start one — you do not have to wait for BES.
            </p>
          ) : (
            <ul className="divide-y divide-border/50">
              {conversations.map((c) => (
                <li key={c.id} className="flex items-center justify-between gap-2 py-1.5">
                  <span className="min-w-0 flex-1 truncate text-xs text-foreground">{c.name}</span>
                  {c.unread > 0 && (
                    <span className="shrink-0 rounded-full bg-primary px-1.5 py-0.5 text-[10px] font-bold text-primary-foreground">
                      {c.unread}
                    </span>
                  )}
                </li>
              ))}
            </ul>
          )}
        </Panel>
      </div>

      {/* Last, and a summary rather than a table. */}
      <Panel title="Billing" to="/partner/billing" linkLabel="View billing">
        <div className="grid gap-3 sm:grid-cols-3">
          <div>
            <p className="text-[11px] text-muted-foreground">Current balance</p>
            <p className={cn("text-lg font-bold", summary.balanceCents > 0 ? "text-foreground" : "text-status-success")}>
              {formatMoneyIn(summary.balanceCents / 100, "USD")}
            </p>
          </div>
          <div>
            <p className="text-[11px] text-muted-foreground">Overdue invoices</p>
            <p className={cn("text-lg font-bold tabular-nums",
              summary.overdueInvoices > 0 ? "text-red-700" : "text-muted-foreground")}>
              {summary.overdueInvoices}
            </p>
          </div>
          <div>
            <p className="text-[11px] text-muted-foreground">Account</p>
            <p className="text-lg font-bold text-foreground">
              {summary.suspended ? "Suspended" : "Active"}
            </p>
          </div>
        </div>
      </Panel>
    </div>
  );
}

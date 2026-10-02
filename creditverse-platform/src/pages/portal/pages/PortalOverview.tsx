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
 *
 * PARTNER_PORTAL_DOCTRINE (Dee, 2026-10-01): the Overview is the partner's
 * command centre — active services, active clients, items needing their
 * action, important updates, upcoming billing, recent messages, current
 * project/build status, and their BES contact. Every number here is a
 * filtered projection of canonical data through a partner-scoped function;
 * nothing is stored for the portal.
 */
import { Link } from "react-router-dom";
import { AlertTriangle, ArrowRight, CheckCircle2, ClipboardList, Megaphone, MessagesSquare, Users, Wallet, Workflow } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { formatDate } from "@/lib/format-date";
import { formatMoneyIn } from "@/lib/format-money";
import { cn } from "@/lib/utils";
import { useMyPartnerActionsNeeded, useMyPartnerFeed } from "@/lib/data/use-partner-portal-actions";
import { actionKindLabel, sortByKindThenDate } from "@/lib/portal/action-kinds";
import { useMyPartnerClients, useMyPartnerProjects } from "@/lib/data/use-agency-partners";
import { useMyPartnerServices, useMyPartnerTeam } from "@/lib/data/use-portal-conversations";
import { fetchPortalBilling } from "@/lib/data/portal-billing";
import { requireSupabase } from "@/lib/supabase/client";
import { useAuth } from "@/lib/auth/auth-context";
import { Avatar } from "@/components/common/Avatar";
import { useChannels } from "@/lib/data/use-channels";
import { PanelState } from "@/components/common/QueryState";
import { hasRows } from "@/lib/ui/query-rows";
import { PartnerFeedList } from "@/components/portal/PartnerFeedList";
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
  const actions = useMyPartnerActionsNeeded();
  const clients = useMyPartnerClients(false);
  const updates = useMyPartnerFeed();
  const channels = useChannels();
  const services = useMyPartnerServices();
  const projects = useMyPartnerProjects();
  const team = useMyPartnerTeam();
  const auth = useAuth();
  const live = auth.mode === "live" && auth.status === "signed-in";
  /* The same keys the Billing and Updates pages use, so a visit there
     serves this from cache (rule 14). */
  const billing = useQuery({ queryKey: ["portal", "billing", "summary"], queryFn: fetchPortalBilling, enabled: live, staleTime: 60_000 });
  const announcements = useQuery({
    queryKey: ["portal", "announcements"], enabled: live, staleTime: 5 * 60_000,
    queryFn: async (): Promise<{ id: string; title: string; pinned: boolean; publishedAt: string }[]> => {
      const { data, error } = await requireSupabase().rpc("my_partner_announcements" as never, { p_limit: 20 } as never);
      if (error) throw error;
      return ((data ?? []) as Record<string, unknown>[]).map((r) => ({
        id: r.id as string, title: r.title as string, pinned: r.pinned === true, publishedAt: r.published_at as string,
      }));
    },
  });
  const contact = (team.data ?? []).find((m) => m.isPrimary) ?? (team.data ?? [])[0] ?? null;
  const important = (announcements.data ?? []).slice().sort((a, b) => Number(b.pinned) - Number(a.pinned)).slice(0, 3);

  const open = sortByKindThenDate(actions.data ?? []);
  const someClients = (clients.data ?? []).slice(0, 5);
  const conversations = (channels.data ?? []).slice(0, 3);
  const caughtUp = (
    <p className="flex items-center gap-2 py-2 text-sm text-foreground">
      <CheckCircle2 className="h-4 w-4 text-status-success" /> You&apos;re all caught up.
    </p>
  );

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

      {/* Who they talk to at BES — the primary assignment, by name and role,
          with the one honest control: a message. */}
      {contact && (
        <section className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border bg-card px-4 py-3">
          <div className="flex items-center gap-3">
            <Avatar name={contact.name} size="md" />
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Your BES contact</p>
              <p className="text-sm font-bold text-foreground">{contact.name}</p>
              {contact.roleLabel && <p className="text-xs text-muted-foreground">{contact.roleLabel}</p>}
            </div>
          </div>
          <Link to="/partner/messages"
            className="inline-flex items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-xs font-semibold text-foreground hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
            <MessagesSquare className="h-3.5 w-3.5" /> Send a message
          </Link>
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
        {/* Two ways to be caught up — no actions at all, or none still open —
            and both say the same thing, so the node is written once. */}
        {!hasRows(actions) ? <PanelState query={actions} empty={caughtUp} />
          : open.length === 0 ? caughtUp : (
          <ul className="divide-y divide-border/50">
            {open.slice(0, 4).map((a) => (
              <li key={`${a.source}:${a.sourceId}`} className="flex flex-wrap items-center justify-between gap-2 py-2">
                <span className="min-w-0">
                  <span className="block truncate text-sm font-medium text-foreground">
                    {a.clientName ? `${a.clientName} — ` : ""}{a.title}
                  </span>
                  <span className="block text-[11px] text-muted-foreground">
                    {actionKindLabel(a.kind)} · Requested {formatDate(a.requestedAt)}
                  </span>
                </span>
                <Link to={a.href ?? "/partner/actions"}
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
          {!hasRows(clients)
            ? <PanelState query={clients} empty={<p className="py-2 text-sm text-muted-foreground">No clients yet.</p>} />
            : (
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

      {!summary.suspended && (
        <Panel title="Projects & services" to="/partner/services" linkLabel="View all">
          {!hasRows(services) && !hasRows(projects)
            ? <PanelState query={services} empty={<p className="py-2 text-sm text-muted-foreground">No active services yet.</p>} />
            : (
            <ul className="divide-y divide-border/50">
              {(services.data ?? []).slice(0, 4).map((sv) => (
                <li key={sv.engagementId} className="flex flex-wrap items-center justify-between gap-2 py-2">
                  <span className="min-w-0">
                    <span className="block truncate text-sm font-medium text-foreground">{sv.moduleLabel}{sv.serviceLabel && sv.serviceLabel !== sv.moduleLabel ? ` · ${sv.serviceLabel}` : ""}</span>
                    <span className="block text-[11px] text-muted-foreground">
                      {sv.status}{sv.startedOn ? ` · Started ${formatDate(sv.startedOn)}` : ""}{sv.milestone ? ` · ${sv.milestone}` : ""}
                    </span>
                  </span>
                  {sv.openItems > 0 && <span className="shrink-0 rounded-full bg-amber-500/15 px-2 py-0.5 text-[10px] font-bold text-amber-800">{sv.openItems} need{sv.openItems === 1 ? "s" : ""} you</span>}
                </li>
              ))}
              {(projects.data ?? []).slice(0, 3).map((pr) => (
                <li key={pr.id} className="py-2">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="min-w-0 truncate text-sm font-medium text-foreground">{pr.name}</span>
                    <span className="text-[11px] text-muted-foreground">{pr.wentLiveAt ? `Live ${formatDate(pr.wentLiveAt)}` : pr.targetGoLive ? `Target ${formatDate(pr.targetGoLive)}` : pr.journey}</span>
                  </div>
                  {pr.progress !== null && (
                    <div className="mt-1.5 flex items-center gap-2">
                      <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-muted"><div className="h-full rounded-full bg-primary" style={{ width: `${Math.max(0, Math.min(100, pr.progress))}%` }} /></div>
                      <span className="text-[11px] font-semibold tabular-nums text-foreground">{Math.round(pr.progress)}%</span>
                    </div>
                  )}
                  {pr.openRequirements > 0 && <p className="mt-1 text-[11px] text-amber-800">{pr.openRequirements} item{pr.openRequirements === 1 ? "" : "s"} BES needs from you</p>}
                </li>
              ))}
            </ul>
          )}
        </Panel>
      )}

      {important.length > 0 && (
        <Panel title="Important updates" to="/partner/updates">
          <ul className="divide-y divide-border/50">
            {important.map((a) => (
              <li key={a.id} className="flex items-start gap-2 py-1.5">
                <Megaphone className="mt-0.5 h-3.5 w-3.5 shrink-0 text-primary" />
                <span className="min-w-0">
                  <span className="block text-sm text-foreground">{a.title}</span>
                  <span className="block text-[11px] text-muted-foreground">{formatDate(a.publishedAt.slice(0, 10))}{a.pinned ? " · Pinned" : ""}</span>
                </span>
              </li>
            ))}
          </ul>
        </Panel>
      )}

      <div className="grid gap-4 lg:grid-cols-2">
        <Panel title="Recent updates" to="/partner/updates">
          {!hasRows(updates)
            ? <PanelState query={updates} empty={<p className="py-2 text-sm text-muted-foreground">Nothing new.</p>} />
            : (
            <PartnerFeedList items={(updates.data ?? []).slice(0, 5)} />
          )}
        </Panel>

        <Panel title="Messages" to="/partner/messages" linkLabel="Open messages">
          {!hasRows(channels) ? (
            <PanelState query={channels} empty={
              <p className="py-2 text-sm text-muted-foreground">
                No conversation yet. You can start one — you do not have to wait for BES.
              </p>} />
          ) : (
            <ul className="divide-y divide-border/50">
              {conversations.map((c) => (
                <li key={c.id} className="flex items-center justify-between gap-2 py-1.5">
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-xs font-medium text-foreground">{c.displayName || c.name}</span>
                    {c.lastMessageText && (
                      <span className="block truncate text-[11px] text-muted-foreground">
                        {c.lastMessageAuthor ? `${c.lastMessageAuthor}: ` : ""}{c.lastMessageText}
                      </span>
                    )}
                  </span>
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
        <div className="grid gap-3 sm:grid-cols-4">
          <div>
            <p className="text-[11px] text-muted-foreground">Next billing</p>
            <p className="text-lg font-bold text-foreground">
              {billing.data?.nextBillingOn ? formatMoneyIn(billing.data.nextBillingCents / 100, "USD") : "—"}
            </p>
            {billing.data?.nextBillingOn && <p className="text-[11px] text-muted-foreground">Due {formatDate(billing.data.nextBillingOn)}</p>}
          </div>
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

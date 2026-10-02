/**
 * News from BES, and what has moved on the partner's own account (Dee,
 * 2026-10-01, PARTNER_PORTAL_DOCTRINE.md: "project update · service milestone
 * · client status update · completed deliverable · billing update · account
 * update. Not raw system logs.").
 *
 * Two sources, both canonical: `announcements` addressed to partners, and
 * my_partner_feed(), which reads the client, project, billing and account
 * records themselves. The audience filter is in the database functions, not
 * here, so no screen can forget it and show a partner something written for
 * BES staff. A filter chip asks the database for that group only — the
 * unopened groups are never fetched.
 */
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Megaphone, Pin } from "lucide-react";
import { useAuth } from "@/lib/auth/auth-context";
import { requireSupabase } from "@/lib/supabase/client";
import { useMyPartnerFeed } from "@/lib/data/use-partner-portal-actions";
import { FEED_GROUPS, type FeedGroup } from "@/lib/portal/partner-feed";
import { PartnerFeedList } from "@/components/portal/PartnerFeedList";
import { cn } from "@/lib/utils";
import { formatDate } from "@/lib/format-date";
import { PanelState } from "@/components/common/QueryState";
import { hasRows } from "@/lib/ui/query-rows";

interface Announcement {
  id: string; title: string; body: string | null; tag: string | null;
  pinned: boolean; publishedAt: string;
}

export function PortalUpdates() {
  const auth = useAuth();
  const live = auth.mode === "live" && auth.status === "signed-in";
  const [group, setGroup] = useState<FeedGroup | null>(null);
  const updates = useMyPartnerFeed(group);
  const announcements = useQuery({
    queryKey: ["portal", "announcements"],
    enabled: live,
    staleTime: 5 * 60_000,
    queryFn: async (): Promise<Announcement[]> => {
      const { data, error } = await requireSupabase().rpc("my_partner_announcements" as never, { p_limit: 20 } as never);
      if (error) throw error;
      return ((data ?? []) as Record<string, unknown>[]).map((r) => ({
        id: r.id as string, title: r.title as string, body: (r.body as string) ?? null,
        tag: (r.tag as string) ?? null, pinned: r.pinned === true,
        publishedAt: r.published_at as string,
      }));
    },
  });

  return (
    <div className="space-y-4">
      <section className="rounded-xl border border-border bg-card p-4">
        <h2 className="mb-2 flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-muted-foreground">
          <Megaphone className="h-3.5 w-3.5" /> From BES
        </h2>
        {!hasRows(announcements) ? (
          <PanelState query={announcements} empty={
            <p className="py-2 text-sm text-muted-foreground">
              No notices right now. Service updates, maintenance windows and holiday schedules appear here.
            </p>} />
        ) : (
          <ul className="divide-y divide-border/50">
            {(announcements.data ?? []).map((a) => (
              <li key={a.id} className="py-2">
                <p className="flex items-center gap-1.5 text-sm font-semibold text-foreground">
                  {a.pinned && <Pin className="h-3 w-3 shrink-0 text-primary" />}
                  {a.title}
                  {a.tag && (
                    <span className="rounded bg-muted px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground">
                      {a.tag}
                    </span>
                  )}
                </p>
                {a.body && <p className="mt-0.5 whitespace-pre-wrap text-xs leading-relaxed text-muted-foreground">{a.body}</p>}
                <p className="mt-0.5 text-[11px] text-muted-foreground">{formatDate(a.publishedAt?.slice(0, 10))}</p>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="rounded-xl border border-border bg-card p-4">
        <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-xs font-bold uppercase tracking-wider text-muted-foreground">On your account</h2>
          <div className="flex flex-wrap gap-1" role="group" aria-label="Show updates about">
            {[{ key: null, label: "All" } as { key: FeedGroup | null; label: string }, ...FEED_GROUPS].map((g) => (
              <button
                key={g.label}
                type="button"
                aria-pressed={group === g.key}
                onClick={() => setGroup(g.key)}
                className={cn(
                  "rounded-full border px-2.5 py-0.5 text-[11px] font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                  group === g.key
                    ? "border-primary bg-primary text-primary-foreground"
                    : "border-border bg-background text-muted-foreground hover:bg-muted hover:text-foreground",
                )}
              >
                {g.label}
              </button>
            ))}
          </div>
        </div>
        {!hasRows(updates) ? (
          <PanelState query={updates} empty={
            <p className="py-2 text-sm text-muted-foreground">
              {group === null
                ? "Nothing has moved yet. Client status changes, project milestones, invoices and account changes appear here."
                : "Nothing in this group yet."}
            </p>} />
        ) : (
          <PartnerFeedList items={updates.data ?? []} />
        )}
      </section>
    </div>
  );
}

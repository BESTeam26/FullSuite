/**
 * News from BES, and what has moved on the partner's own account.
 *
 * Two sources, both canonical: `announcements` addressed to partners, and the
 * activity feed `my_partner_updates` already returns. The audience filter is
 * in the database function, not here, so no screen can forget it and show a
 * partner something written for BES staff.
 */
import { useQuery } from "@tanstack/react-query";
import { Loader2, Megaphone, Pin } from "lucide-react";
import { useAuth } from "@/lib/auth/auth-context";
import { requireSupabase } from "@/lib/supabase/client";
import { useMyPartnerUpdates } from "@/lib/data/use-partner-portal-actions";
import { formatDate } from "@/lib/format-date";

interface Announcement {
  id: string; title: string; body: string | null; tag: string | null;
  pinned: boolean; publishedAt: string;
}

export function PortalUpdates() {
  const auth = useAuth();
  const live = auth.mode === "live" && auth.status === "signed-in";
  const updates = useMyPartnerUpdates(30);
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
        {announcements.isLoading ? (
          <p className="py-3"><Loader2 className="h-4 w-4 animate-spin text-muted-foreground" /></p>
        ) : (announcements.data ?? []).length === 0 ? (
          <p className="py-2 text-sm text-muted-foreground">
            No notices right now. Service updates, maintenance windows and holiday schedules appear here.
          </p>
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
        <h2 className="mb-2 text-xs font-bold uppercase tracking-wider text-muted-foreground">On your account</h2>
        {(updates.data ?? []).length === 0 ? (
          <p className="py-2 text-sm text-muted-foreground">Nothing has moved yet.</p>
        ) : (
          <ul className="divide-y divide-border/50">
            {(updates.data ?? []).map((u) => (
              <li key={u.id} className="py-1.5">
                <p className="text-xs text-foreground">
                  <span className="font-medium">{u.clientName}</span> · {u.action}
                </p>
                {u.detail && <p className="text-[11px] text-muted-foreground">{u.detail}</p>}
                <p className="text-[11px] text-muted-foreground">{formatDate(u.happenedAt?.slice(0, 10))}</p>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

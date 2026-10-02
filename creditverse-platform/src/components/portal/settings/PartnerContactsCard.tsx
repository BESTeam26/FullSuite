/**
 * Who is on the partner's account, and who can sign in to the portal
 * (PARTNER_PORTAL_DOCTRINE.md, Account Settings: "Contacts · Portal users").
 *
 * Read from partner_contacts under its own row rule — a partner contact sees
 * their own company's contacts and nobody else's. Read-only here, by Dee's
 * decision (2026-10-02): "BES approves every PORTAL Access." Portal access is
 * access to client data, so the partner asks through Support and BES grants
 * it; the insert and update rules on partner_contacts are BES-only.
 */
import { Link } from "react-router-dom";
import { MessageSquare, Users } from "lucide-react";
import { usePartnerContacts } from "@/lib/data/use-agency-partners";
import { PORTAL_LABEL, portalState, type PortalState } from "@/lib/data/agency-partners";
import { PanelState } from "@/components/common/QueryState";
import { hasRows } from "@/lib/ui/query-rows";
import { cn } from "@/lib/utils";

const ACCESS_TONE: Record<PortalState, string> = {
  active: "border-emerald-200 bg-emerald-50 text-emerald-800",
  invited: "border-amber-200 bg-amber-50 text-amber-800",
  no_access: "border-border bg-muted text-muted-foreground",
  suspended: "border-red-200 bg-red-50 text-red-800",
  archived: "border-border bg-muted text-muted-foreground",
};

export function PartnerContactsCard({ partnerId, myUserId }: { partnerId: string; myUserId: string | null }) {
  const contacts = usePartnerContacts(partnerId);
  const rows = (contacts.data ?? []).filter((c) => c.status !== "archived");

  return (
    <section className="rounded-xl border border-border bg-card p-4">
      <div className="mb-2 flex flex-wrap items-start justify-between gap-2">
        <div>
          <h2 className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-muted-foreground">
            <Users className="h-3.5 w-3.5" /> Contacts and portal users
          </h2>
          <p className="mt-0.5 text-[11px] text-muted-foreground">Who BES contacts at your company, and who can sign in here.</p>
        </div>
        <Link
          to="/partner/messages?topic=support"
          className="inline-flex items-center gap-1 rounded-md border border-border bg-background px-2 py-1 text-[11px] font-medium text-foreground transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <MessageSquare className="h-3 w-3" /> Ask BES to add or remove someone
        </Link>
      </div>
      {!hasRows({ ...contacts, data: rows }) ? (
        <PanelState query={contacts} empty={<p className="py-2 text-sm text-muted-foreground">No contacts recorded yet.</p>} />
      ) : (
        <ul className="divide-y divide-border/50">
          {rows.map((c) => {
            const state = portalState(c);
            return (
              <li key={c.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
                <div className="min-w-0">
                  <p className="flex flex-wrap items-center gap-1.5 text-sm font-medium text-foreground">
                    {c.fullName || c.email}
                    {c.isPrimary && <span className="rounded bg-primary/10 px-1.5 py-0.5 text-[10px] font-semibold text-primary">Primary</span>}
                    {c.userId && c.userId === myUserId && <span className="text-[11px] font-normal text-muted-foreground">(you)</span>}
                  </p>
                  <p className="break-words text-[11px] text-muted-foreground">
                    {[c.title, c.email, c.phone].filter((x) => x && x.trim()).join(" · ")}
                  </p>
                </div>
                <span className={cn("shrink-0 rounded-full border px-2 py-0.5 text-[10px] font-semibold", ACCESS_TONE[state])}>
                  {PORTAL_LABEL[state]}
                </span>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}

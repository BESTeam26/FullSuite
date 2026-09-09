/**
 * The BES Partner portal — read-only, and no tenant.
 *
 * A partner contact signs in and sees their own partner record and whatever
 * BES has deliberately shared. There is no organization behind this: the
 * `partner_contacts` row IS the boundary, resolved by
 * `partner_group_of_user()`, which returns nothing for a suspended contact or
 * a suspended partner. Access ends in one place rather than screen by screen.
 *
 * What is NOT here is the point: no BES tasks, no EOD, no internal notes, no
 * workforce, no financials, no other partner, no organization. Files appear
 * only when somebody at BES marked them shared — filing a document against a
 * partner does not publish it.
 *
 * Messages are the exception that proves the rule: the conversation shown here
 * is not a portal inbox that BES mirrors into. It is the SAME `channels` row
 * an agent opens from the partner's record, which is why a reply typed here
 * needs nothing to carry it across (0191).
 */
import { useMemo, useState } from "react";
import { Loader2, Building2, Download, Mail, Phone, Search, ShieldCheck, FileText, MessagesSquare, Users } from "lucide-react";
import { useMyPartner, useMyPartnerClients, useMySharedFiles } from "@/lib/data/use-agency-partners";
import { partnerFileUrl } from "@/lib/data/agency-partners";
import { useChannels } from "@/lib/data/use-channels";
import { ConversationPane } from "@/components/communication/ConversationPane";
import { useAuth } from "@/lib/auth/auth-context";
import { formatDate } from "@/lib/format-date";
import { cn } from "@/lib/utils";

const STATUS_NOTE: Record<string, string> = {
  Active: "Your account is active.",
  Onboarding: "Your account is being set up.",
  Paused: "Your account is paused. Please speak to your BES contact.",
  Suspended: "Your access is suspended. Please speak to your BES contact.",
  Archived: "This account is closed.",
};

export const PartnerPortal = () => {
  const { displayName, signOut } = useAuth();
  const partner = useMyPartner();

  if (partner.isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  /* No partner resolves for this account — including a suspended contact,
     whose group deliberately resolves to nothing. Says nothing about what
     exists. */
  if (!partner.data) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-3 p-8 text-center">
        <ShieldCheck className="h-10 w-10 text-muted-foreground" />
        <h1 className="text-lg font-bold text-foreground">No portal access</h1>
        <p className="max-w-md text-sm text-muted-foreground">
          This account does not have partner portal access. If you were expecting it,
          please contact your BES representative.
        </p>
        <button type="button" onClick={() => void signOut()}
          className="mt-2 text-sm font-medium text-primary hover:underline">
          Sign out
        </button>
      </div>
    );
  }

  const p = partner.data;
  return (
    <div className="min-h-screen bg-background">
      <header className="border-b border-border bg-card">
        <div className="mx-auto flex max-w-4xl flex-wrap items-center justify-between gap-2 px-6 py-4">
          <div className="flex items-center gap-3">
            {/* The bundled logo, deliberately: a portal user cannot read the
                agency's branding record (staff-only), and the file ships with
                the app, so the mark renders for everyone or falls away clean. */}
            <img src="/bes-logo.png" alt="Blessed Empire Services"
              className="h-10 w-10 shrink-0 object-contain"
              onError={(e) => { e.currentTarget.hidden = true; }} />
            <div>
              <p className="text-xs font-bold uppercase tracking-wider text-muted-foreground">BES Partner Portal</p>
              <h1 className="text-lg font-bold text-foreground">{p.name}</h1>
            </div>
          </div>
          <div className="text-right">
            <p className="text-sm text-foreground">{displayName}</p>
            <button type="button" onClick={() => void signOut()}
              className="text-xs text-muted-foreground hover:text-foreground hover:underline">
              Sign out
            </button>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-4xl space-y-4 p-6">
        <section className={cn(
          "rounded-xl border px-4 py-3",
          p.status === "Active" ? "border-emerald-500/30 bg-emerald-500/5" : "border-amber-500/40 bg-amber-500/5",
        )}>
          <p className="text-sm font-semibold text-foreground">{p.status}</p>
          <p className="text-xs text-muted-foreground">{STATUS_NOTE[p.status] ?? ""}</p>
        </section>

        <section className="rounded-xl border border-border bg-card p-4">
          <h2 className="mb-3 text-xs font-bold uppercase tracking-wider text-muted-foreground">Your details</h2>
          <dl className="grid gap-3 sm:grid-cols-2">
            <Row label="Name" value={p.name} />
            <Row label="Company" value={p.companyName} icon={Building2} />
            <Row label="Email" value={p.contactEmail} icon={Mail} />
            <Row label="Phone" value={p.phone} icon={Phone} />
            <Row label="Service" value={p.service} />
            <Row label="Partner since" value={formatDate(p.createdAt)} />
          </dl>
          <p className="mt-3 text-xs text-muted-foreground">
            Something out of date? Let your BES contact know and they will update it.
          </p>
        </section>

        <PortalClients />

        <PortalConversation partnerGroupId={p.id} />

        <PortalFiles partnerGroupId={p.id} />
      </main>
    </div>
  );
};

/**
 * The partner's half of the conversation with BES.
 *
 * BES opens it — `channels_insert` asks `can_see_partner`, which is staff
 * only. A partner contact reads and replies; they do not start conversations
 * or decide who is in one, the same way portal access itself is BES's to
 * grant. When none has been started the section says so rather than showing
 * an empty composer that looks broken.
 */
function PortalConversation({ partnerGroupId }: { partnerGroupId: string }) {
  /* The same call the agency's Communication screen makes. A partner contact
     gets back their own partner's conversations and nothing else, because
     `channel_visible` says so — not because this asked a narrower question
     (0192, §1). */
  const channels = useChannels();
  const conversation = (channels.data ?? [])
    .find((c) => c.partnerGroupId === partnerGroupId && !c.archivedAt) ?? null;

  return (
    <section className="flex max-h-[32rem] min-h-[16rem] flex-col overflow-hidden rounded-xl border border-border bg-card">
      <p className="flex items-center gap-2 border-b border-border px-4 pb-2 pt-4 text-xs font-bold uppercase tracking-wider text-muted-foreground">
        <MessagesSquare className="h-3.5 w-3.5" /> Messages
      </p>
      {channels.isLoading ? (
        <p className="p-4"><Loader2 className="h-4 w-4 animate-spin text-muted-foreground" /></p>
      ) : !conversation ? (
        <p className="p-4 text-sm text-muted-foreground">
          No conversation has been started yet. Your BES contact will open one, and it will
          appear here.
        </p>
      ) : (
        <ConversationPane
          channelId={conversation.id}
          name={conversation.name}
          purpose={conversation.purpose}
          emptyLabel="No messages yet. Write to your BES team here."
        />
      )}
    </section>
  );
}

/**
 * The partner's own clients — the canonical BES records, not a copy.
 *
 * What each row shows is exactly what `my_partner_clients()` returns:
 * partner-safe columns. No BES agent names, no internal notes, no other
 * partner's client, ever — the database function is the boundary, and this
 * component could not widen it if it tried (rule 1).
 */
function PortalClients() {
  const [includeClosed, setIncludeClosed] = useState(false);
  const [search, setSearch] = useState("");
  const clients = useMyPartnerClients(includeClosed);

  const rows = useMemo(() => {
    const all = clients.data ?? [];
    const needle = search.trim().toLowerCase();
    if (!needle) return all;
    return all.filter((c) =>
      c.name.toLowerCase().includes(needle) || c.email.toLowerCase().includes(needle));
  }, [clients.data, search]);

  return (
    <section className="rounded-xl border border-border bg-card p-4">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <h2 className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-muted-foreground">
          <Users className="h-3.5 w-3.5" /> Your clients
          {clients.data && <span className="font-normal normal-case">— {clients.data.length}</span>}
        </h2>
        <label className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <input type="checkbox" checked={includeClosed}
            onChange={(e) => setIncludeClosed(e.target.checked)} />
          Include closed files
        </label>
      </div>

      {clients.isLoading ? (
        <p className="py-6 text-center text-sm text-muted-foreground">
          <Loader2 className="mr-2 inline h-4 w-4 animate-spin" /> Loading your clients…
        </p>
      ) : (clients.data ?? []).length === 0 ? (
        <p className="py-4 text-center text-sm text-muted-foreground">
          No client files yet. When BES opens files for your clients, their progress appears here.
        </p>
      ) : (
        <>
          <div className="relative mb-2 max-w-xs">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
            <input
              value={search} onChange={(e) => setSearch(e.target.value)}
              placeholder="Search by name or email"
              className="w-full rounded-lg border border-border bg-background py-1.5 pl-8 pr-3 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
            />
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="text-[11px] uppercase tracking-wider text-muted-foreground">
                <tr className="border-b border-border">
                  <th className="py-2 pr-3 font-medium">Client</th>
                  <th className="py-2 pr-3 font-medium">Status</th>
                  <th className="py-2 pr-3 font-medium">Round</th>
                  <th className="py-2 pr-3 font-medium">Items in work</th>
                  <th className="py-2 font-medium">Last activity</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((c) => (
                  <tr key={c.publicId} className="border-b border-border/50 align-top">
                    <td className="py-2 pr-3">
                      <span className="block text-foreground">{c.name}</span>
                      <span className="block text-[11px] text-muted-foreground">{c.email}</span>
                    </td>
                    <td className="py-2 pr-3">
                      <span className={cn(
                        "inline-block rounded-full border px-2 py-0.5 text-[11px] font-medium",
                        c.lifecycle === "archived"
                          ? "border-border bg-muted text-muted-foreground"
                          : "border-primary/30 bg-primary/5 text-foreground",
                      )}>
                        {c.status}
                      </span>
                    </td>
                    <td className="py-2 pr-3 text-muted-foreground">{c.round}</td>
                    <td className="py-2 pr-3 text-muted-foreground">{c.openItems}</td>
                    <td className="py-2 text-muted-foreground">{formatDate(c.lastActivityAt)}</td>
                  </tr>
                ))}
                {rows.length === 0 && (
                  <tr><td colSpan={5} className="py-4 text-center text-sm text-muted-foreground">
                    No client matches that search.
                  </td></tr>
                )}
              </tbody>
            </table>
          </div>
        </>
      )}
    </section>
  );
}

/**
 * Only what BES deliberately shared (0146): the row is readable because it is
 * shared, and the download link works because the storage policy follows the
 * row. An unshared file is not a hidden row here — it never arrives at all.
 */
function PortalFiles({ partnerGroupId }: { partnerGroupId: string }) {
  const files = useMySharedFiles(partnerGroupId);
  const [failedId, setFailedId] = useState<string | null>(null);

  const open = async (id: string, path: string) => {
    try {
      setFailedId(null);
      const url = await partnerFileUrl(path);
      window.open(url, "_blank", "noopener");
    } catch {
      setFailedId(id);
    }
  };

  return (
    <section className="rounded-xl border border-border bg-card p-4">
      <h2 className="mb-2 flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-muted-foreground">
        <FileText className="h-3.5 w-3.5" /> Shared with you
      </h2>
      {files.isLoading ? (
        <p className="py-4"><Loader2 className="h-4 w-4 animate-spin text-muted-foreground" /></p>
      ) : (files.data ?? []).length === 0 ? (
        <p className="py-4 text-center text-sm text-muted-foreground">
          Nothing has been shared yet. Documents BES shares with you will appear here.
        </p>
      ) : (
        <ul className="divide-y divide-border/50">
          {(files.data ?? []).map((f) => (
            <li key={f.id} className="flex items-center justify-between gap-2 py-2">
              <span className="min-w-0">
                <span className="block truncate text-sm text-foreground">{f.name}</span>
                <span className="block text-[11px] text-muted-foreground">
                  {f.sharedAt ? `Shared ${formatDate(f.sharedAt)}` : formatDate(f.createdAt)}
                  {failedId === f.id && <span className="text-destructive"> · could not open — try again</span>}
                </span>
              </span>
              <button type="button" onClick={() => void open(f.id, f.path)}
                className="flex items-center gap-1 rounded-lg border border-border px-2.5 py-1.5 text-xs font-medium text-foreground hover:bg-muted">
                <Download className="h-3.5 w-3.5" /> Download
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function Row({ label, value, icon: Icon }: { label: string; value: string | null; icon?: typeof Mail }) {
  return (
    <div>
      <dt className="text-xs font-bold uppercase tracking-wider text-muted-foreground">{label}</dt>
      <dd className="mt-0.5 flex items-center gap-1.5 text-sm text-foreground">
        {Icon && value && <Icon className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />}
        {value || <span className="italic text-muted-foreground">Not recorded</span>}
      </dd>
    </div>
  );
}

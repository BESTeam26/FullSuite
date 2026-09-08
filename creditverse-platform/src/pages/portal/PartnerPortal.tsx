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
import { Loader2, Building2, Mail, Phone, ShieldCheck, FileText, MessagesSquare } from "lucide-react";
import { useMyPartner } from "@/lib/data/use-agency-partners";
import { usePartnerChannels } from "@/lib/data/use-channels";
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
          <div>
            <p className="text-xs font-bold uppercase tracking-wider text-muted-foreground">BES Partner Portal</p>
            <h1 className="text-lg font-bold text-foreground">{p.name}</h1>
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

        <PortalConversation partnerGroupId={p.id} />

        <section className="rounded-xl border border-border bg-card p-4">
          <h2 className="mb-2 flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-muted-foreground">
            <FileText className="h-3.5 w-3.5" /> Shared with you
          </h2>
          <p className="py-4 text-center text-sm text-muted-foreground">
            Nothing has been shared yet. Documents and updates BES shares with you will appear here.
          </p>
        </section>
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
  const channels = usePartnerChannels(partnerGroupId);
  const conversation = (channels.data ?? [])[0] ?? null;

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

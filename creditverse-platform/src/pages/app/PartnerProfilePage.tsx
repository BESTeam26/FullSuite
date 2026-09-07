/**
 * One BES Partner, in full.
 *
 * A partner is not an end consumer and not a SaaS tenant, so this is not the
 * client profile with different words on it — it is the partner's own record:
 * who they are, who we deal with there, what portal access those people have,
 * and what BES has shared with them.
 *
 * Lifecycle is archive, never delete. A partner with any history is a record
 * of something that happened, and destroying it destroys the history of every
 * engagement, file and note attached to it (rule 11).
 */
import { useState } from "react";
import { Link, useParams } from "react-router-dom";
import {
  ArrowLeft, Ban, Building2, Handshake, Loader2, Mail, Phone, Plus,
  RotateCcw, ShieldCheck, UserPlus,
} from "lucide-react";
import { HqPageShell } from "@/pages/app/HqPages";
import { ContentCard } from "@/components/dashboard/DivisionLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useAgencyPartner, usePartnerContacts, usePartnerActions } from "@/lib/data/use-agency-partners";
import { PORTAL_LABEL, portalState } from "@/lib/data/agency-partners";
import { useAuth } from "@/lib/auth/auth-context";
import { atLeast, type AgencyRole } from "@/lib/agency/navigation";
import { formatDate } from "@/lib/format-date";
import { cn } from "@/lib/utils";

const STATUS_TONE: Record<string, string> = {
  Active: "border-emerald-500/30 bg-emerald-500/10 text-emerald-700",
  Onboarding: "border-blue-500/30 bg-blue-500/10 text-blue-700",
  Paused: "border-amber-500/30 bg-amber-500/10 text-amber-700",
  Suspended: "border-amber-500/40 bg-amber-500/10 text-amber-700",
  Archived: "border-border bg-muted text-muted-foreground",
};

export const PartnerProfilePage = () => {
  const { id = "" } = useParams();
  const partner = useAgencyPartner(id);
  const contacts = usePartnerContacts(id);
  const actions = usePartnerActions();
  const { agencyMembership } = useAuth();
  const canManage = atLeast((agencyMembership?.role as AgencyRole) ?? null, "agency_manager");

  const [addingContact, setAddingContact] = useState(false);
  const [contactName, setContactName] = useState("");
  const [contactEmail, setContactEmail] = useState("");

  if (partner.isLoading) {
    return (
      <HqPageShell title="Partner" description="Loading…" icon={Handshake}>
        <p className="py-10 text-center text-sm text-muted-foreground">
          <Loader2 className="mr-2 inline h-4 w-4 animate-spin" /> Loading…
        </p>
      </HqPageShell>
    );
  }
  const p = partner.data;
  if (!p) {
    return (
      <HqPageShell title="Partner not found" description="" icon={Handshake}>
        <p className="text-sm text-muted-foreground">
          This partner does not exist, or is outside what you are authorized to see.
        </p>
        <Link to="/app/bes-partners" className="mt-3 inline-flex items-center gap-1 text-sm text-primary hover:underline">
          <ArrowLeft className="h-4 w-4" /> Back to BES Partners
        </Link>
      </HqPageShell>
    );
  }

  return (
    <HqPageShell
      title={p.name}
      description={p.companyName ?? "BES Partner"}
      icon={Handshake}
      actions={
        canManage && (
          <div className="flex flex-wrap items-center gap-2">
            <span className={cn("rounded-full border px-2 py-0.5 text-xs font-bold", STATUS_TONE[p.status])}>
              {p.status}
            </span>
            {p.status !== "Suspended" && p.status !== "Archived" && (
              <Button size="sm" variant="ghost"
                onClick={() => actions.setStatus.mutate({ id: p.id, status: "Suspended" })}>
                <Ban className="mr-1.5 h-3.5 w-3.5" /> Suspend
              </Button>
            )}
            {p.status === "Suspended" && (
              <Button size="sm" variant="ghost"
                onClick={() => actions.setStatus.mutate({ id: p.id, status: "Active" })}>
                <RotateCcw className="mr-1.5 h-3.5 w-3.5" /> Reactivate
              </Button>
            )}
            {p.status !== "Archived" ? (
              <Button size="sm" variant="ghost"
                onClick={() => actions.setStatus.mutate({ id: p.id, status: "Archived" })}>
                Archive
              </Button>
            ) : (
              <Button size="sm" variant="ghost"
                onClick={() => actions.setStatus.mutate({ id: p.id, status: "Active" })}>
                <RotateCcw className="mr-1.5 h-3.5 w-3.5" /> Restore
              </Button>
            )}
          </div>
        )
      }
    >
      <Link to="/app/bes-partners" className="mb-4 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="h-4 w-4" /> BES Partners
      </Link>

      {p.status === "Archived" && (
        <div className="mb-4 rounded-xl border border-border bg-muted px-4 py-3 text-sm text-muted-foreground">
          This partner is archived. Everything about them is kept; they no longer appear in
          active lists, and their portal access is off.
        </div>
      )}

      <div className="grid gap-4 lg:grid-cols-3">
        <div className="space-y-4 lg:col-span-2">
          <ContentCard title="Details">
            <dl className="grid gap-3 sm:grid-cols-2">
              <Detail label="Name" value={p.name} />
              <Detail label="Company" value={p.companyName} icon={Building2} />
              <Detail label="Email" value={p.contactEmail} icon={Mail} />
              <Detail label="Phone" value={p.phone} icon={Phone} />
              <Detail label="Service / relationship" value={p.service} />
              <Detail label="Primary contact" value={p.primaryContact} />
              <Detail label="Contract reference" value={p.contractRef} />
              <Detail label="Added" value={formatDate(p.createdAt)} />
            </dl>
            {p.address && <Detail className="mt-3" label="Address" value={p.address} />}
            {p.notes && (
              <div className="mt-3">
                <p className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Notes</p>
                <p className="mt-0.5 whitespace-pre-wrap text-sm text-foreground">{p.notes}</p>
              </div>
            )}
          </ContentCard>

          <ContentCard
            title="People and portal access"
            action={canManage && (
              <Button size="sm" variant="ghost" onClick={() => setAddingContact((v) => !v)}>
                <UserPlus className="mr-1.5 h-3.5 w-3.5" /> Add contact
              </Button>
            )}
          >
            {addingContact && canManage && (
              <div className="mb-3 flex flex-wrap items-end gap-2 rounded-lg border border-border bg-muted/40 p-3">
                <Input value={contactName} onChange={(e) => setContactName(e.target.value)}
                  placeholder="Full name" aria-label="Contact name" className="h-8 w-44" />
                <Input type="email" value={contactEmail} onChange={(e) => setContactEmail(e.target.value)}
                  placeholder="name@company.com" aria-label="Contact email" className="h-8 w-56" />
                <Button size="sm"
                  disabled={!contactName.trim() || !contactEmail.trim() || actions.addContact.isPending}
                  onClick={async () => {
                    await actions.addContact.mutateAsync({
                      groupId: p.id, fullName: contactName, email: contactEmail,
                      isPrimary: (contacts.data ?? []).length === 0,
                    });
                    setContactName(""); setContactEmail(""); setAddingContact(false);
                  }}>
                  <Plus className="mr-1 h-3.5 w-3.5" /> Add
                </Button>
              </div>
            )}

            {contacts.isLoading ? (
              <p className="py-4 text-center text-xs text-muted-foreground">Loading…</p>
            ) : (contacts.data ?? []).length === 0 ? (
              <p className="py-4 text-center text-sm text-muted-foreground">
                Nobody recorded yet. Add a contact to invite them to the portal.
              </p>
            ) : (
              <ul className="divide-y divide-border/50">
                {(contacts.data ?? []).map((c) => {
                  const state = portalState(c);
                  return (
                    <li key={c.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
                      <span className="min-w-0">
                        <span className="block truncate text-sm font-medium text-foreground">
                          {c.fullName}{c.isPrimary && <span className="ml-1.5 text-[10px] font-bold text-muted-foreground">PRIMARY</span>}
                        </span>
                        <span className="block truncate text-xs text-muted-foreground">{c.email}</span>
                      </span>
                      <span className="flex shrink-0 items-center gap-2">
                        <span className={cn(
                          "rounded-full border px-2 py-0.5 text-[10px] font-bold",
                          state === "active" ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-700"
                            : state === "invited" ? "border-blue-500/30 bg-blue-500/10 text-blue-700"
                            : "border-border bg-muted text-muted-foreground",
                        )}>
                          {PORTAL_LABEL[state]}
                        </span>
                        {canManage && c.status === "active" && (
                          <Button size="sm" variant="ghost" className="h-6 px-2 text-xs"
                            onClick={() => actions.setContactStatus.mutate({ id: c.id, groupId: p.id, status: "suspended" })}>
                            Suspend
                          </Button>
                        )}
                        {canManage && c.status === "suspended" && (
                          <Button size="sm" variant="ghost" className="h-6 px-2 text-xs"
                            onClick={() => actions.setContactStatus.mutate({ id: c.id, groupId: p.id, status: "active" })}>
                            Restore
                          </Button>
                        )}
                      </span>
                    </li>
                  );
                })}
              </ul>
            )}
          </ContentCard>
        </div>

        <div className="space-y-4">
          <ContentCard title={<span className="flex items-center gap-2"><ShieldCheck className="h-4 w-4 text-muted-foreground" /> What the partner can see</span>}>
            <p className="text-sm text-muted-foreground">
              An invited contact sees their own partner record, their status, and any file or
              update BES has deliberately shared with them.
            </p>
            <p className="mt-2 text-xs text-muted-foreground">
              They never see BES internal tasks, EOD, internal notes, workforce, financials,
              other partners, or any organization. Filing a document against this partner does
              not share it — sharing is a separate, deliberate act.
            </p>
          </ContentCard>
        </div>
      </div>
    </HqPageShell>
  );
};

function Detail({ label, value, icon: Icon, className }: {
  label: string; value: string | null | undefined; icon?: typeof Mail; className?: string;
}) {
  return (
    <div className={className}>
      <dt className="text-xs font-bold uppercase tracking-wider text-muted-foreground">{label}</dt>
      <dd className="mt-0.5 flex items-center gap-1.5 text-sm text-foreground">
        {Icon && value && <Icon className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />}
        {value || <span className="italic text-muted-foreground">Not recorded</span>}
      </dd>
    </div>
  );
}

/**
 * How the work for this partner actually runs: which CRM, which mailing
 * system, which SOP, which channel.
 *
 * Names, links and notes ONLY. Never a credential. A password in a text field
 * is readable by everyone who can read the record and leaves no trace when it
 * is read — credentials need a mechanism that encrypts them and audits every
 * access, and this record is not that. Legacy rows that carried one are
 * flagged on Overview instead.
 */
import { useState } from "react";
import { ExternalLink, Loader2 } from "lucide-react";
import { ContentCard } from "@/components/dashboard/DivisionLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { OpsSelect } from "@/components/ui/ops-select";
import { Detail } from "@/components/agency/partner/partner-ui";
import { usePartnerOperations, usePartnerServiceActions } from "@/lib/data/use-partner-services";
import { useAgencyPermissions } from "@/lib/data/agency-permissions";
import type { AgencyPerson } from "@/lib/data/agency-workforce";

export function PartnerOperationsTab({ groupId, people }: { groupId: string; people: AgencyPerson[] }) {
  const ops = usePartnerOperations(groupId);
  const actions = usePartnerServiceActions(groupId);
  const perms = useAgencyPermissions();
  const canEdit = perms.can("partners.operations");
  const [editing, setEditing] = useState(false);
  const o = ops.data;

  const link = (label: string, url: string | null | undefined) =>
    url ? (
      <a href={url} target="_blank" rel="noreferrer"
        className="inline-flex items-center gap-1 text-primary hover:underline">
        {label} <ExternalLink className="h-3 w-3" />
      </a>
    ) : null;

  return (
    <ContentCard
      title="Systems and configuration"
      action={canEdit && (
        <Button size="sm" variant="ghost" onClick={() => setEditing((v) => !v)}>
          {editing ? "Cancel" : o ? "Edit" : "Set up"}
        </Button>
      )}
    >
      {ops.isLoading ? (
        <p className="py-4 text-center text-sm text-muted-foreground">
          <Loader2 className="mr-2 inline h-4 w-4 animate-spin" /> Loading…
        </p>
      ) : editing && canEdit ? (
        <OperationsForm
          current={o ?? null} people={people}
          saving={actions.saveOperations.isPending}
          onCancel={() => setEditing(false)}
          onSave={async (v) => { await actions.saveOperations.mutateAsync(v); setEditing(false); }}
        />
      ) : !o ? (
        <p className="py-4 text-sm text-muted-foreground">
          Nothing configured yet. This is where the CRM, mailing system, SOP and communication
          channel for this partner are recorded — the things a new processor needs on day one.
        </p>
      ) : (
        <>
          <dl className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            <Detail label="CRM" value={o.crmName ? <>{o.crmName} {link("open", o.crmUrl)}</> : null} />
            <Detail label="Mailing system" value={o.mailingSystem ? <>{o.mailingSystem} {link("open", o.mailingUrl)}</> : null} />
            <Detail label="GHL location" value={o.ghlLocation ? <>{o.ghlLocation} {link("open", o.ghlUrl)}</> : null} />
            <Detail label="SOP" value={link("Open the SOP", o.sopUrl)} />
            <Detail label="Communication" value={o.commChannel ? <>{o.commChannel} {link("open", o.commUrl)}</> : null} />
            <Detail label="Operations manager"
              value={people.find((p) => p.userId === o.operationsManagerId)?.name ?? null} />
          </dl>
          {o.notes && (
            <div className="mt-3">
              <p className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Operational notes</p>
              <p className="mt-0.5 whitespace-pre-wrap text-sm text-foreground">{o.notes}</p>
            </div>
          )}
        </>
      )}
      <p className="mt-3 text-[11px] text-muted-foreground">
        Links and names only. Do not put passwords, API keys or security codes here — they would be
        readable by everyone who can open this record and leave no trace of who read them.
      </p>
    </ContentCard>
  );
}

type Ops = NonNullable<ReturnType<typeof usePartnerOperations>["data"]>;

function OperationsForm({ current, people, saving, onSave, onCancel }: {
  current: Ops | null;
  people: AgencyPerson[];
  saving: boolean;
  onSave: (v: Partial<Ops>) => void;
  onCancel: () => void;
}) {
  const [v, setV] = useState({
    crmName: current?.crmName ?? "", crmUrl: current?.crmUrl ?? "",
    mailingSystem: current?.mailingSystem ?? "", mailingUrl: current?.mailingUrl ?? "",
    ghlLocation: current?.ghlLocation ?? "", ghlUrl: current?.ghlUrl ?? "",
    sopUrl: current?.sopUrl ?? "",
    commChannel: current?.commChannel ?? "", commUrl: current?.commUrl ?? "",
    operationsManagerId: current?.operationsManagerId ?? "__none__",
    notes: current?.notes ?? "",
  });
  const set = (patch: Partial<typeof v>) => setV((old) => ({ ...old, ...patch }));

  return (
    <div className="space-y-2">
      <div className="grid gap-2 sm:grid-cols-2">
        <Input value={v.crmName} onChange={(e) => set({ crmName: e.target.value })} placeholder="CRM name" aria-label="CRM name" />
        <Input value={v.crmUrl} onChange={(e) => set({ crmUrl: e.target.value })} placeholder="CRM link" aria-label="CRM link" />
        <Input value={v.mailingSystem} onChange={(e) => set({ mailingSystem: e.target.value })} placeholder="Mailing system" aria-label="Mailing system" />
        <Input value={v.mailingUrl} onChange={(e) => set({ mailingUrl: e.target.value })} placeholder="Mailing link" aria-label="Mailing link" />
        <Input value={v.ghlLocation} onChange={(e) => set({ ghlLocation: e.target.value })} placeholder="GHL location" aria-label="GHL location" />
        <Input value={v.ghlUrl} onChange={(e) => set({ ghlUrl: e.target.value })} placeholder="GHL link" aria-label="GHL link" />
        <Input value={v.commChannel} onChange={(e) => set({ commChannel: e.target.value })} placeholder="Slack, WhatsApp, email…" aria-label="Communication channel" />
        <Input value={v.commUrl} onChange={(e) => set({ commUrl: e.target.value })} placeholder="Channel link" aria-label="Channel link" />
        <Input value={v.sopUrl} onChange={(e) => set({ sopUrl: e.target.value })} placeholder="SOP link" aria-label="SOP link" />
        <OpsSelect aria-label="Operations manager" size="field" value={v.operationsManagerId}
          onValueChange={(val) => set({ operationsManagerId: val })}
          options={[{ value: "__none__", label: "No operations manager" },
            ...people.map((p) => ({ value: p.userId, label: p.name }))]} />
      </div>
      <Textarea rows={3} value={v.notes} onChange={(e) => set({ notes: e.target.value })}
        placeholder="How the work runs — handover notes, quirks, who to ask" aria-label="Operational notes" />
      <div className="flex gap-2">
        <Button size="sm" disabled={saving}
          onClick={() => onSave({
            ...v,
            operationsManagerId: v.operationsManagerId === "__none__" ? null : v.operationsManagerId,
          })}>
          {saving && <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />} Save
        </Button>
        <Button size="sm" variant="ghost" onClick={onCancel}>Cancel</Button>
      </div>
    </div>
  );
}

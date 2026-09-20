/**
 * Setting what a person is paid, and what BES pays for them.
 *
 * This replaces the single-rate editor. The reason it had to change is one
 * sentence: Archie's ₱100/hour was never Archie's. It was BES's cost, paid to
 * Bryan, who pays Archie ₱80. One field could not hold two numbers, so the
 * screen asks for both when a managing partner is involved and for one when
 * BES pays the worker directly.
 *
 * The BES-cost field appears only to someone who may already SEE BES cost.
 * That is a courtesy, not the protection: the database refuses the write
 * regardless of what this form renders (rule 1).
 */
import { useState } from "react";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { OpsSelect } from "@/components/ui/ops-select";
import { useOpenArrangement } from "@/lib/data/use-compensation";
import { useAgencyMembers } from "@/lib/data/use-agency-teams";
import { PAY_CURRENCIES } from "@/lib/data/people-management";
import { formatCentsIn } from "@/lib/format-money";
import { useToast } from "@/hooks/use-toast";
import type { ArrangementType, CompensationArrangement, CompensationBasis } from "@/lib/data/compensation";

const BASES: { value: CompensationBasis; label: string }[] = [
  { value: "hourly", label: "Per hour" },
  { value: "daily", label: "Per day" },
  { value: "monthly", label: "Per month" },
  { value: "per_cutoff", label: "Fixed per cutoff" },
];

const today = () => new Date().toISOString().slice(0, 10);
const toCents = (v: string) => Math.round(Number(v) * 100);

export function ArrangementEditor({ userId, current, canSeeCost }: {
  userId: string;
  current?: CompensationArrangement;
  canSeeCost: boolean;
}) {
  const { toast } = useToast();
  const open = useOpenArrangement();
  const people = useAgencyMembers();

  const [type, setType] = useState<ArrangementType>(current?.arrangementType ?? "direct_bes");
  const [basis, setBasis] = useState<CompensationBasis>(current?.basis ?? "hourly");
  const [agent, setAgent] = useState(current ? String(current.agentRateCents / 100) : "");
  const [cost, setCost] = useState(current ? String(current.besCostCents / 100) : "");
  const [partner, setPartner] = useState(current?.managingPartnerId ?? "");
  const [currency, setCurrency] = useState(current?.currency ?? "PHP");
  const [from, setFrom] = useState(today());
  const [reason, setReason] = useState("");

  const agentCents = toCents(agent);
  const costCents = type === "direct_bes" ? agentCents : toCents(cost);
  const margin = costCents - agentCents;
  const valid =
    Number.isFinite(agentCents) && agentCents >= 0 && reason.trim().length >= 3 &&
    (type === "direct_bes" || (Boolean(partner) && Number.isFinite(costCents) && costCents >= agentCents));

  const save = () => {
    if (!valid) return;
    open.mutate(
      { userId, arrangementType: type, basis, agentRateCents: agentCents, besCostCents: costCents,
        managingPartnerId: partner || null, currency, effectiveFrom: from, reason: reason.trim() },
      {
        onSuccess: () => {
          setReason("");
          toast({ title: "Arrangement set", description: `In force from ${from}. Earlier periods keep the rate they were priced with.` });
        },
        onError: (e) => toast({ title: "Could not set the arrangement", description: (e as Error).message, variant: "destructive" }),
      },
    );
  };

  return (
    <div className="space-y-2 text-xs">
      <div className="flex flex-wrap items-end gap-2">
        <Field label="Who pays the worker">
          <OpsSelect size="sm" value={type} onValueChange={(v) => setType(v as ArrangementType)}
            options={[
              { value: "direct_bes", label: "BES pays them directly" },
              { value: "managing_partner", label: "A managing partner pays them" },
            ]} />
        </Field>
        <Field label="Basis">
          <OpsSelect size="sm" value={basis} onValueChange={(v) => setBasis(v as CompensationBasis)} options={BASES} />
        </Field>
        <Field label="Worker earns">
          <Input type="number" step="0.01" value={agent} onChange={(e) => setAgent(e.target.value)}
            placeholder="80.00" className="h-7 w-24 text-xs" />
        </Field>
        {type === "managing_partner" && canSeeCost && (
          <Field label="BES pays">
            <Input type="number" step="0.01" value={cost} onChange={(e) => setCost(e.target.value)}
              placeholder="100.00" className="h-7 w-24 text-xs" />
          </Field>
        )}
        {type === "managing_partner" && (
          <Field label="Managing partner">
            <OpsSelect size="sm" value={partner} onValueChange={setPartner}
              options={(people.data ?? [])
                .filter((p) => p.userId !== userId && p.status === "active")
                .map((p) => ({ value: p.userId, label: p.name || p.email }))} />
          </Field>
        )}
        <Field label="Currency">
          <OpsSelect size="sm" value={currency} onValueChange={setCurrency}
            options={PAY_CURRENCIES.map((c) => ({ value: c, label: c }))} />
        </Field>
        <Field label="In force from">
          <Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="h-7 w-36 text-xs" />
        </Field>
      </div>

      <div className="flex flex-wrap items-end gap-2">
        <Field label="Why" wide>
          <Input value={reason} onChange={(e) => setReason(e.target.value)}
            placeholder="New agreement with the managing partner" className="h-7 w-full text-xs" />
        </Field>
        <Button size="sm" variant="outline" className="h-7 text-xs" disabled={!valid || open.isPending} onClick={save}>
          {open.isPending && <Loader2 className="mr-1 h-3 w-3 animate-spin" />} Set arrangement
        </Button>
      </div>

      {type === "managing_partner" && canSeeCost && Number.isFinite(margin) && agent && cost && (
        <p className="text-[11px] text-muted-foreground">
          Margin to the managing partner: {formatCentsIn(margin, currency)} per {basis === "per_cutoff" ? "cutoff" : basis.replace("ly", "")}.
          {margin < 0 && " BES cannot pay less than the worker receives."}
        </p>
      )}
      <p className="text-[11px] text-muted-foreground">
        Setting an arrangement closes the one before it on the previous day. Periods already priced keep the
        rate that was true then — a rate change is never backdated.
      </p>
    </div>
  );
}

const Field = ({ label, children, wide }: { label: string; children: React.ReactNode; wide?: boolean }) => (
  <label className={wide ? "min-w-[16rem] flex-1 text-muted-foreground" : "text-muted-foreground"}>
    {label}
    <div className="mt-0.5">{children}</div>
  </label>
);

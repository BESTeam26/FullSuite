/**
 * Invoices BES has raised against this partner.
 *
 * An invoice is a claim, not income. Its status follows the payment ledger —
 * a database trigger recomputes `amount_paid_cents` and the status whenever a
 * payment lands — so nothing on this screen can mark one paid.
 *
 * Void, never delete: an issued invoice is a thing that happened (rule 11).
 */
import { useState } from "react";
import { Loader2, Plus, Send, Ban } from "lucide-react";
import { ContentCard } from "@/components/dashboard/DivisionLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { OpsSelect } from "@/components/ui/ops-select";
import { Empty, Pill } from "@/components/agency/partner/partner-ui";
import { usePartnerBillingActions } from "@/lib/data/use-partner-billing";
import type { PartnerInvoice, NewInvoiceLine } from "@/lib/data/partner-billing";
import type { PartnerService } from "@/lib/data/partner-services";
import { formatMoney } from "@/lib/format-money";
import { formatDate } from "@/lib/format-date";

const money = (cents: number) => formatMoney(cents / 100);

const STATUS_LABEL: Record<string, string> = {
  draft: "Draft", scheduled: "Scheduled", sent: "Sent",
  partially_paid: "Partly paid", paid: "Paid", overdue: "Overdue",
  void: "Void", cancelled: "Cancelled",
};
const STATUS_TONE: Record<string, string> = {
  draft: "border-border bg-muted text-muted-foreground",
  scheduled: "border-blue-500/30 bg-blue-500/10 text-blue-700",
  sent: "border-blue-500/30 bg-blue-500/10 text-blue-700",
  partially_paid: "border-amber-500/40 bg-amber-500/10 text-amber-800",
  paid: "border-emerald-500/30 bg-emerald-500/10 text-emerald-700",
  overdue: "border-red-500/40 bg-red-500/10 text-red-800",
  void: "border-border bg-muted text-muted-foreground",
  cancelled: "border-border bg-muted text-muted-foreground",
};

export function PartnerInvoiceList({ groupId, services, invoices, loading, canManage }: {
  groupId: string;
  services: PartnerService[];
  invoices: PartnerInvoice[];
  loading: boolean;
  canManage: boolean;
  canRecordPayment: boolean;
}) {
  const actions = usePartnerBillingActions(groupId);
  const [creating, setCreating] = useState(false);
  const [voiding, setVoiding] = useState<string | null>(null);
  const [voidReason, setVoidReason] = useState("");

  return (
    <ContentCard
      title="Invoices"
      action={canManage && (
        <Button size="sm" variant="ghost" onClick={() => setCreating((v) => !v)}>
          <Plus className="mr-1.5 h-3.5 w-3.5" /> New invoice
        </Button>
      )}
    >
      {creating && canManage && (
        <InvoiceForm
          services={services}
          saving={actions.createInvoice.isPending}
          onCancel={() => setCreating(false)}
          onSave={async (v) => { await actions.createInvoice.mutateAsync(v); setCreating(false); }}
        />
      )}

      {loading ? (
        <p className="py-4 text-center text-sm text-muted-foreground">
          <Loader2 className="mr-2 inline h-4 w-4 animate-spin" /> Loading…
        </p>
      ) : invoices.length === 0 ? (
        <Empty title="No invoices yet"
          hint="BES owns the obligation; a payment provider only executes it. Raising the invoice here is what makes the money owed visible on the dashboard." />
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[38rem] text-left text-xs">
            <thead>
              <tr className="border-b border-border/60 text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                <th className="py-1.5 pr-2">Invoice</th>
                <th className="py-1.5 pr-2">Issued</th>
                <th className="py-1.5 pr-2">Due</th>
                <th className="py-1.5 pr-2 text-right">Total</th>
                <th className="py-1.5 pr-2 text-right">Paid</th>
                <th className="py-1.5 pr-2">Status</th>
                <th className="py-1.5" />
              </tr>
            </thead>
            <tbody className="divide-y divide-border/50">
              {invoices.map((i) => (
                <tr key={i.id} className="transition-colors hover:bg-muted/40">
                  <td className="py-1.5 pr-2 font-medium text-foreground">{i.invoiceNumber}</td>
                  <td className="py-1.5 pr-2 text-muted-foreground">{formatDate(i.issueDate)}</td>
                  <td className="py-1.5 pr-2 text-muted-foreground">{formatDate(i.dueDate)}</td>
                  <td className="py-1.5 pr-2 text-right tabular-nums text-foreground">{money(i.totalCents)}</td>
                  <td className="py-1.5 pr-2 text-right tabular-nums text-muted-foreground">{money(i.amountPaidCents)}</td>
                  <td className="py-1.5 pr-2">
                    <Pill tone={STATUS_TONE[i.status] ?? STATUS_TONE.draft}>
                      {STATUS_LABEL[i.status] ?? i.status}
                    </Pill>
                  </td>
                  <td className="py-1.5 text-right">
                    {canManage && i.status === "draft" && (
                      <Button size="sm" variant="ghost" className="h-6 px-2 text-[11px]"
                        onClick={() => actions.sendInvoice.mutate(i.id)}>
                        <Send className="mr-1 h-3 w-3" /> Mark sent
                      </Button>
                    )}
                    {canManage && !["void", "cancelled", "paid"].includes(i.status) && (
                      <Button size="sm" variant="ghost" className="h-6 px-2 text-[11px]"
                        onClick={() => { setVoiding(voiding === i.id ? null : i.id); setVoidReason(""); }}>
                        <Ban className="mr-1 h-3 w-3" /> Void
                      </Button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {voiding && canManage && (
        <div className="mt-2 flex flex-wrap items-end gap-2 rounded-lg border border-border bg-muted/30 p-3">
          <Input className="h-8 min-w-56 flex-1" value={voidReason} onChange={(e) => setVoidReason(e.target.value)}
            placeholder="Why is it being voided?" aria-label="Void reason" />
          <Button size="sm" variant="destructive" disabled={!voidReason.trim() || actions.voidInvoice.isPending}
            onClick={async () => { await actions.voidInvoice.mutateAsync({ id: voiding, reason: voidReason }); setVoiding(null); }}>
            Void invoice
          </Button>
          <Button size="sm" variant="ghost" onClick={() => setVoiding(null)}>Cancel</Button>
          <p className="w-full text-[11px] text-muted-foreground">
            The invoice stays on the record, marked void with this reason. Nothing is deleted.
          </p>
        </div>
      )}
    </ContentCard>
  );
}

function InvoiceForm({ services, saving, onSave, onCancel }: {
  services: PartnerService[];
  saving: boolean;
  onSave: (v: { dueDate: string; issueDate?: string; notes?: string; lines: NewInvoiceLine[] }) => void;
  onCancel: () => void;
}) {
  const today = new Date().toISOString().slice(0, 10);
  const inThirty = new Date(Date.now() + 30 * 86_400_000).toISOString().slice(0, 10);
  const [issueDate, setIssueDate] = useState(today);
  const [dueDate, setDueDate] = useState(inThirty);
  const [notes, setNotes] = useState("");
  const [lines, setLines] = useState<NewInvoiceLine[]>([
    { description: "", quantity: 1, unitAmountCents: 0, serviceId: null },
  ]);

  const update = (i: number, patch: Partial<NewInvoiceLine>) =>
    setLines((rows) => rows.map((r, n) => (n === i ? { ...r, ...patch } : r)));
  const total = lines.reduce((n, l) => n + Math.round((l.quantity ?? 1) * l.unitAmountCents), 0);

  return (
    <div className="mb-3 space-y-2 rounded-lg border border-border bg-muted/30 p-3">
      <div className="grid gap-2 sm:grid-cols-2">
        <label className="text-xs text-muted-foreground">
          Issued
          <Input type="date" value={issueDate} onChange={(e) => setIssueDate(e.target.value)} aria-label="Issue date" />
        </label>
        <label className="text-xs text-muted-foreground">
          Due
          <Input type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} aria-label="Due date" />
        </label>
      </div>

      {/* An invoice may combine services; each LINE still names the one that
          earned it, so revenue stays attributable to an engagement. */}
      {lines.map((l, i) => (
        <div key={i} className="grid gap-2 sm:grid-cols-[1fr_9rem_7rem_6rem]">
          <Input value={l.description} onChange={(e) => update(i, { description: e.target.value })}
            placeholder="What is being billed" aria-label={`Line ${i + 1} description`} />
          <OpsSelect aria-label={`Line ${i + 1} service`} size="field"
            value={l.serviceId ?? "__none__"}
            onValueChange={(v) => update(i, { serviceId: v === "__none__" ? null : v })}
            options={[{ value: "__none__", label: "No service" },
              ...services.map((s) => ({ value: s.id, label: s.name }))]} />
          <Input type="number" step="0.01" min="0"
            value={l.unitAmountCents === 0 ? "" : String(l.unitAmountCents / 100)}
            onChange={(e) => update(i, { unitAmountCents: Math.round(Number(e.target.value || 0) * 100) })}
            placeholder="Unit price" aria-label={`Line ${i + 1} unit price`} />
          <Input type="number" step="1" min="0" value={String(l.quantity ?? 1)}
            onChange={(e) => update(i, { quantity: Number(e.target.value || 0) })}
            placeholder="Qty" aria-label={`Line ${i + 1} quantity`} />
        </div>
      ))}
      <Button size="sm" variant="ghost" className="h-7 px-2 text-xs"
        onClick={() => setLines((r) => [...r, { description: "", quantity: 1, unitAmountCents: 0, serviceId: null }])}>
        <Plus className="mr-1 h-3 w-3" /> Add line
      </Button>

      <Textarea rows={2} value={notes} onChange={(e) => setNotes(e.target.value)}
        placeholder="Notes shown on the invoice" aria-label="Invoice notes" />
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-sm font-semibold text-foreground">Total {money(total)}</span>
        <Button size="sm" disabled={saving || total === 0 || lines.every((l) => !l.description.trim())}
          onClick={() => onSave({
            issueDate, dueDate, notes,
            lines: lines.filter((l) => l.description.trim()),
          })}>
          {saving && <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />} Create draft
        </Button>
        <Button size="sm" variant="ghost" onClick={onCancel}>Cancel</Button>
      </div>
      <p className="text-[11px] text-muted-foreground">
        Created as a draft. The invoice number comes from the database, so two people creating one
        at the same moment cannot land on the same number.
      </p>
    </div>
  );
}

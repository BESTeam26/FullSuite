/**
 * Record money that arrived.
 *
 * Everything recorded here is `source: manual` — somebody's word that a
 * payment landed, which is a different fact from a provider confirming a
 * transaction. The list labels it "manually recorded" rather than showing it
 * as verified, because a reconciliation later has to be able to tell them
 * apart (Dee, §23).
 *
 * PayPal Personal is on the provider list for exactly this reason: BES takes
 * money that way today, and no API confirms it. Recording it honestly beats
 * showing "PayPal connected" when nothing is.
 */
import { useState } from "react";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { OpsSelect } from "@/components/ui/ops-select";
import { usePartnerBillingActions } from "@/lib/data/use-partner-billing";
import type { PartnerInvoice } from "@/lib/data/partner-billing";
import type { PartnerService } from "@/lib/data/partner-services";
import { formatMoney } from "@/lib/format-money";

const PROVIDERS = [
  { value: "authorize_net", label: "Authorize.Net" },
  { value: "stripe", label: "Stripe" },
  { value: "paypal", label: "PayPal (business)" },
  { value: "paypal_personal", label: "PayPal Personal" },
  { value: "wise", label: "Wise" },
  { value: "ghl", label: "GHL invoice" },
  { value: "upwork", label: "Upwork" },
  { value: "bank_transfer", label: "Bank transfer" },
  { value: "other", label: "Other" },
];

export function RecordPaymentForm({ groupId, invoices, services, onDone }: {
  groupId: string;
  invoices: PartnerInvoice[];
  services: PartnerService[];
  onDone: () => void;
}) {
  const actions = usePartnerBillingActions(groupId);
  const [invoiceId, setInvoiceId] = useState("__none__");
  const [serviceId, setServiceId] = useState("__none__");
  const [provider, setProvider] = useState("authorize_net");
  const [amount, setAmount] = useState("");
  const [paidOn, setPaidOn] = useState(new Date().toISOString().slice(0, 10));
  const [reference, setReference] = useState("");

  const open = invoices.filter((i) => !["void", "cancelled", "paid"].includes(i.status));
  const chosen = open.find((i) => i.id === invoiceId);
  const outstanding = chosen ? chosen.totalCents - chosen.amountPaidCents : null;

  return (
    <div className="mb-3 space-y-2 rounded-lg border border-border bg-muted/30 p-3">
      <div className="grid gap-2 sm:grid-cols-2">
        <OpsSelect aria-label="Invoice" size="field" value={invoiceId}
          onValueChange={(v) => {
            setInvoiceId(v);
            const inv = open.find((i) => i.id === v);
            if (inv) setAmount(String((inv.totalCents - inv.amountPaidCents) / 100));
          }}
          options={[{ value: "__none__", label: "Not against an invoice" },
            ...open.map((i) => ({
              value: i.id,
              label: `${i.invoiceNumber} — ${formatMoney((i.totalCents - i.amountPaidCents) / 100)} outstanding`,
            }))]} />
        <OpsSelect aria-label="Service" size="field" value={serviceId} onValueChange={setServiceId}
          options={[{ value: "__none__", label: "No specific service" },
            ...services.map((s) => ({ value: s.id, label: s.name }))]} />
        <OpsSelect aria-label="Provider" size="field" value={provider} onValueChange={setProvider}
          options={PROVIDERS} />
        <Input type="number" step="0.01" min="0" value={amount} onChange={(e) => setAmount(e.target.value)}
          placeholder="Amount received" aria-label="Amount" />
        <label className="text-xs text-muted-foreground">
          Received on
          <Input type="date" value={paidOn} onChange={(e) => setPaidOn(e.target.value)} aria-label="Paid on" />
        </label>
        <Input value={reference} onChange={(e) => setReference(e.target.value)}
          placeholder="Provider reference (optional)" aria-label="Provider transaction reference" />
      </div>

      {outstanding !== null && amount.trim() !== "" && Math.round(Number(amount) * 100) < outstanding && (
        <p className="text-xs text-muted-foreground">
          Less than the {formatMoney(outstanding / 100)} outstanding — the invoice will show as
          partly paid, and the rest stays collectible.
        </p>
      )}

      <div className="flex flex-wrap gap-2">
        <Button size="sm" disabled={actions.recordPayment.isPending || amount.trim() === ""}
          onClick={async () => {
            await actions.recordPayment.mutateAsync({
              invoiceId: invoiceId === "__none__" ? null : invoiceId,
              serviceId: serviceId === "__none__" ? null : serviceId,
              provider, providerTransactionId: reference || null,
              amountCents: Math.round(Number(amount) * 100), paidOn,
            });
            onDone();
          }}>
          {actions.recordPayment.isPending && <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />}
          Record payment
        </Button>
        <Button size="sm" variant="ghost" onClick={onDone}>Cancel</Button>
      </div>
      <p className="text-[11px] text-muted-foreground">
        Saved as <strong>manually recorded</strong>. It counts as collected from the date entered,
        and stays distinguishable from a payment a provider confirmed.
      </p>
    </div>
  );
}

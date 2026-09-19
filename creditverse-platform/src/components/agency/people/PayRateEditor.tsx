/**
 * The pay rate — protected financial information, rendered only inside the
 * Compensation tab, which itself renders only for payroll capability. This
 * is the single-rate model that the Compensation Arrangement proposal
 * (ARCHITECTURE_PROPOSAL_COMPENSATION_ARRANGEMENTS.md) will replace; until
 * then it is the one place a rate is set.
 */
import { useState } from "react";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { OpsSelect } from "@/components/ui/ops-select";
import { usePayRateBreakdown, useSetPayRate } from "@/lib/data/use-people";
import { PAY_CURRENCIES } from "@/lib/data/people-management";
import { formatCentsIn } from "@/lib/format-money";
import { useToast } from "@/hooks/use-toast";
import { PAY_RATE_TYPES, describeRateBasis, type PayRateType } from "@/lib/payroll/rate-label";

export function PayRateEditor({ userId, rate, onSaved }: {
  userId: string;
  rate?: { rateType: PayRateType; rateCents: number; currency: string };
  onSaved?: () => void;
}) {
  const { toast } = useToast();
  const setRate = useSetPayRate();
  const [rateType, setRateType] = useState<PayRateType>(rate?.rateType ?? "hourly");
  const [amount, setAmount] = useState(rate ? String(rate.rateCents / 100) : "");
  const [currency, setCurrency] = useState(rate?.currency ?? "USD");

  const saveRate = () => {
    const cents = Math.round(Number(amount) * 100);
    if (!Number.isFinite(cents) || cents < 0) return;
    setRate.mutate(
      { userId, rateType, rateCents: cents, currency },
      {
        onSuccess: () => { toast({ title: "Rate set", description: "Payslips snapshot the rate in force at each cutoff's end." }); onSaved?.(); },
        onError: (e) => toast({ title: "Could not set the rate", description: (e as Error).message, variant: "destructive" }),
      },
    );
  };

  return (
    <div className="flex flex-wrap items-end gap-2 text-xs">
      <label className="text-muted-foreground">Rate type
        <select value={rateType} onChange={(e) => setRateType(e.target.value as PayRateType)}
          className="mt-0.5 block h-7 rounded-lg border border-border bg-background px-2 text-xs text-foreground">
          {PAY_RATE_TYPES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
        </select>
      </label>
      <label className="text-muted-foreground">Amount
        <Input type="number" step="0.01" value={amount} onChange={(e) => setAmount(e.target.value)}
          placeholder="15.00" className="mt-0.5 h-7 w-24 text-xs" />
      </label>
      {/* The person's OWN currency — a Manila processor in pesos, a US
          contractor in dollars. Payroll converts to the payout currency at
          the rate recorded in Finance → Payroll, and each payslip freezes
          the rate it used. */}
      <label className="text-muted-foreground">Currency
        <div className="mt-0.5">
          <OpsSelect size="sm" value={currency} onValueChange={setCurrency}
            options={PAY_CURRENCIES.map((c) => ({ value: c, label: c }))} />
        </div>
      </label>
      <Button size="sm" variant="outline" className="h-7 text-xs" disabled={setRate.isPending || !amount} onClick={saveRate}>
        {setRate.isPending && <Loader2 className="mr-1 h-3 w-3 animate-spin" />} Save rate
      </Button>
      <span className="text-[10px] text-muted-foreground">
        {rateType === "monthly"
          ? "A monthly package pays half each cutoff; the daily and hourly rate are derived from the schedule (Mon–Fri → 261 paid days a year)."
          : "Hourly pays work + approved paid leave; fixed pays the amount each cutoff."}
      </span>
    </div>
  );
}

/**
 * What the rate means per day and per hour — the database's derivation
 * (`pay_rate_breakdown`), shown, never recomputed here. Dee, 2026-09-19: "I
 * only calculate their hourly rate manually."
 */
export function RateBasisLine({ userId, rateType, currency }: { userId: string; rateType: PayRateType; currency: string }) {
  const basis = usePayRateBreakdown(rateType === "per_cutoff" ? null : userId);
  const line = describeRateBasis(rateType, basis.data, (c) => formatCentsIn(c, currency));
  if (!line) return null;
  return <span className="block text-[11px] text-muted-foreground">{line}</span>;
}

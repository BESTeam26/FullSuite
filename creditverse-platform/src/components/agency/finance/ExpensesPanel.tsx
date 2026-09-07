/**
 * What BES pays out, and the bills that arrive every month on their own.
 *
 * The recurring templates exist so Vercel, Supabase and Anthropic are not
 * retyped twelve times a year — "generate this month" creates the expected
 * bills once, and a person only confirms what actually left the bank.
 *
 * Marking one paid asks for the DATE, not a tick. A tick loses the one fact
 * the month's net cash depends on: when the money moved.
 */
import { useState } from "react";
import { Check, Loader2, Plus, RefreshCw } from "lucide-react";
import { ContentCard } from "@/components/dashboard/DivisionLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { OpsSelect } from "@/components/ui/ops-select";
import { Empty, Pill } from "@/components/agency/partner/partner-ui";
import { useExpenseActions, useExpenseTemplates, useExpenses } from "@/lib/data/use-agency-expenses";
import { useAgencyPermissions } from "@/lib/data/agency-permissions";
import type { Month } from "@/lib/partners/billing-engine";
import { formatMoney } from "@/lib/format-money";
import { formatDate } from "@/lib/format-date";

const money = (cents: number) => formatMoney(cents / 100);
const STATUS_TONE: Record<string, string> = {
  paid: "border-emerald-500/30 bg-emerald-500/10 text-emerald-700",
  due: "border-amber-500/40 bg-amber-500/10 text-amber-800",
  overdue: "border-red-500/40 bg-red-500/10 text-red-800",
  upcoming: "border-border bg-muted text-muted-foreground",
  void: "border-border bg-muted text-muted-foreground",
};

export function ExpensesPanel({ month }: { month: Month }) {
  const perms = useAgencyPermissions();
  const expenses = useExpenses(month.year, month.month);
  const templates = useExpenseTemplates();
  const actions = useExpenseActions();
  const canManage = perms.can("expenses.manage");
  const [adding, setAdding] = useState(false);
  const [paying, setPaying] = useState<string | null>(null);
  const [paidOn, setPaidOn] = useState(new Date().toISOString().slice(0, 10));
  const [generated, setGenerated] = useState<number | null>(null);

  const rows = expenses.data ?? [];

  return (
    <div className="space-y-3">
      <ContentCard
        title="Expenses"
        action={canManage && (
          <div className="flex flex-wrap items-center gap-2">
            <Button size="sm" variant="ghost"
              disabled={actions.generate.isPending}
              onClick={async () => {
                setGenerated(await actions.generate.mutateAsync({ year: month.year, month: month.month }));
              }}>
              {actions.generate.isPending
                ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                : <RefreshCw className="mr-1.5 h-3.5 w-3.5" />}
              Generate recurring
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setAdding((v) => !v)}>
              <Plus className="mr-1.5 h-3.5 w-3.5" /> Add expense
            </Button>
          </div>
        )}
      >
        {generated !== null && (
          <p className="mb-2 rounded-lg border border-emerald-500/40 bg-emerald-500/10 px-3 py-2 text-xs text-emerald-900">
            {generated === 0
              ? "Nothing new — this month's recurring bills already exist. Running it again does not duplicate them."
              : `${generated} recurring bill${generated === 1 ? "" : "s"} created for this month.`}
          </p>
        )}
        {adding && canManage && (
          <ExpenseForm saving={actions.save.isPending} onCancel={() => setAdding(false)}
            onSave={async (v) => { await actions.save.mutateAsync(v); setAdding(false); }} />
        )}

        {expenses.isLoading ? (
          <p className="py-6 text-center text-sm text-muted-foreground">
            <Loader2 className="mr-2 inline h-4 w-4 animate-spin" /> Loading…
          </p>
        ) : rows.length === 0 ? (
          <Empty title="Nothing recorded for this month"
            hint="Set up the bills that arrive every month as recurring templates below, then press Generate — they will not need retyping again." />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[38rem] text-left text-xs">
              <thead>
                <tr className="border-b border-border/60 text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                  <th className="py-1.5 pr-2">Vendor</th>
                  <th className="py-1.5 pr-2">Due</th>
                  <th className="py-1.5 pr-2">Paid</th>
                  <th className="py-1.5 pr-2 text-right">Amount</th>
                  <th className="py-1.5 pr-2">Status</th>
                  <th className="py-1.5" />
                </tr>
              </thead>
              <tbody className="divide-y divide-border/50">
                {rows.map((e) => (
                  <tr key={e.id} className="transition-colors hover:bg-muted/40">
                    <td className="py-1.5 pr-2">
                      <span className="font-medium text-foreground">{e.vendor}</span>
                      {e.description && <span className="block text-[11px] text-muted-foreground">{e.description}</span>}
                    </td>
                    <td className="py-1.5 pr-2 text-muted-foreground">{formatDate(e.dueDate)}</td>
                    <td className="py-1.5 pr-2 text-muted-foreground">{formatDate(e.paidOn)}</td>
                    <td className="py-1.5 pr-2 text-right tabular-nums text-foreground">{money(e.amountCents)}</td>
                    <td className="py-1.5 pr-2">
                      <Pill tone={STATUS_TONE[e.status] ?? STATUS_TONE.upcoming}>{e.status}</Pill>
                    </td>
                    <td className="py-1.5 text-right">
                      {canManage && !e.paidOn && e.status !== "void" && (
                        paying === e.id ? (
                          <span className="flex items-center justify-end gap-1">
                            <Input className="h-7 w-32" type="date" value={paidOn}
                              onChange={(ev) => setPaidOn(ev.target.value)} aria-label="Date paid" />
                            <Button size="sm" className="h-7 px-2 text-[11px]"
                              disabled={actions.markPaid.isPending}
                              onClick={async () => {
                                await actions.markPaid.mutateAsync({ id: e.id, paidOn });
                                setPaying(null);
                              }}>
                              <Check className="h-3 w-3" />
                            </Button>
                          </span>
                        ) : (
                          <Button size="sm" variant="ghost" className="h-6 px-2 text-[11px]"
                            onClick={() => setPaying(e.id)}>
                            Mark paid
                          </Button>
                        )
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </ContentCard>

      <ContentCard title="Bills that repeat">
        {(templates.data ?? []).length === 0 ? (
          <p className="py-4 text-sm text-muted-foreground">
            No recurring bills set up. Adding one here means it appears every month by itself.
          </p>
        ) : (
          <ul className="divide-y divide-border/50">
            {(templates.data ?? []).map((t) => (
              <li key={t.id} className="flex items-center justify-between gap-2 py-1.5 text-sm">
                <span>
                  <span className="font-medium text-foreground">{t.vendor}</span>
                  <span className="ml-2 text-xs text-muted-foreground">
                    {money(t.amountCents)} · {t.cadence}{t.dueDay ? ` · day ${t.dueDay}` : ""}
                  </span>
                </span>
                {!t.active && <Pill tone="border-border bg-muted text-muted-foreground">inactive</Pill>}
              </li>
            ))}
          </ul>
        )}
        {canManage && (
          <TemplateForm saving={actions.saveTemplate.isPending}
            onSave={(v) => actions.saveTemplate.mutate(v)} />
        )}
      </ContentCard>
    </div>
  );
}

function ExpenseForm({ saving, onSave, onCancel }: {
  saving: boolean;
  onSave: (v: {
    vendor: string; description?: string; category?: string;
    dueDate?: string | null; paidOn?: string | null; amountCents: number;
    paymentMethod?: string | null; transactionType?: string | null;
    invoiceUrl?: string | null; receiptUrl?: string | null;
  }) => void;
  onCancel: () => void;
}) {
  const [vendor, setVendor] = useState("");
  const [description, setDescription] = useState("");
  const [category, setCategory] = useState("");
  const [dueDate, setDueDate] = useState(new Date().toISOString().slice(0, 10));
  const [paidOn, setPaidOn] = useState("");
  const [amount, setAmount] = useState("");
  const [method, setMethod] = useState("");
  const [txType, setTxType] = useState("business");
  const [invoiceUrl, setInvoiceUrl] = useState("");

  return (
    <div className="mb-3 space-y-2 rounded-lg border border-border bg-muted/30 p-3">
      <div className="grid gap-2 sm:grid-cols-3">
        <Input value={vendor} onChange={(e) => setVendor(e.target.value)} placeholder="Vendor" aria-label="Vendor" />
        <Input value={description} onChange={(e) => setDescription(e.target.value)} placeholder="What it is for" aria-label="Description" />
        <Input value={category} onChange={(e) => setCategory(e.target.value)} placeholder="Category" aria-label="Category" />
        <Input type="number" step="0.01" min="0" value={amount} onChange={(e) => setAmount(e.target.value)}
          placeholder="Amount" aria-label="Amount" />
        <label className="text-xs text-muted-foreground">
          Due
          <Input type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} aria-label="Due date" />
        </label>
        <label className="text-xs text-muted-foreground">
          Paid (leave blank if not yet)
          <Input type="date" value={paidOn} onChange={(e) => setPaidOn(e.target.value)} aria-label="Date paid" />
        </label>
        <Input value={method} onChange={(e) => setMethod(e.target.value)} placeholder="Payment method" aria-label="Payment method" />
        <OpsSelect aria-label="Transaction type" size="field" value={txType} onValueChange={setTxType}
          options={[{ value: "business", label: "Business" }, { value: "personal", label: "Personal" }]} />
        <Input value={invoiceUrl} onChange={(e) => setInvoiceUrl(e.target.value)} placeholder="Invoice link" aria-label="Invoice link" />
      </div>
      <div className="flex gap-2">
        <Button size="sm" disabled={saving || !vendor.trim() || amount.trim() === ""}
          onClick={() => onSave({
            vendor, description, category,
            dueDate: dueDate || null, paidOn: paidOn || null,
            amountCents: Math.round(Number(amount) * 100),
            paymentMethod: method || null, transactionType: txType,
            invoiceUrl: invoiceUrl || null,
          })}>
          {saving && <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />} Save expense
        </Button>
        <Button size="sm" variant="ghost" onClick={onCancel}>Cancel</Button>
      </div>
    </div>
  );
}

function TemplateForm({ saving, onSave }: {
  saving: boolean;
  onSave: (v: { vendor: string; amountCents: number; cadence?: string; dueDay?: number | null; category?: string }) => void;
}) {
  const [vendor, setVendor] = useState("");
  const [amount, setAmount] = useState("");
  const [cadence, setCadence] = useState("monthly");
  const [dueDay, setDueDay] = useState("1");
  const [category, setCategory] = useState("");

  return (
    <div className="mt-3 flex flex-wrap items-end gap-2 rounded-lg border border-border bg-muted/30 p-3">
      <Input className="h-8 w-40" value={vendor} onChange={(e) => setVendor(e.target.value)}
        placeholder="Vercel, Supabase…" aria-label="Recurring vendor" />
      <Input className="h-8 w-28" type="number" step="0.01" min="0" value={amount}
        onChange={(e) => setAmount(e.target.value)} placeholder="Amount" aria-label="Recurring amount" />
      <OpsSelect aria-label="Cadence" size="sm" value={cadence} onValueChange={setCadence}
        options={[
          { value: "monthly", label: "Monthly" }, { value: "weekly", label: "Weekly" },
          { value: "quarterly", label: "Quarterly" }, { value: "annual", label: "Annual" },
        ]} />
      <Input className="h-8 w-20" type="number" min="1" max="31" value={dueDay}
        onChange={(e) => setDueDay(e.target.value)} placeholder="Day" aria-label="Due day of month" />
      <Input className="h-8 w-32" value={category} onChange={(e) => setCategory(e.target.value)}
        placeholder="Category" aria-label="Recurring category" />
      <Button size="sm" disabled={saving || !vendor.trim() || amount.trim() === ""}
        onClick={() => onSave({
          vendor, amountCents: Math.round(Number(amount) * 100), cadence,
          dueDay: dueDay.trim() === "" ? null : Number(dueDay), category,
        })}>
        {saving && <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />} Add repeating bill
      </Button>
      <p className="w-full text-[11px] text-muted-foreground">
        Only monthly bills are generated today. Weekly, quarterly and annual can be recorded and are
        generated by hand until the scheduler is built.
      </p>
    </div>
  );
}

/**
 * Payout Account — where payroll pays this person. Rendered only inside the
 * Compensation tab (payroll capability). payroll.manage sees and edits the
 * full number; payroll.view sees the last four digits.
 */
import { useEffect, useState } from "react";
import { Landmark, Loader2, Pencil } from "lucide-react";
import { ContentCard } from "@/components/dashboard/DivisionLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { OpsSelect } from "@/components/ui/ops-select";
import { useToast } from "@/hooks/use-toast";
import { useAgencyPermissions } from "@/lib/data/agency-permissions";
import { PAYOUT_METHODS, payoutMethodLabel, useMemberPayoutAccount, useSaveMemberPayoutAccount, type MemberPayoutAccountEdits, type PayoutMethod } from "@/lib/data/member-payout-accounts";
import { maskAccountNumber } from "@/lib/payroll/mask-account";

const EMPTY: MemberPayoutAccountEdits = { method: "gcash", provider: null, accountName: null, accountNumber: null, notificationEmail: null, notes: null };

export function PayoutAccountCard({ userId }: { userId: string }) {
  const { toast } = useToast();
  const perms = useAgencyPermissions();
  const canManage = perms.can("payroll.manage");
  const account = useMemberPayoutAccount(userId);
  const save = useSaveMemberPayoutAccount(userId);
  const [editing, setEditing] = useState(false);
  const [edits, setEdits] = useState<MemberPayoutAccountEdits>(EMPTY);
  useEffect(() => { if (account.data) setEdits({ ...EMPTY, ...account.data }); }, [account.data]);

  const a = account.data;
  const set = <K extends keyof MemberPayoutAccountEdits>(k: K, v: MemberPayoutAccountEdits[K]) => setEdits((p) => ({ ...p, [k]: v }));
  const row = (label: string, value: React.ReactNode) => (
    <div key={label} className="flex items-start justify-between gap-4 py-1.5 text-xs">
      <dt className="shrink-0 text-muted-foreground">{label}</dt><dd className="text-right font-medium text-foreground">{value ?? "—"}</dd>
    </div>
  );
  const field = (label: string, k: Exclude<keyof MemberPayoutAccountEdits, "method">) => (
    <label key={k} className="text-xs"><span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">{label}</span>
      <Input value={edits[k] ?? ""} onChange={(e) => set(k, e.target.value)} className="mt-0.5 h-8 text-xs" /></label>
  );

  return (
    <ContentCard title={<span className="flex items-center gap-2"><Landmark className="h-4 w-4 text-muted-foreground" /> Payout Account</span>}>
      {account.isLoading ? (
        <p className="py-4 text-xs text-muted-foreground"><Loader2 className="mr-1.5 inline h-3 w-3 animate-spin" /> Loading…</p>
      ) : editing ? (
        <form className="grid gap-3 sm:grid-cols-2" onSubmit={(e) => {
          e.preventDefault();
          save.mutate(edits, {
            onSuccess: () => { setEditing(false); toast({ title: "Payout account saved" }); },
            onError: (err) => toast({ title: "Could not save", description: (err as Error).message, variant: "destructive" }),
          });
        }}>
          <label className="text-xs"><span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Method</span>
            <div className="mt-0.5"><OpsSelect size="field" value={edits.method} onValueChange={(v) => set("method", v as PayoutMethod)}
              options={PAYOUT_METHODS.map((m) => ({ value: m.value, label: m.label }))} /></div></label>
          {field("Provider (bank / e-wallet)", "provider")}
          {field("Account name", "accountName")}
          {field("Account number", "accountNumber")}
          {field("Payment notification email", "notificationEmail")}
          {field("Notes", "notes")}
          <div className="flex gap-2 sm:col-span-2">
            <Button type="submit" size="sm" disabled={save.isPending}>{save.isPending && <Loader2 className="mr-1 h-3 w-3 animate-spin" />} Save</Button>
            <Button type="button" size="sm" variant="ghost" onClick={() => setEditing(false)}>Cancel</Button>
          </div>
        </form>
      ) : (
        <>
          {a ? (
            <dl className="divide-y divide-border/60">
              {row("Method", payoutMethodLabel(a.method))}
              {row("Provider", a.provider)}
              {row("Account name", a.accountName)}
              {row("Account number", canManage ? a.accountNumber : maskAccountNumber(a.accountNumber))}
              {row("Notification email", a.notificationEmail)}
              {a.notes && row("Notes", a.notes)}
            </dl>
          ) : <p className="py-2 text-xs text-muted-foreground">No payout account on file — payroll has nowhere to send this person's pay.</p>}
          {canManage && <Button size="sm" variant="outline" className="mt-3 h-7 text-xs" onClick={() => setEditing(true)}><Pencil className="mr-1 h-3 w-3" aria-hidden /> {a ? "Edit account" : "Add account"}</Button>}
        </>
      )}
    </ContentCard>
  );
}

/**
 * Settings › AI usage (organization) and BES HQ › AI Credits (per organization).
 * Balance, credits used this cycle by feature, the ledger, auto-recharge.
 * Customers see credits only; BES staff also see tokens, provider cost and
 * margin, and can grant credits (purchase · refund · adjustment) — the
 * database function decides and audits. Until the Anthropic key and payment
 * connection exist, AI features are paused and purchases are recorded by BES.
 */
import { useMemo, useState } from "react";
import { Coins, Loader2, Plus, Sparkles } from "lucide-react";
import { ChartCard } from "@/components/dashboard/ops/ChartCard";
import { HorizontalBars } from "@/components/dashboard/ops/HorizontalBars";
import { KpiTile } from "@/components/dashboard/ops/KpiTile";
import { OpsSelect } from "@/components/ui/ops-select";
import { Switch } from "@/components/ui/switch";
import { SectionCard } from "@/components/settings/shared";
import { useAuth } from "@/lib/auth/auth-context";
import { errorMessage } from "@/lib/data/error-message";
import { grantAiCredits, saveRechargeSettings } from "@/lib/data/ai-credits";
import { useAiCredits, useInvalidateAiCredits } from "@/lib/data/use-ai-credits";
import { formatDate } from "@/lib/format-date";

const KIND_LABEL: Record<string, string> = { purchase: "Purchase", auto_recharge: "Auto-recharge", usage: "Usage", adjustment: "Adjustment", refund: "Refund" };
const credits = (n: number) => `${n.toLocaleString("en-US", { maximumFractionDigits: 2 })} credits`;

export function AiUsageSection({ organizationId, canEdit }: { organizationId: string; canEdit: boolean }) {
  const auth = useAuth();
  const since = useMemo(() => { const d = new Date(); return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1)).toISOString(); }, []);
  const q = useAiCredits(organizationId, since);
  const invalidate = useInvalidateAiCredits();
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [grant, setGrant] = useState({ credits: "", kind: "purchase" as "purchase" | "refund" | "adjustment", reference: "" });
  const d = q.data;
  const isBes = auth.isAgencyStaff;
  const usedThisCycle = useMemo(() => (d?.usage ?? []).reduce((s, u) => s + u.creditsCharged, 0), [d]);
  const byFeature = useMemo(() => {
    const m = new Map<string, number>();
    for (const u of d?.usage ?? []) m.set(u.featureKey, (m.get(u.featureKey) ?? 0) + u.creditsCharged);
    return [...m.entries()].map(([k, v]) => ({ label: d?.features.find((f) => f.key === k)?.label ?? k, value: Math.round(v) })).sort((a, b) => b.value - a.value);
  }, [d]);
  const providerCents = useMemo(() => (d?.usage ?? []).reduce((s, u) => s + u.providerCostCents, 0), [d]);

  const run = async (key: string, fn: () => Promise<void>, fallback: string) => {
    setBusy(key); setError(null);
    try { await fn(); invalidate(); } catch (e) { setError(errorMessage(e, fallback)); } finally { setBusy(null); }
  };
  const recharge = d?.recharge ?? { enabled: false, threshold: 500, packUsd: 25 };

  return (
    <div className="space-y-4">
      <SectionCard icon={Sparkles} title="AI usage" description="AI features draw on prepaid BES AI Credits. Access comes from your plan; use is metered per call. When the balance reaches zero, AI features pause — nothing else stops.">
        {q.isLoading && <p className="inline-flex items-center gap-1 text-xs text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" /> Loading…</p>}
        {q.error && <p role="alert" className="text-xs text-status-danger">Could not load AI usage.</p>}
        {d && (
          <>
            <div className="grid gap-3 sm:grid-cols-3">
              <KpiTile label="Credit balance" value={d.balance.toLocaleString("en-US", { maximumFractionDigits: 0 })} icon={Coins} tone={d.balance > 0 ? "green" : "red"} hint={d.balance > 0 ? "AI features available" : "AI features paused"} attention={d.balance <= 0} />
              <KpiTile label="Used this month" value={Math.round(usedThisCycle).toLocaleString("en-US")} icon={Sparkles} tone="purple" hint={`${d.usage.length} call${d.usage.length === 1 ? "" : "s"}`} />
              {isBes ? <KpiTile label="Provider cost this month" value={`$${(providerCents / 100).toFixed(2)}`} icon={Coins} tone="slate" hint={usedThisCycle > 0 ? `Margin ${Math.round(((usedThisCycle / 100 - providerCents / 100) / Math.max(0.01, usedThisCycle / 100)) * 100)}%` : "BES-internal"} /> : <KpiTile label="Auto-recharge" value={recharge.enabled ? `$${recharge.packUsd} pack` : "Off"} icon={Coins} tone="blue" hint={recharge.enabled ? `When balance ≤ ${recharge.threshold}` : "Enable below"} />}
            </div>
            <div className="mt-4 grid gap-4 lg:grid-cols-2">
              <ChartCard title="Credits used by feature (this month)"><HorizontalBars data={byFeature} tone="purple" unit="Credits" emptyText="No AI use this month." /></ChartCard>
              <ChartCard title="Auto-recharge">
                <div className="space-y-3 text-xs">
                  <label className="flex items-center gap-3 text-foreground"><Switch checked={recharge.enabled} disabled={!canEdit || busy !== null} onCheckedChange={(v) => void run("recharge", () => saveRechargeSettings(organizationId, { ...recharge, enabled: v }, auth.user!.id), "Could not save auto-recharge.")} aria-label="Auto-recharge" /> Recharge automatically when the balance runs low</label>
                  <div className="grid gap-2 sm:grid-cols-2">
                    <label className="block"><span className="mb-0.5 block text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Threshold (credits)</span><input type="number" min="0" defaultValue={recharge.threshold} disabled={!canEdit} onBlur={(e) => void run("threshold", () => saveRechargeSettings(organizationId, { ...recharge, threshold: Number(e.target.value || 0) }, auth.user!.id), "Could not save the threshold.")} className="w-full rounded-lg border border-border bg-background px-2 py-1.5 text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-primary" /></label>
                    <label className="block"><span className="mb-0.5 block text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Pack</span><OpsSelect value={String(recharge.packUsd)} disabled={!canEdit} onValueChange={(v) => void run("pack", () => saveRechargeSettings(organizationId, { ...recharge, packUsd: Number(v) }, auth.user!.id), "Could not save the pack.")} options={[10, 25, 50, 100].map((p) => ({ value: String(p), label: `$${p}` }))} aria-label="Recharge pack" /></label>
                  </div>
                  <p className="text-[10px] text-muted-foreground">Automatic charging arrives with the payment connection; until then BES records purchases for you.</p>
                </div>
              </ChartCard>
            </div>
            {isBes && (
              <form className="mt-4 flex flex-wrap items-end gap-2 rounded-xl border border-border bg-background p-3" onSubmit={(e) => { e.preventDefault(); if (!grant.credits) return; void run("grant", () => grantAiCredits(organizationId, Number(grant.credits), grant.kind, grant.reference.trim() || null), "Could not grant credits.").then(() => setGrant({ credits: "", kind: "purchase", reference: "" })); }}>
                <label className="block"><span className="mb-0.5 block text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Credits (± for adjustment)</span><input type="number" step="0.01" value={grant.credits} onChange={(e) => setGrant((g) => ({ ...g, credits: e.target.value }))} className="w-40 rounded-lg border border-border bg-card px-2 py-1.5 text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-primary" required /></label>
                <label className="block"><span className="mb-0.5 block text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Kind</span><OpsSelect value={grant.kind} onValueChange={(v) => setGrant((g) => ({ ...g, kind: v as typeof g.kind }))} options={[{ value: "purchase", label: "Purchase" }, { value: "refund", label: "Refund" }, { value: "adjustment", label: "Adjustment" }]} aria-label="Ledger kind" /></label>
                <label className="block min-w-48 flex-1"><span className="mb-0.5 block text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Reference</span><input value={grant.reference} onChange={(e) => setGrant((g) => ({ ...g, reference: e.target.value }))} placeholder="Payment reference or reason" className="w-full rounded-lg border border-border bg-card px-2 py-1.5 text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-primary" /></label>
                <button type="submit" disabled={busy !== null} className="inline-flex items-center gap-1 rounded-lg bg-primary px-3 py-1.5 text-xs font-bold text-primary-foreground hover:bg-primary/90 disabled:opacity-60">{busy === "grant" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Plus className="h-3.5 w-3.5" />} Grant credits</button>
              </form>
            )}
            <div className="mt-4">
              <p className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">Ledger</p>
              {d.ledger.length === 0 ? <p className="mt-1 text-xs text-muted-foreground">No credit movements yet.</p> : (
                <ul className="mt-1 divide-y divide-border/60">
                  {d.ledger.slice(0, 30).map((l) => <li key={l.id} className="flex items-center justify-between py-1.5 text-xs"><span className="text-foreground">{KIND_LABEL[l.kind] ?? l.kind}{l.reference && <span className="text-muted-foreground"> · {l.reference}</span>}</span><span className={l.deltaCredits >= 0 ? "font-semibold text-emerald-700" : "font-semibold text-foreground"}>{l.deltaCredits >= 0 ? "+" : ""}{credits(l.deltaCredits)} <span className="font-normal text-muted-foreground">· {formatDate(l.createdAt)}</span></span></li>)}
                </ul>
              )}
            </div>
          </>
        )}
        {error && <p role="alert" className="mt-2 text-xs text-status-danger">{error}</p>}
      </SectionCard>
    </div>
  );
}

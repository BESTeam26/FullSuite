/**
 * Plan choice on the public sign-up form. Options come from the `plans` table
 * (data, not code); products per plan are shown so nobody picks blind. No
 * prices are shown because none are recorded yet.
 */
import { useQuery } from "@tanstack/react-query";
import { fetchPublicPlans } from "@/lib/data/plans";
import { PRODUCT_LABELS, type ProductKey } from "@/lib/bes-domain";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";

export function PlanPicker({ value, onChange }: { value: string; onChange: (key: string) => void }) {
  const q = useQuery({ queryKey: ["plans", "public"], queryFn: fetchPublicPlans, staleTime: 5 * 60_000 });
  if (q.isLoading) return <p className="text-xs text-white/50">Loading plans…</p>;
  if (q.error) return <p className="text-xs text-red-300">Plans could not be loaded: {(q.error as Error).message}</p>;
  const plans = q.data ?? [];
  if (plans.length === 0) return <p className="text-xs text-white/50">No plans are open for sign-up right now.</p>;
  return (
    <div className="space-y-1.5">
      <Label className="text-white/80">Plan</Label>
      <div role="radiogroup" aria-label="Plan" className="grid gap-1.5">
        {plans.map((p) => (
          <button
            key={p.key}
            type="button"
            role="radio"
            aria-checked={value === p.key}
            onClick={() => onChange(p.key)}
            className={cn(
              "rounded-lg border px-3 py-2 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
              value === p.key ? "border-emerald-400 bg-emerald-500/15" : "border-white/10 bg-white/5 hover:bg-white/10",
            )}
          >
            <span className="block text-sm font-medium text-white">{p.label}</span>
            <span className="block text-[11px] text-white/60">
              {p.products.map((k) => PRODUCT_LABELS[k as ProductKey] ?? k).join(" · ")} · {p.trialDays}-day trial
            </span>
          </button>
        ))}
      </div>
    </div>
  );
}

import {
  GitFork,
  ArrowRight,
  AlertTriangle,
  ScanSearch,
  Scale,
  ShieldCheck,
} from "lucide-react";
import { useDiy } from "@/lib/diy/diy-context";
import type { ClassifiedItem } from "@/lib/credit-classification";

export const providers = [
  "IdentityIQ",
  "SmartCredit",
  "MyScoreIQ",
  "PrivacyGuard",
  "3Scores",
  "MyFreeScoreNow",
];

export const evidenceTypes = [
  "Bank statement",
  "Creditor statement",
  "Payment confirmation",
  "Settlement letter",
  "Identity theft report (FTC)",
  "Police report",
  "Court document",
  "Bankruptcy schedule",
  "Proof of address",
  "Correspondence",
];

export const academyModules = [
  {
    title: "How to read a tradeline",
    desc: "Understand balance, status, utilization, payment history, and what each field means.",
    icon: "BookOpen",
  },
  {
    title: "Accurate vs. inaccurate negatives",
    desc: "The difference between a true negative you owe and a reporting error you can dispute.",
    icon: "ScanSearch",
  },
  {
    title: "CRA vs. furnisher — who reports what",
    desc: "Credit bureaus store it, furnishers supply it. Knowing who to contact changes your strategy.",
    icon: "ShieldCheck",
  },
  {
    title: "What evidence matters",
    desc: "A dispute is only as strong as its facts. Learn which documents support which claims.",
    icon: "FileCheck2",
  },
  {
    title: "Identity-theft procedures",
    desc: "Identity theft has a specific, documented process — not a generic dispute letter.",
    icon: "ShieldCheck",
  },
  {
    title: "What happens after a dispute",
    desc: "30-day reinvestigation, response, reimport, and how to read a 'verified' result.",
    icon: "Clock",
  },
];

export function StatCard({
  label,
  value,
  tone,
  icon: Icon,
}: {
  label: string;
  value: string | number;
  tone: string;
  icon: typeof ShieldCheck;
}) {
  return (
    <div className="rounded-xl border border-border bg-card p-4">
      <Icon className="h-4 w-4 text-muted-foreground" />
      <p className={`mt-2 text-2xl font-bold ${tone}`}>{value}</p>
      <p className="mt-0.5 text-xs text-muted-foreground">{label}</p>
    </div>
  );
}

export function ItemRow({ item }: { item: ClassifiedItem }) {
  const { setView } = useDiy();
  return (
    <div className="rounded-xl border border-border bg-card p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold">{item.name}</p>
          <p className="mt-0.5 text-xs text-muted-foreground">
            {item.category} · {item.balance || "—"} · {item.bureaus.join(" / ")}
          </p>
        </div>
        <span
          className={`shrink-0 rounded-full px-2.5 py-1 text-[10px] font-bold ${
            item.isNegative
              ? "bg-red-500/15 text-red-300"
              : "bg-emerald-500/15 text-emerald-300"
          }`}
        >
          {item.isNegative ? "NEGATIVE" : "POSITIVE"}
        </span>
      </div>
      {item.isNegative && (
        <p className="mt-3 rounded-lg bg-navy-deep/60 p-2.5 text-[11px] leading-relaxed text-muted-foreground">
          <AlertTriangle className="mr-1 inline h-3 w-3 text-amber-400" />
          {item.aiReason}
        </p>
      )}
      <button
        onClick={() => setView("rounds")}
        className="mt-3 flex items-center gap-1.5 text-xs font-semibold text-emerald-300 hover:text-emerald-200"
      >
        <GitFork className="h-3.5 w-3.5" /> Open round tracker{" "}
        <ArrowRight className="h-3 w-3" />
      </button>
    </div>
  );
}

export { ScanSearch, Scale, ShieldCheck };

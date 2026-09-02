import { useMemo, useState } from "react";
import {
  Sparkles,
  Search,
  CreditCard,
  FileSearch,
  UserRound,
  Send,
  Clock,
  Ban,
  ShieldCheck,
  Building2,
  GraduationCap,
  Scale,
  AlertTriangle,
  Link2,
  ChevronDown,
  ChevronUp,
} from "lucide-react";
import { Input } from "@/components/ui/input";
import { AICopilotCard } from "@/components/copilot/AICopilotCard";
import {
  type ClassifiedItem,
  type Disposition,
  type ItemKind,
} from "@/lib/credit-classification";
import { useClientWorkspace } from "@/lib/client-workspace-context";
import { ItemDetailPanel } from "./ItemDetailPanel";

const kindIcon: Record<ItemKind, typeof CreditCard> = {
  Account: CreditCard,
  Inquiry: FileSearch,
  Personal: UserRound,
  "Public Record": Scale,
};

const categoryIcon: Record<string, typeof CreditCard> = {
  Inquiry: FileSearch,
  "3rd-Party Collection": Building2,
  "Charge-Off": AlertTriangle,
  "Student Loan": GraduationCap,
  "Public Record": Scale,
  "Late Payment": Clock,
  Repossession: AlertTriangle,
  Foreclosure: AlertTriangle,
  "Open Positive Account": ShieldCheck,
  "Closed Positive Account": ShieldCheck,
};

const bureauDot: Record<string, string> = {
  EQ: "bg-red-500",
  EX: "bg-blue-500",
  TU: "bg-emerald-500",
};

const categoryTone: Record<string, string> = {
  "3rd-Party Collection": "text-red-600",
  "Charge-Off": "text-red-600",
  "Student Loan": "text-amber-600",
  "Public Record": "text-red-600",
  "Late Payment": "text-amber-600",
  Repossession: "text-red-600",
  Foreclosure: "text-red-600",
  Inquiry: "text-amber-600",
  "Open Positive Account": "text-emerald-600",
  "Closed Positive Account": "text-emerald-600",
  Neutral: "text-muted-foreground",
};

const groups: {
  key: Disposition;
  label: string;
  icon: typeof Send;
  cls: string;
}[] = [
  {
    key: "dispute",
    label: "Dispute Items",
    icon: Send,
    cls: "text-emerald-600",
  },
  {
    key: "undisputed",
    label: "Undisputed Items",
    icon: Clock,
    cls: "text-amber-600",
  },
  {
    key: "never",
    label: "Never Dispute Items",
    icon: Ban,
    cls: "text-slate-500",
  },
  {
    key: "open-positive",
    label: "Open Positive Accounts",
    icon: ShieldCheck,
    cls: "text-blue-600",
  },
  {
    key: "closed-positive",
    label: "Closed Positive Accounts",
    icon: ShieldCheck,
    cls: "text-muted-foreground",
  },
];

const typeTabs = ["All", "Account", "Inquiry", "Public Record"] as const;

const ItemsTab = () => {
  const { items, moveItem, setTab, disputeCount, round } = useClientWorkspace();
  const [q, setQ] = useState("");
  const [typeTab, setTypeTab] = useState<(typeof typeTabs)[number]>("All");
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [previewItemId, setPreviewItemId] = useState<string | null>(null);

  const filtered = useMemo(
    () =>
      items.filter(
        (i) =>
          (typeTab === "All" || i.kind === typeTab) &&
          i.name.toLowerCase().includes(q.toLowerCase()),
      ),
    [items, q, typeTab],
  );

  const thisRoundCount = items.filter(
    (i) => i.disposition === "dispute",
  ).length;
  const missingReasonCount = items.filter(
    (i) => i.disposition === "dispute" && i.riskFlags.length === 0,
  ).length;

  const toggleExpand = (id: string) =>
    setExpandedId(expandedId === id ? null : id);

  return (
    <div className="space-y-6">
      <AICopilotCard
        title="AI Factual Item Analysis"
        message={`${thisRoundCount} items are staged for this round. ${
          missingReasonCount > 0
            ? `${missingReasonCount} items still need a documented factual reason and supporting evidence before letters are generated.`
            : "All staged items have a documented factual reason."
        } Factual disputes identify the exact field, state the true value, attach evidence, and require consumer attestation. The engine auto-marks negatives, protects inquiries linked to open accounts, and shields positive tradelines from dispute. Click any item to expand the full 3-bureau credit report detail.`}
        citations={["FCRA § 611", "Reg V 12 C.F.R. § 1022.43"]}
        prompts={[
          "What makes a dispute factual instead of template?",
          "Why can't we just blast direct-furnisher disputes for every client?",
        ]}
      />

      {/* Type tabs + search */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex flex-wrap gap-1.5 rounded-xl border border-border bg-card p-1">
          {typeTabs.map((t) => (
            <button
              key={t}
              onClick={() => setTypeTab(t)}
              className={`rounded-lg px-3 py-1.5 text-sm font-medium transition-colors ${
                typeTab === t
                  ? "bg-gradient-emerald text-white"
                  : "text-muted-foreground hover:bg-muted"
              }`}
            >
              {t}
            </button>
          ))}
        </div>
        <div className="relative min-w-[220px] flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Search items…"
            className="pl-9"
            value={q}
            onChange={(e) => setQ(e.target.value)}
          />
        </div>
      </div>

      {/* Grouped items with collapsibles */}
      {groups.map((g) => {
        const groupItems = filtered.filter((i) => i.disposition === g.key);
        if (groupItems.length === 0) return null;
        return (
          <div
            key={g.key}
            className="rounded-2xl border border-border bg-card p-5"
          >
            <div className="flex items-center gap-2">
              <g.icon className={`h-4 w-4 ${g.cls}`} />
              <h2 className="font-semibold">{g.label}</h2>
              <span className="rounded-full bg-muted px-2 py-0.5 text-xs font-medium text-muted-foreground">
                {groupItems.length}
              </span>
            </div>

            <div className="mt-3 space-y-2">
              {groupItems.map((item) => {
                const Icon = kindIcon[item.kind];
                const CatIcon = categoryIcon[item.category] || Icon;
                const isExpanded = expandedId === item.id;
                return (
                  <div key={item.id}>
                    <button
                      onClick={() => toggleExpand(item.id)}
                      className={`flex w-full flex-col gap-3 rounded-xl border p-4 text-left transition-colors hover:bg-muted/30 sm:flex-row sm:items-center sm:justify-between ${
                        isExpanded
                          ? "border-emerald-500/40 bg-emerald-500/5"
                          : "border-border bg-muted/20"
                      }`}
                    >
                      <div className="flex items-start gap-3 sm:w-1/3">
                        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-card text-muted-foreground">
                          <CatIcon className="h-4 w-4" />
                        </span>
                        <div>
                          <div className="flex items-center gap-2">
                            <p className="text-sm font-medium">{item.name}</p>
                            {item.autoSelected && (
                              <span className="rounded-full bg-emerald-500/10 px-1.5 py-0.5 text-[10px] font-medium text-emerald-600">
                                AI selected
                              </span>
                            )}
                          </div>
                          <p className="text-xs text-muted-foreground">
                            {item.subtype ? `${item.subtype} · ` : ""}
                            {item.status}
                            {item.balance ? ` · ${item.balance}` : ""}
                            {item.dofd ? ` · DOFD ${item.dofd}` : ""}
                          </p>
                        </div>
                      </div>

                      <div className="flex items-center gap-3 sm:w-1/4">
                        <span
                          className={`text-xs font-medium ${categoryTone[item.category] ?? "text-muted-foreground"}`}
                        >
                          {item.category}
                        </span>
                      </div>

                      <div className="flex items-center gap-2 sm:w-1/4">
                        {item.bureaus.map((b) => (
                          <span
                            key={b}
                            className="flex items-center gap-1 text-xs"
                          >
                            <span
                              className={`h-2 w-2 rounded-full ${bureauDot[b]}`}
                            />
                            {b}
                          </span>
                        ))}
                      </div>

                      <div className="flex items-center gap-2 sm:w-1/6 sm:justify-end">
                        {item.linkedOpenAccount && (
                          <span className="flex items-center gap-1 rounded-full bg-slate-500/10 px-2.5 py-1 text-xs font-medium text-slate-600">
                            <Link2 className="h-3 w-3" /> Linked
                          </span>
                        )}
                        <select
                          value={item.disposition}
                          onClick={(e) => e.stopPropagation()}
                          onChange={(e) => {
                            moveItem(item.id, e.target.value as Disposition);
                          }}
                          className="rounded-lg border border-border bg-background px-2 py-1.5 text-xs font-medium"
                        >
                          <option value="dispute">Dispute</option>
                          <option value="undisputed">Undisputed</option>
                          <option value="never">Never dispute</option>
                          <option value="open-positive">Open positive</option>
                          <option value="closed-positive">
                            Closed positive
                          </option>
                        </select>
                        {isExpanded ? (
                          <ChevronUp className="h-4 w-4 text-muted-foreground" />
                        ) : (
                          <ChevronDown className="h-4 w-4 text-muted-foreground" />
                        )}
                      </div>
                    </button>

                    {/* Expanded detail */}
                    {isExpanded && (
                      <div className="mt-2">
                        <ItemDetailPanel
                          item={item}
                          round={round}
                          onPreview={() => {
                            setPreviewItemId(item.id);
                            setTab("letters");
                          }}
                        />
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        );
      })}

      {filtered.length === 0 && (
        <div className="flex flex-col items-center gap-1 rounded-2xl border border-border bg-card py-16 text-center">
          <p className="font-medium">No items match this view</p>
          <p className="text-sm text-muted-foreground">
            Try a different type filter or search term.
          </p>
        </div>
      )}

      {/* Build letters CTA */}
      <div className="flex items-center justify-between rounded-2xl border border-emerald-500/20 bg-emerald-950/80 p-5 text-emerald-50 shadow-sm">
        <div className="flex items-center gap-3">
          <Sparkles className="h-5 w-5 text-emerald-400" />
          <div>
            <p className="text-sm font-semibold text-emerald-200">
              {disputeCount} items ready for factual dispute
            </p>
            <p className="text-xs text-emerald-100/90 leading-relaxed">
              Build evidence-grounded category-based letters for this round
            </p>
          </div>
        </div>
        <button
          onClick={() => setTab("letters")}
          className="flex items-center gap-2 rounded-lg bg-gradient-emerald px-4 py-2 text-sm font-semibold text-white hover:opacity-90"
        >
          <Send className="h-4 w-4" /> Build round letters
        </button>
      </div>
    </div>
  );
};

export default ItemsTab;

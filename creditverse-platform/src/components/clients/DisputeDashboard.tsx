import { useState } from "react";
import { OpsSelect } from "@/components/ui/ops-select";
import {
  Send,
  Clock,
  Ban,
  ShieldCheck,
  CheckCircle2,
  CreditCard,
  FileSearch,
  UserRound,
  Building2,
  GraduationCap,
  Scale,
  Sparkles,
  AlertTriangle,
  Link2,
  ChevronDown,
  ChevronUp,
  Search,
  ScanSearch,
  ShieldAlert,
  ArrowRight,
  CheckSquare,
  Square,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { AICopilotCard } from "@/components/copilot/AICopilotCard";
import {
  DISPOSITION_SECTIONS,
  type ClassifiedItem,
  type Disposition,
  type ItemKind,
} from "@/lib/credit-classification";
import { useClientWorkspace } from "@/lib/client-workspace-context";
import { ItemDetailPanel } from "./ItemDetailPanel";

/** Where an item sits in the dispute plan. Value is stored; label is shown. */
const DISPOSITION_OPTIONS = [
  { value: "dispute", label: "Dispute" },
  { value: "undisputed", label: "Undisputed" },
  { value: "never", label: "Never dispute" },
  { value: "open-positive", label: "Open positive" },
  { value: "closed-positive", label: "Closed positive" },
];
import {
  detectAnomaly,
  routeStatutes,
  type AnomalyInput,
} from "@/lib/dispute/metro2-intelligence";
import {
  AnomalyCard,
  TruthGatePanel,
  StatuteRoutingCard,
  ClassificationLegend,
  EvidenceStrengthLegend,
} from "@/components/clients/Metro2IntelligencePanel";

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
  "Closed Positive Account": CheckCircle2,
};

const bureauDot: Record<string, string> = {
  EQ: "bg-red-500",
  EX: "bg-blue-500",
  TU: "bg-emerald-500",
};

const fieldInputs: AnomalyInput[] = [
  {
    field: "Account status",
    values: [
      { bureau: "EX", value: "Collection" },
      { bureau: "EQ", value: "Collection" },
      { bureau: "TU", value: "Closed" },
    ],
    consumerAssertedValue: "Settled & closed",
    hasSourceDocument: true,
    sourceDocumentContradictsReport: true,
    sameReportingPeriodConfirmed: true,
  },
  {
    field: "Balance",
    values: [
      { bureau: "EX", value: "$4,820" },
      { bureau: "EQ", value: "$4,820" },
      { bureau: "TU", value: "$0" },
    ],
    consumerAssertedValue: "$0 after settlement",
    hasSourceDocument: true,
    sourceDocumentContradictsReport: true,
    sameReportingPeriodConfirmed: true,
  },
];

export const DisputeDashboard = () => {
  const { items, bulkMove, setTab, disputeCount, round } = useClientWorkspace();
  const [expanded, setExpanded] = useState<Disposition | null>("dispute");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [expandedItem, setExpandedItem] = useState<string | null>(null);
  const [q, setQ] = useState("");
  const [showInspector, setShowInspector] = useState(false);

  const toggleSelect = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const selectAllInSection = (sectionItems: ClassifiedItem[]) => {
    const allSelected = sectionItems.every((i) => selected.has(i.id));
    setSelected((prev) => {
      const next = new Set(prev);
      if (allSelected) {
        sectionItems.forEach((i) => next.delete(i.id));
      } else {
        sectionItems.forEach((i) => next.add(i.id));
      }
      return next;
    });
  };

  const bulkSetDisposition = (d: Disposition) => {
    bulkMove(Array.from(selected), d);
    setSelected(new Set());
  };

  const inspectorResults = fieldInputs.map((input) => detectAnomaly(input));
  const craRouting = routeStatutes("cra");

  return (
    <div className="space-y-6">
      <AICopilotCard
        title="AI Factual Dispute Selection"
        message={`${disputeCount} items auto-selected for this round. The engine protects inquiries tied to open accounts and shields positive tradelines. Every selected item needs a documented factual basis, evidence, and consumer attestation before letters generate. Use bulk select to move multiple items at once.`}
        citations={["FCRA § 611", "FCRA § 623", "Reg V § 1022.43"]}
        prompts={[
          "Why protect inquiries linked to open accounts?",
          "What makes a dispute factual instead of template?",
        ]}
      />

      {/* Bulk action bar */}
      {selected.size > 0 && (
        <div className="sticky top-2 z-20 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-emerald-500/30 bg-card p-4 shadow-lg">
          <span className="flex items-center gap-2 text-sm font-semibold text-emerald-600">
            <CheckSquare className="h-4 w-4" />
            {selected.size} item{selected.size === 1 ? "" : "s"} selected
          </span>
          <div className="flex flex-wrap gap-2">
            <Button
              size="sm"
              variant="outline"
              onClick={() => bulkSetDisposition("dispute")}
            >
              Move to Dispute
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={() => bulkSetDisposition("undisputed")}
            >
              Move to Undisputed
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={() => bulkSetDisposition("never")}
            >
              Never Dispute
            </Button>
            <Button
              size="sm"
              variant="ghost"
              onClick={() => setSelected(new Set())}
            >
              Clear
            </Button>
          </div>
        </div>
      )}

      {/* Search + Inspector toggle */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative min-w-[220px] flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Search items…"
            className="pl-9"
            value={q}
            onChange={(e) => setQ(e.target.value)}
          />
        </div>
        <Button
          variant={showInspector ? "default" : "outline"}
          onClick={() => setShowInspector((s) => !s)}
          className={showInspector ? "bg-gradient-emerald text-white" : ""}
        >
          <ScanSearch className="h-4 w-4" />
          {showInspector ? "Hide Inspector" : "Open Accuracy Inspector"}
        </Button>
      </div>

      {/* Accuracy Inspector (merged in) */}
      {showInspector && (
        <div className="space-y-4 rounded-2xl border border-amber-500/30 bg-amber-500/5 p-5">
          <div className="flex items-start gap-3">
            <ShieldAlert className="mt-0.5 h-5 w-5 shrink-0 text-amber-600" />
            <p className="text-sm text-muted-foreground">
              Metro 2 is an industry data-reporting specification, not a federal
              statute. A Metro 2 anomaly is <strong>evidence</strong> of a
              data-integrity problem — it does not automatically equal an FCRA
              violation, does not automatically make an account unverifiable,
              and does not automatically require deletion.
            </p>
          </div>
          <div className="grid gap-4 lg:grid-cols-3">
            <div className="space-y-3 lg:col-span-2">
              <div className="flex items-center gap-2">
                <ScanSearch className="h-5 w-5 text-emerald-600" />
                <h3 className="font-semibold">Tradeline field analysis</h3>
                <Badge className="bg-muted text-muted-foreground">
                  Midland Funding LLC · acct *5678
                </Badge>
              </div>
              {inspectorResults.map((r) => (
                <AnomalyCard key={r.field} result={r} />
              ))}
            </div>
            <div className="space-y-4">
              <TruthGatePanel
                passed={false}
                blocks={[
                  "Consumer must confirm whether they recognize the account before any dispute is filed.",
                  "The specific information believed to be inaccurate must be identified.",
                ]}
                requiredForFiling={[
                  "At least one supporting document strengthens the dispute and avoids a frivolous finding.",
                ]}
              />
              <StatuteRoutingCard
                recipient={craRouting.recipient}
                applicableStatutes={craRouting.applicableStatutes}
                incorrectAssignment={craRouting.incorrectAssignment}
                notes={craRouting.notes}
              />
              <ClassificationLegend />
              <EvidenceStrengthLegend />
            </div>
          </div>
        </div>
      )}

      {/* Disposition sections */}
      {DISPOSITION_SECTIONS.map((section) => {
        const sectionItems = items.filter(
          (i) =>
            i.disposition === section.key &&
            i.name.toLowerCase().includes(q.toLowerCase()),
        );
        if (sectionItems.length === 0) return null;
        const isOpen = expanded === section.key;
        const allSelected = sectionItems.every((i) => selected.has(i.id));

        return (
          <div
            key={section.key}
            className="overflow-hidden rounded-2xl border border-border bg-card"
          >
            <button
              onClick={() => setExpanded(isOpen ? null : section.key)}
              className="flex w-full items-center justify-between p-5 text-left hover:bg-muted/30"
            >
              <div className="flex items-center gap-3">
                <SectionIcon disposition={section.key} />
                <div>
                  <h2 className={`font-semibold ${section.tone}`}>
                    {section.label}
                  </h2>
                  <p className="text-xs text-muted-foreground">
                    {section.description}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-3">
                {section.key === "dispute" && (
                  <span
                    onClick={(e) => {
                      e.stopPropagation();
                      selectAllInSection(sectionItems);
                    }}
                    className="flex items-center gap-1 text-xs font-medium text-emerald-600 hover:underline"
                  >
                    {allSelected ? (
                      <CheckSquare className="h-3.5 w-3.5" />
                    ) : (
                      <Square className="h-3.5 w-3.5" />
                    )}
                    Select all
                  </span>
                )}
                <span className="rounded-full bg-muted px-2.5 py-1 text-xs font-semibold">
                  {sectionItems.length}
                </span>
                {isOpen ? (
                  <ChevronUp className="h-4 w-4 text-muted-foreground" />
                ) : (
                  <ChevronDown className="h-4 w-4 text-muted-foreground" />
                )}
              </div>
            </button>

            {isOpen && (
              <div className="space-y-2 border-t border-border p-4">
                {sectionItems.map((item) => {
                  const isItemSelected = selected.has(item.id);
                  const isItemExpanded = expandedItem === item.id;
                  const CatIcon =
                    categoryIcon[item.category] || kindIcon[item.kind];
                  return (
                    <div key={item.id}>
                      <div
                        className={`flex flex-col gap-3 rounded-xl border p-4 transition-colors sm:flex-row sm:items-center sm:justify-between ${
                          isItemExpanded
                            ? "border-emerald-500/40 bg-emerald-500/5"
                            : "border-border bg-muted/20 hover:bg-muted/30"
                        }`}
                      >
                        <div className="flex items-start gap-3 sm:w-2/5">
                          <button
                            onClick={() => toggleSelect(item.id)}
                            className="mt-0.5 shrink-0"
                          >
                            {isItemSelected ? (
                              <CheckSquare className="h-4 w-4 text-emerald-600" />
                            ) : (
                              <Square className="h-4 w-4 text-muted-foreground" />
                            )}
                          </button>
                          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-card text-muted-foreground">
                            <CatIcon className="h-4 w-4" />
                          </span>
                          <div>
                            <div className="flex items-center gap-2">
                              <p className="text-sm font-medium">{item.name}</p>
                              {item.autoSelected && (
                                <Badge className="bg-emerald-500/10 text-[10px] text-emerald-600">
                                  AI selected
                                </Badge>
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

                        <div className="flex items-center gap-3 sm:w-1/5">
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

                        <div className="flex items-center gap-2 sm:w-2/5 sm:justify-end">
                          {item.linkedOpenAccount && (
                            <span className="flex items-center gap-1 rounded-full bg-slate-500/10 px-2.5 py-1 text-xs font-medium text-slate-600">
                              <Link2 className="h-3 w-3" /> Linked:{" "}
                              {item.linkedOpenAccount}
                            </span>
                          )}
                          <OpsSelect
                            value={item.disposition}
                            onValueChange={(v) =>
                              bulkMove([item.id], v as Disposition)
                            }
                            options={DISPOSITION_OPTIONS}
                            size="sm"
                            aria-label="Disposition"
                          />
                          <button
                            onClick={() =>
                              setExpandedItem(isItemExpanded ? null : item.id)
                            }
                            className="flex h-8 w-8 items-center justify-center rounded-lg border border-border text-muted-foreground hover:bg-muted"
                          >
                            {isItemExpanded ? (
                              <ChevronUp className="h-4 w-4" />
                            ) : (
                              <ChevronDown className="h-4 w-4" />
                            )}
                          </button>
                        </div>
                      </div>

                      {isItemExpanded && (
                        <div className="mt-2">
                          <ItemDetailPanel
                            item={item}
                            round={round}
                            onPreview={() => setTab("letters")}
                          />
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        );
      })}

      {/* Build letters CTA */}
      <div className="flex items-center justify-between rounded-2xl border border-emerald-500/20 bg-emerald-950/80 p-5 text-emerald-50 shadow-sm">
        <div className="flex items-center gap-3">
          <Sparkles className="h-5 w-5 text-emerald-400" />
          <div>
            <p className="text-sm font-semibold text-emerald-200">
              {disputeCount} items ready for factual dispute
            </p>
            <p className="text-xs text-emerald-100/90 leading-relaxed">
              Review each item, add dispute reason, then build letters
            </p>
          </div>
        </div>
        <Button
          onClick={() => setTab("letters")}
          className="bg-gradient-emerald text-white hover:opacity-90"
        >
          <Send className="h-4 w-4" /> Go to Letter Builder{" "}
          <ArrowRight className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
};

function SectionIcon({ disposition }: { disposition: Disposition }) {
  const map: Record<Disposition, typeof Send> = {
    dispute: Send,
    undisputed: Clock,
    never: Ban,
    "open-positive": ShieldCheck,
    "closed-positive": CheckCircle2,
  };
  const Icon = map[disposition];
  const tone: Record<Disposition, string> = {
    dispute: "bg-emerald-500/10 text-emerald-600",
    undisputed: "bg-amber-500/10 text-amber-600",
    never: "bg-slate-500/10 text-slate-600",
    "open-positive": "bg-blue-500/10 text-blue-600",
    "closed-positive": "bg-muted text-muted-foreground",
  };
  return (
    <span
      className={`flex h-9 w-9 items-center justify-center rounded-xl ${tone[disposition]}`}
    >
      <Icon className="h-4 w-4" />
    </span>
  );
}

export type { ClassifiedItem, Disposition, ItemKind };

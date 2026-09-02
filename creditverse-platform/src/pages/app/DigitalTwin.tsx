import { useState } from "react";
import {
  Boxes,
  Layers,
  CreditCard,
  FolderArchive,
  Search as SearchIcon,
  CalendarClock,
  DollarSign,
  MessageSquare,
  FileStack,
  ShieldCheck,
  Sparkles,
  ArrowRight,
  GitMerge,
  TrendingUp,
  ScanSearch,
  History,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { AICopilotCard } from "@/components/copilot/AICopilotCard";
import { useClientWorkspace } from "@/lib/client-workspace-context";

type Bureau = "Equifax" | "Experian" | "TransUnion";

const bureauChip: Record<Bureau, string> = {
  Equifax: "bg-red-500/10 text-red-600",
  Experian: "bg-blue-500/10 text-blue-600",
  TransUnion: "bg-emerald-500/10 text-emerald-600",
};

const masterStats = [
  { label: "Tradelines", value: 14, icon: CreditCard },
  { label: "Collections", value: 4, icon: FolderArchive },
  { label: "Inquiries", value: 6, icon: SearchIcon },
  { label: "Public records", value: 1, icon: FileStack },
  { label: "Snapshots", value: 7, icon: Layers },
  { label: "Dispute events", value: 23, icon: MessageSquare },
];

const tradelines: {
  id: string;
  name: string;
  type: string;
  balance: string;
  status: string;
  dofd: string;
  reportedOn: Bureau[];
  integrity: number;
  disputeHistory: number;
}[] = [
  {
    id: "TL-01",
    name: "Midland Funding",
    type: "Collection",
    balance: "$4,820",
    status: "Open",
    dofd: "11/2024",
    reportedOn: ["Equifax", "Experian", "TransUnion"],
    integrity: 62,
    disputeHistory: 2,
  },
  {
    id: "TL-02",
    name: "Capital One Bank",
    type: "Revolving",
    balance: "$1,240",
    status: "Charge-off",
    dofd: "04/2025",
    reportedOn: ["Equifax", "Experian", "TransUnion"],
    integrity: 88,
    disputeHistory: 1,
  },
  {
    id: "TL-03",
    name: "Portfolio Recovery",
    type: "Collection",
    balance: "$3,418",
    status: "Deleted",
    dofd: "08/2023",
    reportedOn: ["Experian"],
    integrity: 100,
    disputeHistory: 3,
  },
  {
    id: "TL-04",
    name: "Discover",
    type: "Revolving",
    balance: "$0",
    status: "Closed",
    dofd: "—",
    reportedOn: ["Equifax", "TransUnion"],
    integrity: 95,
    disputeHistory: 0,
  },
];

const snapshots = [
  { date: "Aug 29, 2026", source: "SmartCredit", score: 712, delta: 58 },
  { date: "Jul 28, 2026", source: "SmartCredit", score: 698, delta: 14 },
  { date: "Jun 28, 2026", source: "IdentityIQ", score: 684, delta: 15 },
  { date: "May 28, 2026", source: "IdentityIQ", score: 669, delta: 18 },
  { date: "Apr 28, 2026", source: "MyScoreIQ", score: 651, delta: 13 },
  { date: "Mar 28, 2026", source: "MyScoreIQ", score: 638, delta: 14 },
  { date: "Feb 28, 2026", source: "SmartCredit", score: 624, delta: 0 },
];

const DigitalTwin = ({ embedded = false }: { embedded?: boolean }) => {
  const [activeId, setActiveId] = useState("TL-01");
  const { setTab } = useClientWorkspace();
  const active = tradelines.find((t) => t.id === activeId)!;

  return (
    <div className={embedded ? "" : "p-6 md:p-8"}>
      <div className={embedded ? "mb-6" : "mb-8"}>
        <h1 className="flex items-center gap-2 text-2xl font-bold tracking-tight">
          <Boxes className="h-6 w-6 text-emerald-600" /> Credit File Digital
          Twin
        </h1>
        <p className="text-sm text-muted-foreground">
          One normalized master record per consumer — every bureau merged, every
          snapshot preserved, every dispute remembered. The engine that
          understands the full history of a credit file.
        </p>
      </div>

      {/* Normalization flow */}
      <div className="mb-8 flex flex-wrap items-center gap-2 rounded-2xl border border-border bg-card p-5 text-sm">
        <span className="flex items-center gap-1.5 rounded-lg bg-red-500/10 px-3 py-1.5 font-medium text-red-600">
          <span className="h-2 w-2 rounded-full bg-red-500" /> Equifax
        </span>
        <span className="flex items-center gap-1.5 rounded-lg bg-blue-500/10 px-3 py-1.5 font-medium text-blue-600">
          <span className="h-2 w-2 rounded-full bg-blue-500" /> Experian
        </span>
        <span className="flex items-center gap-1.5 rounded-lg bg-emerald-500/10 px-3 py-1.5 font-medium text-emerald-600">
          <span className="h-2 w-2 rounded-full bg-emerald-500" /> TransUnion
        </span>
        <ArrowRight className="h-4 w-4 text-muted-foreground" />
        <span className="flex items-center gap-1.5 rounded-lg bg-muted px-3 py-1.5 font-medium">
          <GitMerge className="h-4 w-4 text-emerald-600" /> Normalization Engine
        </span>
        <ArrowRight className="h-4 w-4 text-muted-foreground" />
        <span className="flex items-center gap-1.5 rounded-lg bg-gradient-emerald px-3 py-1.5 font-semibold text-white">
          <ShieldCheck className="h-4 w-4" /> Master Credit File
        </span>
      </div>

      {/* Master file stats */}
      <div className="mb-8 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
        {masterStats.map((s) => (
          <div
            key={s.label}
            className="rounded-xl border border-border bg-card p-4"
          >
            <s.icon className="h-4 w-4 text-emerald-600" />
            <p className="mt-2 text-2xl font-bold">{s.value}</p>
            <p className="text-xs text-muted-foreground">{s.label}</p>
          </div>
        ))}
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        {/* Tradeline master list */}
        <div className="space-y-3">
          <h2 className="text-sm font-semibold uppercase text-muted-foreground">
            Master tradelines
          </h2>
          {tradelines.map((t) => (
            <button
              key={t.id}
              onClick={() => setActiveId(t.id)}
              className={`w-full rounded-2xl border p-4 text-left transition-colors ${
                activeId === t.id
                  ? "border-emerald-500/50 bg-emerald-500/5"
                  : "border-border bg-card hover:bg-muted/30"
              }`}
            >
              <div className="flex items-center justify-between">
                <span className="font-medium">{t.name}</span>
                <span className="text-sm font-semibold">{t.balance}</span>
              </div>
              <div className="mt-1.5 flex items-center gap-2">
                <Badge variant="outline" className="text-[10px]">
                  {t.type}
                </Badge>
                <span className="text-xs text-muted-foreground">
                  {t.status}
                </span>
              </div>
              <div className="mt-3 flex items-center gap-2">
                <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-muted">
                  <div
                    className={`h-full rounded-full ${
                      t.integrity >= 90
                        ? "bg-emerald-500"
                        : t.integrity >= 70
                          ? "bg-amber-500"
                          : "bg-red-500"
                    }`}
                    style={{ width: `${t.integrity}%` }}
                  />
                </div>
                <span className="text-[10px] font-medium text-muted-foreground">
                  integrity {t.integrity}%
                </span>
              </div>
              <div className="mt-2 flex gap-1">
                {(["Equifax", "Experian", "TransUnion"] as Bureau[]).map(
                  (b) => (
                    <span
                      key={b}
                      className={`h-1.5 flex-1 rounded-full ${
                        t.reportedOn.includes(b)
                          ? b === "Equifax"
                            ? "bg-red-500"
                            : b === "Experian"
                              ? "bg-blue-500"
                              : "bg-emerald-500"
                          : "bg-muted"
                      }`}
                    />
                  ),
                )}
              </div>
            </button>
          ))}
        </div>

        {/* Active tradeline detail */}
        <div className="lg:col-span-2 space-y-6">
          <div className="rounded-2xl border border-border bg-card p-6">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <CreditCard className="h-5 w-5 text-emerald-600" />
                <h2 className="font-semibold">{active.name}</h2>
              </div>
              <Badge className="bg-muted text-muted-foreground">
                {active.id} · {active.type}
              </Badge>
            </div>

            <div className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-4">
              <div className="rounded-xl border border-border bg-muted/30 p-3">
                <p className="flex items-center gap-1 text-[10px] font-medium uppercase text-muted-foreground">
                  <DollarSign className="h-3 w-3" /> Balance
                </p>
                <p className="mt-1 text-sm font-semibold">{active.balance}</p>
              </div>
              <div className="rounded-xl border border-border bg-muted/30 p-3">
                <p className="flex items-center gap-1 text-[10px] font-medium uppercase text-muted-foreground">
                  <CreditCard className="h-3 w-3" /> Status
                </p>
                <p className="mt-1 text-sm font-semibold">{active.status}</p>
              </div>
              <div className="rounded-xl border border-border bg-muted/30 p-3">
                <p className="flex items-center gap-1 text-[10px] font-medium uppercase text-muted-foreground">
                  <CalendarClock className="h-3 w-3" /> DOFD
                </p>
                <p className="mt-1 text-sm font-semibold">{active.dofd}</p>
              </div>
              <div className="rounded-xl border border-border bg-muted/30 p-3">
                <p className="flex items-center gap-1 text-[10px] font-medium uppercase text-muted-foreground">
                  <MessageSquare className="h-3 w-3" /> Disputes
                </p>
                <p className="mt-1 text-sm font-semibold">
                  {active.disputeHistory}
                </p>
              </div>
            </div>

            <div className="mt-5">
              <p className="text-xs font-semibold uppercase text-muted-foreground">
                Reported across bureaus
              </p>
              <div className="mt-2 flex flex-wrap gap-2">
                {(["Equifax", "Experian", "TransUnion"] as Bureau[]).map(
                  (b) => (
                    <span
                      key={b}
                      className={`rounded-full px-2.5 py-1 text-xs font-medium ${
                        active.reportedOn.includes(b)
                          ? bureauChip[b]
                          : "bg-muted text-muted-foreground"
                      }`}
                    >
                      {b}
                      {!active.reportedOn.includes(b) && " · absent"}
                    </span>
                  ),
                )}
              </div>
            </div>

            <div className="mt-5">
              <p className="text-xs font-semibold uppercase text-muted-foreground">
                Data integrity score
              </p>
              <div className="mt-2 flex items-center gap-3">
                <div className="h-2 flex-1 overflow-hidden rounded-full bg-muted">
                  <div
                    className={`h-full rounded-full ${
                      active.integrity >= 90
                        ? "bg-emerald-500"
                        : active.integrity >= 70
                          ? "bg-amber-500"
                          : "bg-red-500"
                    }`}
                    style={{ width: `${active.integrity}%` }}
                  />
                </div>
                <span className="text-sm font-semibold">
                  {active.integrity}%
                </span>
              </div>
              <p className="mt-1.5 text-xs text-muted-foreground">
                {active.integrity < 90
                  ? "Cross-bureau field inconsistencies detected — open in Accuracy Inspector."
                  : "All three bureaus agree on core fields for this tradeline."}
              </p>
            </div>

            <div className="mt-5 flex flex-wrap gap-3">
              <Button
                onClick={() => setTab("disputes")}
                className="bg-gradient-emerald text-white hover:opacity-90"
              >
                <ScanSearch className="h-4 w-4" /> Open in Dispute Dashboard
              </Button>
              <Button variant="outline" onClick={() => setTab("overview")}>
                <History className="h-4 w-4" /> View overview
              </Button>
            </div>
          </div>

          {/* Snapshot history */}
          <div className="rounded-2xl border border-border bg-card p-6">
            <div className="flex items-center gap-2">
              <Layers className="h-5 w-5 text-emerald-600" />
              <h2 className="font-semibold">Snapshot history</h2>
              <Badge className="ml-auto bg-muted text-muted-foreground">
                Immutable · 7 pulls
              </Badge>
            </div>
            <p className="mt-1 text-sm text-muted-foreground">
              Each report becomes a new immutable snapshot — the master file is
              never destructively overwritten, so you can always prove what was
              reported before a dispute.
            </p>
            <div className="mt-4 space-y-2">
              {snapshots.map((s, i) => (
                <div
                  key={s.date}
                  className="flex items-center justify-between rounded-lg border border-border bg-muted/30 p-3 text-sm"
                >
                  <div className="flex items-center gap-3">
                    <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-card text-xs font-semibold text-muted-foreground">
                      {snapshots.length - i}
                    </div>
                    <div>
                      <p className="font-medium">{s.date}</p>
                      <p className="text-xs text-muted-foreground">
                        {s.source}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="font-semibold">{s.score}</span>
                    {s.delta > 0 && (
                      <span className="flex items-center gap-0.5 text-xs font-medium text-emerald-600">
                        <TrendingUp className="h-3 w-3" /> +{s.delta}
                      </span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>

          <AICopilotCard
            title="AI Digital Twin Guidance"
            message={`The master file for ${active.name} merges ${active.reportedOn.length} bureau${active.reportedOn.length > 1 ? "s" : ""} into one normalized record with a ${active.integrity}% integrity score. ${active.integrity < 90 ? "Field-level discrepancies exist — route to the Accuracy Inspector for consumer verification before any dispute is generated." : "Core fields are consistent across bureaus."} The twin preserves all ${snapshots.length} snapshots and ${active.disputeHistory} prior dispute event${active.disputeHistory === 1 ? "" : "s"}, so any next action is grounded in the full history of the file — not just the latest pull.`}
            citations={["FCRA § 611", "FCRA § 623(a)", "Metro 2 Base Segment"]}
            prompts={[
              "Why keep immutable snapshots instead of overwriting?",
              "How does the twin detect re-aging across pulls?",
            ]}
          />
        </div>
      </div>
    </div>
  );
};

export default DigitalTwin;

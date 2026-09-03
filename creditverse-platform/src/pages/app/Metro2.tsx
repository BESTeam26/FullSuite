import { useState } from "react";
import {
  FileText,
  Download,
  Send,
  Check,
  Building2,
  Snowflake,
  ShieldAlert,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { SECONDARY_BUREAUS } from "@/lib/dispute/letters-and-channels";
import {
  detectAnomaly,
  routeStatutes,
  type AnomalyInput,
} from "@/lib/dispute/metro2-intelligence";
import {
  AnomalyCard,
  ClassificationLegend,
  EvidenceStrengthLegend,
  StatuteRoutingCard,
} from "@/components/clients/Metro2IntelligencePanel";

const fields = [
  {
    label: "Compliance Condition",
    value: "Account information disputed — furnisher must verify",
  },
  { label: "FCRA Section", value: "§ 623(a)(8) — Direct Dispute" },
  {
    label: "Metro2 Field",
    value: "Compliance Condition Code = 'A' (Account information disputed)",
  },
  { label: "Date Reported", value: "08/29/2026" },
  { label: "Account Status", value: "Disputed — under reinvestigation" },
];

// Sample anomaly inputs for the Metro 2 page demo
const sampleAnomalies: AnomalyInput[] = [
  {
    field: "DOFD / FCRA Delinquency Date",
    values: [
      { bureau: "EQ", value: "09/2023" },
      { bureau: "EX", value: "09/2023" },
      { bureau: "TU", value: "11/2023" },
    ],
  },
  {
    field: "Current Balance",
    values: [
      { bureau: "EQ", value: "$1,842" },
      { bureau: "EX", value: "$1,842" },
      { bureau: "TU", value: "$0" },
    ],
    consumerAssertedValue: "$0 — settled",
    hasSourceDocument: true,
    sourceDocumentContradictsReport: true,
    sameReportingPeriodConfirmed: true,
  },
  {
    field: "Account Status",
    values: [
      { bureau: "EQ", value: "Charge-off" },
      { bureau: "EX", value: "Charge-off" },
      { bureau: "TU", value: "Open" },
    ],
  },
];

const Metro2 = () => {
  const [selectedBureau, setSelectedBureau] = useState("innovis");
  const bureau =
    SECONDARY_BUREAUS.find((b) => b.id === selectedBureau) ??
    SECONDARY_BUREAUS[0];
  const [frozenBureaus, setFrozenBureaus] = useState<Set<string>>(
    new Set(["chexsystems", "lexisnexis"]),
  );

  const toggleFreeze = (id: string) => {
    setFrozenBureaus((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const anomalyResults = sampleAnomalies.map((a) => detectAnomaly(a));
  const furnisherRouting = routeStatutes("furnisher");

  return (
    <div className="p-6 md:p-8 space-y-8">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">
          Metro2 & Secondary Bureau Control Center
        </h1>
        <p className="text-sm text-muted-foreground">
          Generate compliant Metro2-format disputes for furnishers and manage
          Security Freezes across all 6 secondary credit registries.
        </p>
      </div>

      {/* Corrected positioning banner */}
      <div className="flex items-start gap-3 rounded-2xl border border-amber-500/30 bg-amber-500/5 p-4">
        <ShieldAlert className="mt-0.5 h-5 w-5 shrink-0 text-status-warning" />
        <p className="text-sm text-muted-foreground">
          Metro 2 is an industry data-reporting specification, not a federal
          consumer-protection statute. A Metro 2 anomaly is powerful{" "}
          <strong>evidence</strong> of a data-integrity problem, but it does not
          automatically equal an FCRA violation, does not automatically make an
          account unverifiable, and does not automatically require deletion.
        </p>
      </div>

      {/* Metro 2 Intelligence Engine results */}
      <div className="space-y-4">
        <div className="flex items-center gap-2">
          <FileText className="h-5 w-5 text-status-success" />
          <h2 className="text-lg font-bold tracking-tight">
            Credit Reporting Accuracy & Metro 2 Intelligence Engine
          </h2>
        </div>
        <p className="text-sm text-muted-foreground">
          Reported Data → Metro 2 Context → Potential Anomaly → Consumer Fact →
          Documentary Evidence → Applicable Legal Duty → Proper Dispute Channel
          → Appropriate Remedy.
        </p>

        <div className="grid gap-4 lg:grid-cols-3">
          <div className="space-y-3 lg:col-span-2">
            {anomalyResults.map((r) => (
              <AnomalyCard key={r.field} result={r} />
            ))}
          </div>
          <div className="space-y-4">
            <StatuteRoutingCard
              recipient={furnisherRouting.recipient}
              applicableStatutes={furnisherRouting.applicableStatutes}
              incorrectAssignment={furnisherRouting.incorrectAssignment}
              notes={furnisherRouting.notes}
            />
            <ClassificationLegend />
            <EvidenceStrengthLegend />
          </div>
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="rounded-2xl border border-border bg-card p-6 lg:col-span-2">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <FileText className="h-5 w-5 text-status-success" />
              <h2 className="font-semibold">Dispute record — DSP-2040</h2>
            </div>
            <Badge className="bg-purple-500/10 text-purple-600">Metro2</Badge>
          </div>

          <div className="mt-6 space-y-4">
            {fields.map((f) => (
              <div
                key={f.label}
                className="grid grid-cols-1 gap-1 border-b border-border pb-3 sm:grid-cols-3"
              >
                <span className="text-sm text-muted-foreground">{f.label}</span>
                <span className="text-sm font-medium sm:col-span-2">
                  {f.value}
                </span>
              </div>
            ))}
          </div>

          <div className="mt-6 rounded-xl bg-navy-deep p-4 font-mono text-xs leading-relaxed text-slate-300">
            <p className="text-emerald-400">
              // Metro2 segment — Base Segment (compressed)
            </p>
            <p>HEADER 0262 08292026 99999999 01 CreditForge Furnisher</p>
            <p>BASE 0000000001 1234567890123456789 01 20260829 20230115</p>
            <p> I 3 00 00 00 0 0 0 0 0 0 0 0 0 0 0 0 0 A 20260829</p>
            <p> 01 0123456789 MARIA GONZALEZ 123 MAIN ST ANYTOWN</p>
            <p> ST 12345 01 20260829 20260829</p>
            <p className="text-emerald-400">
              // Compliance Condition Code 'A' = Account information disputed
            </p>
          </div>

          <div className="mt-6 flex gap-3">
            <Button className="bg-gradient-emerald text-white hover:opacity-90">
              <Send className="h-4 w-4" /> File with bureau
            </Button>
            <Button variant="outline">
              <Download className="h-4 w-4" /> Export Metro2 file
            </Button>
          </div>
        </div>

        <div className="space-y-4">
          <div className="rounded-2xl border border-border bg-card p-6">
            <h3 className="font-semibold">Factual dispute checklist</h3>
            <ul className="mt-4 space-y-3 text-sm">
              {[
                "Account number verified",
                "Date of first delinquency confirmed",
                "Balance accuracy reviewed",
                "Furnisher identified",
                "FCRA basis cited",
              ].map((c) => (
                <li key={c} className="flex items-center gap-2">
                  <span className="flex h-5 w-5 items-center justify-center rounded-full bg-emerald-500/10 text-status-success">
                    <Check className="h-3 w-3" />
                  </span>
                  {c}
                </li>
              ))}
            </ul>
          </div>
          <div className="rounded-2xl border border-emerald-500/20 bg-emerald-950/80 p-6 text-emerald-50 shadow-sm">
            <h3 className="font-semibold text-emerald-300">Compliance note</h3>
            <p className="mt-2 text-sm text-emerald-100/90 leading-relaxed">
              Metro2 disputes are filed directly with furnishers under FCRA §
              623(a)(8). All filings are logged with timestamps for audit
              retention.
            </p>
          </div>
        </div>
      </div>

      {/* Secondary & Freeze Bureau Registry */}
      <div className="space-y-4 pt-6 border-t border-border">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-lg font-bold tracking-tight flex items-center gap-2">
              <Building2 className="h-5 w-5 text-status-warning" /> Secondary &
              Freeze Bureau Registry
            </h2>
            <p className="text-sm text-muted-foreground">
              Manage security freezes and alternate dispute delivery for
              secondary credit databases.
            </p>
          </div>
          <Badge className="bg-amber-500/10 text-status-warning border-none">
            {frozenBureaus.size} Frozen
          </Badge>
        </div>

        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {SECONDARY_BUREAUS.map((sec) => {
            const isFrozen = frozenBureaus.has(sec.id);
            return (
              <div
                key={sec.id}
                className={`rounded-xl border p-5 transition-all ${
                  isFrozen
                    ? "border-sky-500/40 bg-sky-500/5"
                    : "border-border bg-card"
                }`}
              >
                <div className="flex items-start justify-between">
                  <div>
                    <h3 className="font-semibold text-sm">{sec.name}</h3>
                    <Badge
                      variant="outline"
                      className="mt-1 text-[10px] uppercase font-mono"
                    >
                      {sec.category}
                    </Badge>
                  </div>
                  <button
                    onClick={() => toggleFreeze(sec.id)}
                    className={`flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold transition-all ${
                      isFrozen
                        ? "bg-sky-500 text-white"
                        : "bg-muted text-muted-foreground hover:bg-muted/80"
                    }`}
                  >
                    <Snowflake className="h-3 w-3" />
                    {isFrozen ? "Frozen" : "Active"}
                  </button>
                </div>
                <p className="mt-3 text-xs text-muted-foreground line-clamp-2">
                  {sec.description}
                </p>
                <div className="mt-4 pt-3 border-t border-border/50 text-[11px] font-mono text-muted-foreground space-y-1">
                  <p>{sec.address}</p>
                  <p>
                    {sec.city}, {sec.state} {sec.zip}
                  </p>
                  {sec.phone && (
                    <p className="text-status-success">{sec.phone}</p>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};

export default Metro2;

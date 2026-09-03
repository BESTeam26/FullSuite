// Metro 2 Intelligence Panel — renders the corrected data-integrity analysis.
// Shows the graduated classification (never "Metro 2 Violation"), evidence
// strength, field verdict, the Truth Gate, and recipient-aware statute routing.

import { useState } from "react";
import {
  CheckCircle2,
  MinusCircle,
  HelpCircle,
  FileWarning,
  Scale,
  Gavel,
  ShieldCheck,
  Lock,
  AlertTriangle,
  ChevronDown,
  ChevronUp,
  FileSearch,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  type AnomalyClassification,
  type EvidenceStrength,
  type FieldVerdict,
  type AnomalyResult,
  getAnomalyMeta,
  getEvidenceMeta,
  getFieldVerdictMeta,
} from "@/lib/dispute/metro2-intelligence";

const iconMap: Record<string, typeof CheckCircle2> = {
  CheckCircle2,
  MinusCircle,
  HelpCircle,
  FileWarning,
  Scale,
  Gavel,
};

export const AnomalyCard = ({ result }: { result: AnomalyResult }) => {
  const [expanded, setExpanded] = useState(false);
  const meta = getAnomalyMeta(result.classification);
  const evMeta = getEvidenceMeta(result.evidenceStrength);
  const verdictMeta = getFieldVerdictMeta(result.fieldVerdict);
  const Icon = iconMap[meta.icon] ?? HelpCircle;

  return (
    <div className="rounded-xl border border-border bg-card overflow-hidden">
      <button
        onClick={() => setExpanded((p) => !p)}
        className="flex w-full items-center justify-between p-4 text-left hover:bg-muted/30"
      >
        <div className="flex items-center gap-3">
          <Icon className={`h-5 w-5 ${meta.tone}`} />
          <div>
            <p className="text-sm font-semibold">{result.field}</p>
            <p className="text-xs text-muted-foreground">{meta.label}</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Badge className={meta.chip}>{meta.label}</Badge>
          {expanded ? (
            <ChevronUp className="h-4 w-4 text-muted-foreground" />
          ) : (
            <ChevronDown className="h-4 w-4 text-muted-foreground" />
          )}
        </div>
      </button>

      {expanded && (
        <div className="border-t border-border p-4 space-y-4">
          {/* Observation — separated from legal conclusion */}
          <div>
            <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Observation (Detected Fact)
            </p>
            <p className="mt-1 text-sm text-foreground">{result.observation}</p>
          </div>

          {/* Evidence strength */}
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div className="rounded-lg bg-muted/40 p-3">
              <p className="text-xs text-muted-foreground">Evidence Strength</p>
              <p className={`mt-1 text-sm font-semibold ${evMeta.tone}`}>
                {evMeta.label}
              </p>
              <div className="mt-2 h-1.5 w-full rounded-full bg-muted">
                <div
                  className="h-1.5 rounded-full bg-primary"
                  style={{ width: `${evMeta.weight}%` }}
                />
              </div>
            </div>
            <div className="rounded-lg bg-muted/40 p-3">
              <p className="text-xs text-muted-foreground">Field Verdict</p>
              <p className={`mt-1 text-sm font-semibold ${verdictMeta.tone}`}>
                {verdictMeta.label}
              </p>
              <p className="mt-1 text-xs text-muted-foreground">
                {verdictMeta.description}
              </p>
            </div>
          </div>

          {/* Metro 2 context */}
          <div className="rounded-lg border border-border p-3">
            <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Metro 2 Context
            </p>
            <p className="mt-1 text-sm font-mono">{result.metro2Context}</p>
            <p className="mt-2 text-xs text-muted-foreground">
              Metro 2 is an industry reporting format, not itself the FCRA. A
              deviation is evidence, not a violation.
            </p>
          </div>

          {/* Legal context */}
          {result.legalContext.length > 0 && (
            <div>
              <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Legal Context
              </p>
              <div className="mt-1 flex flex-wrap gap-1.5">
                {result.legalContext.map((c) => (
                  <Badge
                    key={c}
                    variant="outline"
                    className="text-[10px] font-mono"
                  >
                    {c}
                  </Badge>
                ))}
              </div>
            </div>
          )}

          {/* Recommended route & remedy */}
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div className="rounded-lg bg-muted/40 p-3">
              <p className="text-xs text-muted-foreground">Recommended Route</p>
              <p className="mt-1 text-sm">{result.recommendedRoute}</p>
            </div>
            <div className="rounded-lg bg-muted/40 p-3">
              <p className="text-xs text-muted-foreground">Requested Remedy</p>
              <p className="mt-1 text-sm">{result.requestedRemedy}</p>
            </div>
          </div>

          {/* Flags */}
          {result.flags.length > 0 && (
            <div className="space-y-1.5">
              {result.flags.map((f, i) => (
                <div
                  key={i}
                  className="flex items-start gap-2 rounded-lg bg-amber-500/5 p-2 text-xs text-status-warning"
                >
                  <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                  <span>{f}</span>
                </div>
              ))}
            </div>
          )}

          {/* Human review badge */}
          {result.humanReviewRequired && (
            <div className="flex items-center gap-2 rounded-lg bg-red-500/10 p-3 text-xs font-medium text-status-danger">
              <ShieldCheck className="h-4 w-4" />
              Human / counsel review required — the AI never declares a legal
              conclusion.
            </div>
          )}
        </div>
      )}
    </div>
  );
};

// ─── Truth Gate Component ───────────────────────────────────────────────────────

export const TruthGatePanel = ({
  passed,
  blocks,
  requiredForFiling,
}: {
  passed: boolean;
  blocks: string[];
  requiredForFiling: string[];
}) => (
  <div
    className={`rounded-xl border p-5 ${
      passed
        ? "border-emerald-500/40 bg-emerald-500/5"
        : "border-red-500/40 bg-red-500/5"
    }`}
  >
    <div className="flex items-center gap-2">
      {passed ? (
        <Lock className="h-5 w-5 text-status-success" />
      ) : (
        <Lock className="h-5 w-5 text-status-danger" />
      )}
      <h3 className="font-semibold">
        Truth Gate — {passed ? "Passed" : "Blocked"}
      </h3>
    </div>
    <p className="mt-1 text-xs text-muted-foreground">
      Runs before any letter is generated. Enforces CROA's prohibition on
      counseling untrue or misleading statements.
    </p>

    {blocks.length > 0 && (
      <div className="mt-3 space-y-1.5">
        {blocks.map((b, i) => (
          <div
            key={i}
            className="flex items-start gap-2 text-xs text-status-danger"
          >
            <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
            <span>{b}</span>
          </div>
        ))}
      </div>
    )}

    {requiredForFiling.length > 0 && (
      <div className="mt-3 space-y-1.5">
        <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          Required for filing
        </p>
        {requiredForFiling.map((r, i) => (
          <div
            key={i}
            className="flex items-start gap-2 text-xs text-status-warning"
          >
            <FileSearch className="mt-0.5 h-3.5 w-3.5 shrink-0" />
            <span>{r}</span>
          </div>
        ))}
      </div>
    )}

    {passed && (
      <p className="mt-3 text-xs text-status-success">
        Consumer attestation complete — dispute may proceed to drafting.
      </p>
    )}
  </div>
);

// ─── Statute Routing Component ──────────────────────────────────────────────────

export const StatuteRoutingCard = ({
  applicableStatutes,
  incorrectAssignment,
  notes,
  recipient,
}: {
  applicableStatutes: string[];
  incorrectAssignment: string[];
  notes: string[];
  recipient: string;
}) => (
  <div className="rounded-xl border border-border bg-card p-5">
    <div className="flex items-center gap-2">
      <Scale className="h-5 w-5 text-status-success" />
      <h3 className="font-semibold">Recipient-Aware Statute Routing</h3>
    </div>
    <p className="mt-1 text-xs text-muted-foreground">
      Corrects the error of applying §1681e(b) (a CRA duty) to a furnisher.
      Recipient: <span className="font-medium uppercase">{recipient}</span>
    </p>

    <div className="mt-3">
      <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
        Applicable Statutes
      </p>
      <div className="mt-1 flex flex-wrap gap-1.5">
        {applicableStatutes.map((s) => (
          <Badge key={s} className="bg-emerald-500/10 text-status-success">
            {s}
          </Badge>
        ))}
      </div>
    </div>

    {incorrectAssignment.length > 0 && (
      <div className="mt-3 space-y-1.5">
        {incorrectAssignment.map((c, i) => (
          <div
            key={i}
            className="flex items-start gap-2 rounded-lg bg-red-500/5 p-2 text-xs text-status-danger"
          >
            <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
            <span>{c}</span>
          </div>
        ))}
      </div>
    )}

    <div className="mt-3 space-y-1.5">
      {notes.map((n, i) => (
        <div
          key={i}
          className="flex items-start gap-2 rounded-lg bg-muted/40 p-2 text-xs text-muted-foreground"
        >
          <CheckCircle2 className="mt-0.5 h-3.5 w-3.5 shrink-0 text-status-success" />
          <span>{n}</span>
        </div>
      ))}
    </div>
  </div>
);

// ─── Classification Legend ──────────────────────────────────────────────────────

export const ClassificationLegend = () => {
  const items: AnomalyClassification[] = [
    "consistent",
    "observed-difference",
    "potential-anomaly",
    "evidence-supported-inaccuracy",
    "potential-fcra-reg-v-issue",
    "established-violation",
  ];
  return (
    <div className="rounded-xl border border-border bg-card p-5">
      <div className="flex items-center gap-2">
        <FileSearch className="h-5 w-5 text-status-success" />
        <h3 className="font-semibold">Classification Scale</h3>
      </div>
      <p className="mt-1 text-xs text-muted-foreground">
        Replaces the dangerous "Metro 2 Violation" label with a graduated scale.
        The AI never produces "Established Violation" automatically.
      </p>
      <div className="mt-3 space-y-2">
        {items.map((c) => {
          const m = getAnomalyMeta(c);
          const Icon = iconMap[m.icon] ?? HelpCircle;
          return (
            <div key={c} className="flex items-start gap-2">
              <Icon className={`mt-0.5 h-4 w-4 shrink-0 ${m.tone}`} />
              <div>
                <p className={`text-xs font-semibold ${m.tone}`}>{m.label}</p>
                <p className="text-xs text-muted-foreground">{m.description}</p>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};

// ─── Evidence Strength Legend ───────────────────────────────────────────────────

export const EvidenceStrengthLegend = () => {
  const items: EvidenceStrength[] = [
    "unverified-observation",
    "cross-source-discrepancy",
    "consumer-attested-fact",
    "document-supported-fact",
    "authoritative-record",
    "legal-review-required",
  ];
  return (
    <div className="rounded-xl border border-border bg-card p-5">
      <div className="flex items-center gap-2">
        <FileWarning className="h-5 w-5 text-status-success" />
        <h3 className="font-semibold">Evidence Strength</h3>
      </div>
      <p className="mt-1 text-xs text-muted-foreground">
        Prevents treating a weak cross-bureau difference as equivalent to a
        document-supported contradiction.
      </p>
      <div className="mt-3 space-y-2">
        {items.map((s) => {
          const m = getEvidenceMeta(s);
          return (
            <div key={s} className="flex items-center gap-2">
              <div className="h-1.5 w-12 rounded-full bg-muted">
                <div
                  className="h-1.5 rounded-full bg-primary"
                  style={{ width: `${m.weight}%` }}
                />
              </div>
              <span className={`text-xs font-medium ${m.tone}`}>{m.label}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
};

// ─── Field Verdict Legend ───────────────────────────────────────────────────────

export const FieldVerdictLegend = () => {
  const items: FieldVerdict[] = [
    "expected",
    "possible",
    "suspicious",
    "needs-source-document",
    "evidence-supported-inaccuracy",
    "legal-review",
  ];
  return (
    <div className="rounded-xl border border-border bg-card p-5">
      <div className="flex items-center gap-2">
        <HelpCircle className="h-5 w-5 text-status-success" />
        <h3 className="font-semibold">Field Verdict Model</h3>
      </div>
      <p className="mt-1 text-xs text-muted-foreground">
        The engine never says PASS or FAIL — it uses a graduated verdict.
      </p>
      <div className="mt-3 space-y-1.5">
        {items.map((v) => {
          const m = getFieldVerdictMeta(v);
          return (
            <div key={v} className="flex items-start gap-2">
              <span
                className={`mt-0.5 h-2 w-2 shrink-0 rounded-full bg-current ${m.tone}`}
              />
              <div>
                <p className={`text-xs font-semibold ${m.tone}`}>{m.label}</p>
                <p className="text-xs text-muted-foreground">{m.description}</p>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};

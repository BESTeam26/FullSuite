import {
  ArrowRight,
  Mail,
  Upload,
  ShieldAlert,
  Scale,
  Clock,
  Calendar,
  FileText,
  Printer,
  ChevronRight,
  CheckCircle2,
  AlertTriangle,
  Snowflake,
  Send,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useClientWorkspace } from "@/lib/client-workspace-context";
import { getRoundDefinition } from "@/lib/dispute/rounds-and-layers";
import { UspsTrackingPanel } from "./UspsTrackingPanel";

const NextStepsTab = () => {
  const { round, setRound, setTab, roundCycleDays, activeLetters } =
    useClientWorkspace();
  const roundDef = getRoundDefinition(round);
  const nextRound = Math.min(round + 1, 7);
  const nextRoundDef = getRoundDefinition(nextRound);

  const steps = [
    {
      icon: Mail,
      title: "Mail certified letters via LetterStream",
      desc: "Mail all non-Experian letters through the approved mailing workflow. Use certified mail with tracking for paper trail.",
      tone: "text-emerald-600 bg-emerald-500/10",
      done: true,
    },
    {
      icon: Upload,
      title: "Upload Experian disputes to Upload Center",
      desc: "Do NOT mail Experian letters. Upload directly to the Experian Upload Center portal.",
      tone: "text-blue-600 bg-blue-500/10",
      done: true,
    },
    {
      icon: ShieldAlert,
      title: "File FTC reports (collections & inquiries)",
      desc: "Use identitytheft.gov for third-party collections and reportfraud.ftc.gov for unauthorized inquiries. Attach FTC reports to dispute letters and CFPB complaints.",
      tone: "text-red-600 bg-red-500/10",
      done: false,
    },
    {
      icon: Scale,
      title: "File CFPB complaints by category",
      desc: "File separate CFPB complaints for each category: collections, charge-offs, late payments, inquiries, and personal info disputes.",
      tone: "text-amber-600 bg-amber-500/10",
      done: false,
    },
    {
      icon: Clock,
      title: "Wait for CRA response (30–45 days)",
      desc: `Bureaus have 30 days to investigate (up to 45 days in certain circumstances). Next due date is ${roundCycleDays} days from today.`,
      tone: "text-slate-600 bg-slate-500/10",
      done: false,
    },
  ];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="rounded-2xl border border-border bg-card p-6">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <ArrowRight className="h-5 w-5 text-emerald-600" />
            <h2 className="font-semibold">Next steps & escalation route</h2>
            <Badge className="bg-emerald-500/10 text-emerald-600">
              Round {round} · In Dispute
            </Badge>
          </div>
          <div className="flex items-center gap-2 text-xs">
            <span className="text-muted-foreground px-2 py-1">1. Build</span>
            <ChevronRight className="h-4 w-4 text-muted-foreground" />
            <span className="text-muted-foreground px-2 py-1">2. Print</span>
            <ChevronRight className="h-4 w-4 text-muted-foreground" />
            <span className="flex items-center gap-1 font-semibold text-emerald-600 bg-emerald-500/10 px-3 py-1.5 rounded-lg border border-emerald-500/20">
              3. Next Steps
            </span>
          </div>
        </div>
        <p className="mt-1 text-xs text-muted-foreground">
          Follow the TRAP strategy (CRA + FTC + CFPB). Complete each step below,
          then wait for bureau responses before escalating to the next round.
        </p>
      </div>

      {/* Action checklist */}
      <div className="rounded-2xl border border-border bg-card p-6">
        <h3 className="font-semibold">Action checklist</h3>
        <div className="mt-4 space-y-3">
          {steps.map((step, i) => (
            <div
              key={i}
              className="flex items-start gap-3 rounded-xl border border-border bg-muted/20 p-4"
            >
              <span
                className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg ${step.tone}`}
              >
                <step.icon className="h-4 w-4" />
              </span>
              <div className="flex-1">
                <div className="flex items-center gap-2">
                  <p className="text-sm font-medium">{step.title}</p>
                  {step.done ? (
                    <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" />
                  ) : (
                    <Clock className="h-3.5 w-3.5 text-muted-foreground" />
                  )}
                </div>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  {step.desc}
                </p>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* USPS tracking */}
      <UspsTrackingPanel />

      {/* Escalation route preview */}
      <div className="rounded-2xl border border-border bg-card p-6">
        <div className="flex items-center gap-2">
          <Send className="h-4 w-4 text-emerald-600" />
          <h3 className="font-semibold">Escalation route</h3>
        </div>
        <p className="mt-1 text-xs text-muted-foreground">
          After Round {round} responses are received, re-import the report to
          compare before/after, then escalate.
        </p>

        <div className="mt-4 space-y-2">
          {/* Current round */}
          <div className="rounded-xl border-2 border-emerald-500/40 bg-emerald-500/5 p-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Badge className="bg-emerald-600 text-white">Current</Badge>
                <span className="text-sm font-semibold">
                  Round {round}: {roundDef.name}
                </span>
              </div>
              <span className="text-xs text-emerald-600">In progress</span>
            </div>
            <p className="mt-2 text-xs text-muted-foreground">
              {roundDef.focus}
            </p>
            <div className="mt-2 flex flex-wrap gap-1.5">
              {roundDef.layersActivated.map((l) => (
                <span
                  key={l}
                  className="rounded-full bg-emerald-500/10 px-2 py-0.5 text-[10px] font-medium text-emerald-600"
                >
                  Layer {l}
                </span>
              ))}
            </div>
          </div>

          {/* Next round */}
          <div className="rounded-xl border border-dashed border-border bg-muted/20 p-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Badge variant="outline" className="text-muted-foreground">
                  Next
                </Badge>
                <span className="text-sm font-semibold">
                  Round {nextRound}: {nextRoundDef.name}
                </span>
              </div>
              <Button
                size="sm"
                variant="outline"
                onClick={() => {
                  setRound(nextRound);
                  setTab("import");
                }}
              >
                Start Round {nextRound} <ArrowRight className="h-3.5 w-3.5" />
              </Button>
            </div>
            <p className="mt-2 text-xs text-muted-foreground">
              {nextRoundDef.focus}
            </p>
          </div>
        </div>
      </div>

      {/* DIY mailing instructions */}
      <div className="rounded-2xl border border-amber-500/20 bg-amber-500/5 p-5">
        <div className="flex items-start gap-3">
          <Printer className="mt-0.5 h-5 w-5 shrink-0 text-amber-600" />
          <div className="text-sm text-muted-foreground">
            <p className="font-medium text-amber-600">
              DIY mailing instructions
            </p>
            <p className="mt-1">
              Print all letters, attach supporting documents and FTC reports,
              then mail via certified mail with return receipt. Keep the
              certified mail tracking number and receipt as proof of delivery.
              For Experian, upload through the Experian Upload Center instead of
              mailing.
            </p>
          </div>
        </div>
      </div>

      {/* Security freeze option */}
      <div className="rounded-2xl border border-border bg-card p-5">
        <div className="flex items-start gap-3">
          <Snowflake className="mt-0.5 h-5 w-5 shrink-0 text-blue-600" />
          <div className="flex-1">
            <p className="font-medium">Security freeze option</p>
            <p className="mt-1 text-xs text-muted-foreground">
              Place or lift security freezes at all three national bureaus and
              secondary registries (Innovis, ChexSystems). Freezes serve
              consumer-security purposes — do not use as a dispute tactic.
            </p>
            <Button
              size="sm"
              variant="outline"
              className="mt-3"
              onClick={() => setTab("letters")}
            >
              <Snowflake className="h-3.5 w-3.5" /> Build freeze letters
            </Button>
          </div>
        </div>
      </div>

      {/* Active letters summary */}
      {activeLetters.length > 0 && (
        <div className="rounded-2xl border border-border bg-card p-6">
          <div className="flex items-center gap-2">
            <FileText className="h-4 w-4 text-emerald-600" />
            <h3 className="font-semibold">Active letters this round</h3>
          </div>
          <div className="mt-3 space-y-2">
            {activeLetters.map((l) => (
              <div
                key={l.id}
                className="flex items-center justify-between rounded-xl border border-border bg-muted/20 p-3"
              >
                <div>
                  <p className="text-sm font-medium">{l.itemName}</p>
                  <p className="text-xs text-muted-foreground">
                    {l.category} · Due {l.dueDate}
                  </p>
                </div>
                <Badge className="bg-emerald-500/10 text-emerald-600">
                  <CheckCircle2 className="h-3 w-3" /> In Dispute
                </Badge>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Re-import CTA */}
      <div className="flex items-center justify-between rounded-2xl border border-emerald-500/20 bg-emerald-950/80 p-5 text-emerald-50 shadow-sm">
        <div className="flex items-center gap-3">
          <Calendar className="h-5 w-5 text-emerald-400" />
          <div>
            <p className="text-sm font-semibold text-emerald-200">
              Ready for re-import?
            </p>
            <p className="text-xs text-emerald-100/90 leading-relaxed">
              After {roundCycleDays} days, re-import the report to compare
              results
            </p>
          </div>
        </div>
        <Button
          onClick={() => setTab("import")}
          className="bg-gradient-emerald text-white hover:opacity-90"
        >
          Re-import report <ArrowRight className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
};

export default NextStepsTab;

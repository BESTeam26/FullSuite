// Compliance Guardrail Panel — shows the automated pre-send compliance checks
import { ShieldCheck, AlertTriangle, XCircle, Lock } from "lucide-react";
import {
  runComplianceChecks,
  type ComplianceCheck,
} from "@/lib/dispute/package-builder";
import type { ClassifiedItem } from "@/lib/credit-classification";

const stateMeta: Record<
  ComplianceCheck["severity"],
  { icon: typeof ShieldCheck; cls: string }
> = {
  block: { icon: XCircle, cls: "text-red-600" },
  warn: { icon: AlertTriangle, cls: "text-amber-600" },
};

export const ComplianceGuardrailPanel = ({
  items,
}: {
  items: ClassifiedItem[];
}) => {
  const checks = runComplianceChecks(items);
  const blocked = checks.filter(
    (c) => !c.passed && c.severity === "block",
  ).length;
  const allPassed = blocked === 0;

  return (
    <div
      className={`rounded-2xl border p-6 ${
        allPassed
          ? "border-emerald-500/30 bg-emerald-500/5"
          : "border-red-500/30 bg-red-500/5"
      }`}
    >
      <div className="flex items-center gap-2">
        <ShieldCheck
          className={`h-5 w-5 ${allPassed ? "text-emerald-600" : "text-red-600"}`}
        />
        <h2 className="font-semibold">Compliance guardrails</h2>
        <span
          className={`ml-auto rounded-full px-3 py-1 text-xs font-semibold ${
            allPassed
              ? "bg-emerald-500/10 text-emerald-600"
              : "bg-red-500/10 text-red-600"
          }`}
        >
          {allPassed ? "All passed" : `${blocked} blocking`}
        </span>
      </div>

      <div className="mt-5 space-y-2">
        {checks.map((check) => {
          const m = stateMeta[check.severity];
          const Icon = check.passed ? ShieldCheck : m.icon;
          return (
            <div
              key={check.id}
              className={`flex items-start gap-3 rounded-xl border p-3 ${
                check.passed
                  ? "border-emerald-500/20 bg-card"
                  : check.severity === "block"
                    ? "border-red-500/20 bg-red-500/5"
                    : "border-amber-500/20 bg-amber-500/5"
              }`}
            >
              <Icon
                className={`mt-0.5 h-4 w-4 shrink-0 ${
                  check.passed
                    ? "text-emerald-600"
                    : check.severity === "block"
                      ? "text-red-600"
                      : "text-amber-600"
                }`}
              />
              <div>
                <p className="text-sm font-medium">{check.label}</p>
                <p className="text-xs text-muted-foreground">{check.detail}</p>
              </div>
            </div>
          );
        })}
      </div>

      <div className="mt-5 flex items-start gap-2 rounded-xl border border-border bg-muted/30 p-4 text-xs text-muted-foreground">
        <Lock className="mt-0.5 h-3.5 w-3.5 shrink-0 text-emerald-600" />
        <p>
          These checks are hardcoded logic, not AI. The AI never decides a legal
          conclusion — it only assists with drafting language. A human must
          verify and approve every dispute before it is filed.
        </p>
      </div>
    </div>
  );
};

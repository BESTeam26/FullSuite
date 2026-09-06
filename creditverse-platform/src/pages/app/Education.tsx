import { useState } from "react";
import {
  GraduationCap,
  BookOpen,
  CheckCircle2,
  Play,
  Trophy,
  Scale,
  Database,
  FileWarning,
  Sparkles,
  ArrowRight,
  ShieldCheck,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { fcraSections, metro2Fields, violationLibrary } from "@/lib/knowledge";
import { KnowledgeBase } from "@/components/intranet/KnowledgeBase";
import { useAgency } from "@/lib/agency-context";
import { useAuth } from "@/lib/auth/auth-context";
import { usePermissions } from "@/lib/auth/use-permission";

const levelColor: Record<string, string> = {
  Beginner: "bg-emerald-500/10 text-status-success",
  Intermediate: "bg-amber-500/10 text-status-warning",
  Advanced: "bg-purple-500/10 text-purple-600",
};

const edTabs = [
  { key: "articles", label: "Knowledge Base", icon: BookOpen },
  { key: "fcra", label: "FCRA Statutory Guide", icon: Scale },
  { key: "metro2", label: "Metro 2 Field Guide", icon: Database },
  { key: "violations", label: "Violation Library", icon: FileWarning },
] as const;

const Education = () => {
  const [tab, setTab] = useState<(typeof edTabs)[number]["key"]>("articles");
  const agency = useAgency();
  const auth = useAuth();
  const permissions = usePermissions();
  const organizationView = agency.viewMode === "subaccount" && !!agency.activeOrganization;
  const organizationId = organizationView ? agency.activeOrganization!.id : null;
  const canWrite = organizationView ? permissions.canAsMember("settings.manage") : auth.isAgencyStaff;

  return (
    <div className="p-6 md:p-8">
      <div className="mb-8">
        <h1 className="text-2xl font-bold tracking-tight">
          Knowledge Base
        </h1>
        <p className="text-sm text-muted-foreground">
          Your procedures, scripts and guides in one place, with reference
          material on the FCRA and Metro 2 reporting for your team.
        </p>
      </div>


      <div className="mb-6 flex flex-wrap gap-1.5 rounded-xl border border-border bg-card p-1">
        {edTabs.map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-semibold transition-colors ${
              tab === t.key
                ? "bg-emerald-800 text-white shadow-sm"
                : "text-muted-foreground hover:bg-muted"
            }`}
          >
            <t.icon className="h-4 w-4" />
            {t.label}
          </button>
        ))}
      </div>

      {tab === "articles" && (
        <KnowledgeBase
          organizationId={organizationId}
          canWrite={canWrite}
          audienceChoices={
            organizationView
              ? [{ value: "organization", label: "Your team" }, { value: "both", label: "Team and your DIY consumers" }, { value: "consumer", label: "DIY consumers only" }]
              : [{ value: "organization", label: "Every organization's team" }, { value: "both", label: "Every organization and their consumers" }, { value: "bes_internal", label: "BES internal only" }]
          }
        />
      )}

      {tab === "fcra" && (
        <div className="space-y-4">
          <div className="rounded-2xl border border-border bg-card p-6">
            <h2 className="font-semibold">
              Fair Credit Reporting Act (FCRA) Guide
            </h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Core statutory provisions governing consumer report accuracy,
              dispute timelines, disclosure rights, and furnisher duties.
            </p>
          </div>
          <div className="grid gap-4 md:grid-cols-2">
            {fcraSections.map((s) => (
              <div
                key={s.code}
                className="rounded-2xl border border-border bg-card p-6"
              >
                <div className="flex items-center gap-2">
                  <Badge className="bg-emerald-800 text-white font-semibold">
                    {s.code}
                  </Badge>
                  <h3 className="font-semibold">{s.title}</h3>
                </div>
                <p className="mt-1 font-mono text-xs text-muted-foreground">
                  {s.citation}
                </p>
                <p className="mt-3 text-sm text-muted-foreground leading-relaxed">
                  {s.summary}
                </p>
                <div className="mt-4 rounded-xl bg-muted/30 p-4">
                  <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                    Key compliance points
                  </p>
                  <ul className="mt-2 space-y-1.5">
                    {s.keyPoints.map((k) => (
                      <li
                        key={k}
                        className="flex items-start gap-2 text-xs text-muted-foreground"
                      >
                        <ShieldCheck className="mt-0.5 h-3.5 w-3.5 shrink-0 text-status-success" />
                        {k}
                      </li>
                    ))}
                  </ul>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {tab === "metro2" && (
        <div className="space-y-4">
          <div className="rounded-2xl border border-border bg-card p-6">
            <h2 className="font-semibold">Metro 2 Field Reference Guide</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Understand the standardized furnisher data fields used by CRAs.
              Metro 2 is a reporting format, not a dispute letter standard.
            </p>
          </div>
          <div className="grid gap-4 md:grid-cols-2">
            {metro2Fields.map((f) => (
              <div
                key={f.code}
                className="rounded-2xl border border-border bg-card p-6"
              >
                <div className="flex items-center justify-between">
                  <h3 className="font-semibold">{f.label}</h3>
                  <Badge variant="outline">{f.category}</Badge>
                </div>
                <p className="mt-3 text-sm text-muted-foreground leading-relaxed">
                  {f.meaning}
                </p>
                {f.note && (
                  <div className="mt-4 flex items-start gap-2 rounded-xl bg-amber-500/10 p-3 text-xs text-status-warning">
                    <Sparkles className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                    {f.note}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {tab === "violations" && (
        <div className="space-y-4">
          <div className="rounded-2xl border border-border bg-card p-6">
            <h2 className="font-semibold">Consumer Law Violation Patterns</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Red flags and evidence requirements for FCRA, FDCPA, CROA, and
              TSR/Reg V compliance review.
            </p>
          </div>
          <div className="grid gap-4 md:grid-cols-2">
            {violationLibrary.map((v) => (
              <div
                key={v.id}
                className="rounded-2xl border border-border bg-card p-6"
              >
                <div className="flex items-center justify-between">
                  {/* Was bg-gradient-navy + text-white: that gradient does not exist, so
                      this read as white on the light card. */}
                  <Badge className="bg-primary text-primary-foreground">{v.law}</Badge>
                  <span
                    className={`rounded-full px-2.5 py-1 text-xs font-medium ${
                      v.severity === "high"
                        ? "bg-red-500/10 text-status-danger"
                        : v.severity === "caution"
                          ? "bg-amber-500/10 text-status-warning"
                          : "bg-sky-500/10 text-sky-600"
                    }`}
                  >
                    {v.severity.toUpperCase()}
                  </span>
                </div>
                <h3 className="mt-3 font-semibold">{v.title}</h3>
                <p className="font-mono text-xs text-muted-foreground">
                  {v.citation}
                </p>
                <p className="mt-2.5 text-sm text-muted-foreground leading-relaxed">
                  {v.summary}
                </p>

                <div className="mt-4 space-y-3">
                  <div className="rounded-xl border border-border bg-muted/30 p-3">
                    <p className="text-xs font-semibold text-muted-foreground">
                      Red Flags
                    </p>
                    <ul className="mt-1.5 space-y-1 text-xs text-muted-foreground">
                      {v.redFlags.map((r) => (
                        <li key={r} className="flex items-start gap-1.5">
                          <span className="mt-1 h-1 w-1 shrink-0 rounded-full bg-red-500" />
                          {r}
                        </li>
                      ))}
                    </ul>
                  </div>

                  <div>
                    <p className="text-xs font-semibold text-muted-foreground">
                      Required Evidence
                    </p>
                    <div className="mt-1 flex flex-wrap gap-1.5">
                      {v.requiredEvidence.map((e) => (
                        <span
                          key={e}
                          className="rounded-full bg-muted px-2.5 py-1 text-[11px] text-muted-foreground"
                        >
                          {e}
                        </span>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

export default Education;

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

const courses = [
  {
    title: "Understanding your credit report",
    lessons: 6,
    progress: 100,
    level: "Beginner",
    summary:
      "Learn how to read tradelines, payment history profiles, inquiry codes, and public record snapshots.",
  },
  {
    title: "FCRA Factual Disputing Masterclass",
    lessons: 8,
    progress: 60,
    level: "Beginner",
    summary:
      "Move beyond generic template letters. Learn how to structure disputes around specific field inaccuracies and consumer attestations.",
  },
  {
    title: "Metro 2 Data Integrity & Field Inconsistencies",
    lessons: 10,
    progress: 25,
    level: "Intermediate",
    summary:
      "Deep dive into DOFD re-aging, Compliance Condition Codes, PHP grids, and cross-bureau field mismatches.",
  },
  {
    title: "Consumer Law Violations (FDCPA, CROA, TSR/Reg V)",
    lessons: 12,
    progress: 0,
    level: "Advanced",
    summary:
      "Recognize collector misrepresentations, advance-fee restrictions, telemarketing TSR rules, and furnisher direct-dispute exceptions.",
  },
];

const levelColor: Record<string, string> = {
  Beginner: "bg-emerald-500/10 text-emerald-600",
  Intermediate: "bg-amber-500/10 text-amber-600",
  Advanced: "bg-purple-500/10 text-purple-600",
};

const edTabs = [
  { key: "courses", label: "Course catalog", icon: BookOpen },
  { key: "fcra", label: "FCRA Statutory Guide", icon: Scale },
  { key: "metro2", label: "Metro 2 Field Guide", icon: Database },
  { key: "violations", label: "Violation Library", icon: FileWarning },
] as const;

const Education = () => {
  const [tab, setTab] = useState<(typeof edTabs)[number]["key"]>("courses");

  return (
    <div className="p-6 md:p-8">
      <div className="mb-8">
        <h1 className="text-2xl font-bold tracking-tight">
          Credit Law & Education Academy
        </h1>
        <p className="text-sm text-muted-foreground">
          White-label consumer courses, FCRA statutory breakdowns, Metro 2 field
          references, and consumer-law violation guides for your team & DIY
          consumers.
        </p>
      </div>

      <div className="mb-8 grid gap-4 sm:grid-cols-4">
        <div className="rounded-2xl border border-border bg-card p-5">
          <BookOpen className="h-5 w-5 text-emerald-600" />
          <p className="mt-3 text-2xl font-bold">16</p>
          <p className="text-sm text-muted-foreground">Active modules</p>
        </div>
        <div className="rounded-2xl border border-border bg-card p-5">
          <Trophy className="h-5 w-5 text-emerald-600" />
          <p className="mt-3 text-2xl font-bold">847</p>
          <p className="text-sm text-muted-foreground">Enrolled consumers</p>
        </div>
        <div className="rounded-2xl border border-border bg-card p-5">
          <CheckCircle2 className="h-5 w-5 text-emerald-600" />
          <p className="mt-3 text-2xl font-bold">68%</p>
          <p className="text-sm text-muted-foreground">Completion rate</p>
        </div>
        <div className="rounded-2xl border border-emerald-900/40 bg-emerald-950/80 p-5 text-white shadow-md">
          <Sparkles className="h-5 w-5 text-emerald-400" />
          <p className="mt-3 text-2xl font-bold text-white">100%</p>
          <p className="text-xs text-emerald-200 font-medium">
            Evidence-grounded FCRA AI
          </p>
        </div>
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

      {tab === "courses" && (
        <div className="grid gap-6 md:grid-cols-2">
          {courses.map((c) => (
            <div
              key={c.title}
              className="flex flex-col rounded-2xl border border-border bg-card p-6"
            >
              <div className="flex items-start justify-between">
                <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-emerald-800 text-white shadow-sm">
                  <GraduationCap className="h-5 w-5" />
                </div>
                <span
                  className={`rounded-full px-2.5 py-1 text-xs font-medium ${levelColor[c.level]}`}
                >
                  {c.level}
                </span>
              </div>
              <h3 className="mt-4 font-semibold">{c.title}</h3>
              <p className="mt-1 text-xs text-muted-foreground">
                {c.lessons} lessons
              </p>
              <p className="mt-2.5 flex-1 text-sm text-muted-foreground leading-relaxed">
                {c.summary}
              </p>

              <div className="mt-4">
                <div className="flex items-center justify-between text-xs">
                  <span className="text-muted-foreground">Progress</span>
                  <span className="font-medium">{c.progress}%</span>
                </div>
                <div className="mt-1.5 h-1.5 w-full overflow-hidden rounded-full bg-muted">
                  <div
                    className="h-full rounded-full bg-emerald-600"
                    style={{ width: `${c.progress}%` }}
                  />
                </div>
              </div>

              <Button variant="outline" className="mt-4 w-full">
                <Play className="h-4 w-4" />{" "}
                {c.progress > 0 ? "Continue" : "Start course"}
              </Button>
            </div>
          ))}
        </div>
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
                        <ShieldCheck className="mt-0.5 h-3.5 w-3.5 shrink-0 text-emerald-600" />
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
                  <div className="mt-4 flex items-start gap-2 rounded-xl bg-amber-500/10 p-3 text-xs text-amber-700 dark:text-amber-400">
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
                  <Badge className="bg-gradient-navy text-white">{v.law}</Badge>
                  <span
                    className={`rounded-full px-2.5 py-1 text-xs font-medium ${
                      v.severity === "high"
                        ? "bg-red-500/10 text-red-600"
                        : v.severity === "caution"
                          ? "bg-amber-500/10 text-amber-600"
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

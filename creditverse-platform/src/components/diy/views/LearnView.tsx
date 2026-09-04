import { useState } from "react";
import { AlertTriangle } from "lucide-react";
import { fcraSections, metro2Fields, violationLibrary } from "@/lib/knowledge";
import { academyModules } from "./shared";

const iconMap: Record<string, typeof AlertTriangle> = {
  BookOpen: AlertTriangle,
  ScanSearch: AlertTriangle,
  ShieldCheck: AlertTriangle,
  FileCheck2: AlertTriangle,
  Clock: AlertTriangle,
};

export const LearnView = () => {
  const [tab, setTab] = useState<"academy" | "fcra" | "metro2" | "violations">(
    "academy",
  );
  const tabs = [
    { key: "academy", label: "Credit Academy" },
    { key: "fcra", label: "FCRA Law" },
    { key: "metro2", label: "Metro 2" },
    { key: "violations", label: "Consumer Law" },
  ] as const;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Credit Academy</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Understand your report, your rights, and the laws that protect you —
          before you dispute anything.
        </p>
      </div>

      <div className="flex flex-wrap gap-2">
        {tabs.map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`rounded-lg px-3 py-1.5 text-xs font-semibold ${
              tab === t.key
                ? "bg-gradient-emerald text-white"
                : "border border-border bg-card text-muted-foreground"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === "academy" && (
        <div className="grid gap-3 sm:grid-cols-2">
          {academyModules.map((m) => {
            const Icon = iconMap[m.icon] ?? AlertTriangle;
            return (
              <div
                key={m.title}
                className="rounded-2xl border border-border bg-card p-5"
              >
                <Icon className="h-5 w-5 text-status-success" />
                <h3 className="mt-2 text-sm font-semibold">{m.title}</h3>
                <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
                  {m.desc}
                </p>
              </div>
            );
          })}
        </div>
      )}

      {tab === "fcra" && (
        <div className="space-y-3">
          {fcraSections.map((s) => (
            <div
              key={s.code}
              className="rounded-2xl border border-border bg-card p-5"
            >
              <div className="flex items-center gap-2">
                <span className="rounded-md bg-emerald-500/15 px-2 py-0.5 text-[10px] font-bold text-status-success">
                  {s.code}
                </span>
                <h3 className="text-sm font-semibold">{s.title}</h3>
              </div>
              <p className="mt-1 text-[11px] font-mono text-muted-foreground">
                {s.citation}
              </p>
              <p className="mt-2 text-xs leading-relaxed text-muted-foreground">
                {s.summary}
              </p>
              <ul className="mt-3 space-y-1">
                {s.keyPoints.map((p) => (
                  <li
                    key={p}
                    className="flex items-start gap-1.5 text-[11px] text-muted-foreground"
                  >
                    <span className="mt-0.5 text-status-success">›</span> {p}
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      )}

      {tab === "metro2" && (
        <div className="rounded-2xl border border-border bg-card p-5">
          <div className="mb-4 rounded-lg border border-amber-400/20 bg-amber-500/5 p-3 text-[11px] leading-relaxed text-status-warning">
            <AlertTriangle className="mr-1 inline h-3 w-3" />
            Metro 2 is the reporting format furnishers use to send data to
            bureaus. It is not a consumer dispute-letter format. Understanding
            it helps you spot field-level reporting errors.
          </div>
          <div className="space-y-2">
            {metro2Fields.map((f) => (
              <div
                key={f.code}
                className="rounded-xl border border-border bg-navy-deep/40 p-3"
              >
                <div className="flex items-center justify-between">
                  <p className="text-xs font-semibold text-foreground">{f.label}</p>
                  <span className="rounded bg-muted px-2 py-0.5 text-[10px] text-muted-foreground">
                    {f.category}
                  </span>
                </div>
                <p className="mt-1 text-[11px] leading-relaxed text-muted-foreground">
                  {f.meaning}
                </p>
                {f.note && (
                  <p className="mt-1 text-[10px] italic text-status-warning/80">
                    {f.note}
                  </p>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {tab === "violations" && (
        <div className="space-y-3">
          {violationLibrary.slice(0, 8).map((v) => (
            <div
              key={v.id}
              className="rounded-2xl border border-border bg-card p-4"
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span
                    className={`rounded px-2 py-0.5 text-[10px] font-bold ${
                      v.law === "FCRA"
                        ? "bg-emerald-500/15 text-status-success"
                        : v.law === "FDCPA"
                          ? "bg-sky-500/15 text-sky-300"
                          : v.law === "CROA"
                            ? "bg-purple-500/15 text-purple-300"
                            : "bg-amber-500/15 text-status-warning"
                    }`}
                  >
                    {v.law}
                  </span>
                  <h3 className="text-sm font-semibold">{v.title}</h3>
                </div>
                <span
                  className={`text-[10px] font-bold ${
                    v.severity === "high"
                      ? "text-red-300"
                      : v.severity === "caution"
                        ? "text-status-warning"
                        : "text-muted-foreground"
                  }`}
                >
                  {v.severity.toUpperCase()}
                </span>
              </div>
              <p className="mt-1 text-[11px] font-mono text-muted-foreground">
                {v.citation}
              </p>
              <p className="mt-2 text-xs leading-relaxed text-muted-foreground">
                {v.summary}
              </p>
              <div className="mt-2 grid gap-1 sm:grid-cols-2">
                <div>
                  <p className="text-[10px] font-semibold text-status-warning">
                    Red flags
                  </p>
                  <ul className="mt-1 space-y-0.5">
                    {v.redFlags.slice(0, 2).map((r) => (
                      <li key={r} className="text-[10px] text-muted-foreground">
                        • {r}
                      </li>
                    ))}
                  </ul>
                </div>
                <div>
                  <p className="text-[10px] font-semibold text-status-success">
                    Evidence needed
                  </p>
                  <ul className="mt-1 space-y-0.5">
                    {v.requiredEvidence.slice(0, 2).map((r) => (
                      <li key={r} className="text-[10px] text-muted-foreground">
                        • {r}
                      </li>
                    ))}
                  </ul>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

import { useEffect, useMemo, useState } from "react";
import {
  Sparkles,
  Send,
  BookOpen,
  Scale,
  FileWarning,
  Database,
  ChevronRight,
  AlertTriangle,
  ShieldAlert,
} from "lucide-react";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { useCopilot } from "@/lib/copilot-context";
import {
  qaEntries,
  matchQAEntry,
  fcraSections,
  metro2Fields,
  violationLibrary,
  type QAEntry,
} from "@/lib/knowledge";

type Mode = "chat" | "fcra" | "metro2" | "violations";

const severityStyle: Record<string, string> = {
  info: "bg-sky-500/10 text-sky-600",
  caution: "bg-amber-500/10 text-amber-600",
  high: "bg-red-500/10 text-red-600",
};

const suggestions = [
  "What is DOFD and why does it matter?",
  "What makes a dispute factual instead of template?",
  "When are we allowed to bill a client?",
  "What is Metro 2 and can we generate it ourselves?",
];

interface ChatMessage {
  role: "user" | "assistant";
  text: string;
  citations?: string[];
}

export const CopilotPanel = () => {
  const { open, setOpen, topic } = useCopilot();
  const [mode, setMode] = useState<Mode>("chat");
  const [input, setInput] = useState("");
  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      role: "assistant",
      text: "I'm Lina — your AI credit & compliance assistant. I'm trained on FCRA factual-dispute methodology, Metro 2 reporting concepts, and consumer-protection law (FDCPA, CROA, TSR/Reg V). Ask me anything, or open a reference tab below. I explain the law and flag things for review — I never declare a violation on my own. Mom knows best, right? 😊",
    },
  ]);

  useEffect(() => {
    if (open && topic) {
      const match = matchQAEntry(topic);
      const answer: QAEntry = match ?? {
        id: "fallback",
        keywords: [],
        question: topic,
        answer:
          "I don't have a specific reference entry for that yet, but here's how to approach it: identify the exact field or claim in question, compare it across all three bureaus, gather supporting documentation, and route it through the Investigation Workspace for consumer attestation before any dispute language is generated.",
      };
      setMessages((prev) => [
        ...prev,
        { role: "user", text: topic },
        { role: "assistant", text: answer.answer, citations: answer.citations },
      ]);
      setMode("chat");
    }
  }, [open, topic]);

  const send = (text: string) => {
    if (!text.trim()) return;
    const match = matchQAEntry(text);
    const answer =
      match?.answer ??
      "I don't have a precise reference for that exact phrasing yet. Try asking about DOFD, Metro 2 fields, factual dispute structure, FDCPA collector conduct, billing eligibility, or reinsertion rules — or open the FCRA / Metro 2 / Violations tabs below for the full reference library.";
    setMessages((prev) => [
      ...prev,
      { role: "user", text },
      { role: "assistant", text: answer, citations: match?.citations },
    ]);
    setInput("");
  };

  const tabs = useMemo(
    () => [
      { key: "chat" as Mode, label: "Ask AI", icon: Sparkles },
      { key: "fcra" as Mode, label: "FCRA Guide", icon: Scale },
      { key: "metro2" as Mode, label: "Metro 2", icon: Database },
      { key: "violations" as Mode, label: "Violations", icon: FileWarning },
    ],
    [],
  );

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetContent
        side="right"
        className="flex w-full max-w-full flex-col gap-0 overflow-hidden p-0 sm:max-w-md"
      >
        <SheetHeader className="border-b border-border px-5 py-4">
          <SheetTitle className="flex items-center gap-2">
            <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-emerald text-white">
              <Sparkles className="h-4 w-4" />
            </span>
            Lina — AI Credit & Compliance Assistant
          </SheetTitle>
        </SheetHeader>

        <div className="flex gap-1 border-b border-border px-3 py-2">
          {tabs.map((t) => (
            <button
              key={t.key}
              onClick={() => setMode(t.key)}
              className={`flex flex-1 items-center justify-center gap-1.5 rounded-lg px-2 py-2 text-xs font-medium transition-colors ${
                mode === t.key
                  ? "bg-gradient-emerald text-white"
                  : "text-muted-foreground hover:bg-muted"
              }`}
            >
              <t.icon className="h-3.5 w-3.5" /> {t.label}
            </button>
          ))}
        </div>

        {mode === "chat" && (
          <>
            <div className="flex-1 space-y-4 overflow-y-auto px-5 py-4 bg-background">
              {messages.map((m, i) => (
                <div
                  key={i}
                  className={`flex ${m.role === "user" ? "justify-end" : "justify-start"}`}
                >
                  <div
                    className={`max-w-[85%] rounded-2xl px-4 py-2.5 text-sm ${
                      m.role === "user"
                        ? "bg-gradient-emerald text-white"
                        : "border border-border bg-card text-card-foreground shadow-sm"
                    }`}
                  >
                    <p className="whitespace-pre-line leading-relaxed">
                      {m.text}
                    </p>
                    {m.citations && m.citations.length > 0 && (
                      <div className="mt-2 flex flex-wrap gap-1.5">
                        {m.citations.map((c) => (
                          <span
                            key={c}
                            className="rounded-full bg-muted px-2 py-0.5 font-mono text-[10px] text-muted-foreground border border-border"
                          >
                            {c}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              ))}

              {messages.length <= 1 && (
                <div className="space-y-2 pt-2">
                  <p className="text-xs font-semibold text-foreground">
                    Try asking:
                  </p>
                  {suggestions.map((s) => (
                    <button
                      key={s}
                      onClick={() => send(s)}
                      className="flex w-full items-center justify-between rounded-xl border border-border bg-card px-3.5 py-2.5 text-left text-sm font-medium text-foreground shadow-sm hover:border-emerald-500/40 hover:bg-emerald-500/5 transition-colors"
                    >
                      {s}
                      <ChevronRight className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                    </button>
                  ))}
                </div>
              )}
            </div>

            <div className="border-t border-border p-3 bg-card">
              <div className="flex items-center gap-2 rounded-xl border border-border bg-background px-3 py-2">
                <input
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && send(input)}
                  placeholder="Ask about FCRA, Metro 2, FDCPA, CROA…"
                  className="flex-1 bg-transparent text-sm text-foreground outline-none placeholder:text-muted-foreground"
                />
                <button
                  onClick={() => send(input)}
                  className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-gradient-emerald text-white"
                >
                  <Send className="h-3.5 w-3.5" />
                </button>
              </div>
              <p className="mt-2 flex items-start gap-1.5 text-[11px] leading-snug text-muted-foreground">
                <ShieldAlert className="mt-0.5 h-3 w-3 shrink-0" />
                Educational guidance only, not legal advice. Have qualified
                counsel review consumer-specific situations.
              </p>
            </div>
          </>
        )}

        {mode === "fcra" && (
          <div className="flex-1 space-y-3 overflow-y-auto px-5 py-4">
            {fcraSections.map((s) => (
              <div
                key={s.code}
                className="rounded-xl border border-border bg-card p-4"
              >
                <div className="flex items-center gap-2">
                  <span className="rounded-full bg-gradient-emerald px-2 py-0.5 text-[10px] font-bold text-white">
                    {s.code}
                  </span>
                  <h3 className="text-sm font-semibold">{s.title}</h3>
                </div>
                <p className="mt-1 font-mono text-[11px] text-muted-foreground">
                  {s.citation}
                </p>
                <p className="mt-2 text-sm text-muted-foreground">
                  {s.summary}
                </p>
                <ul className="mt-2 space-y-1">
                  {s.keyPoints.map((k) => (
                    <li
                      key={k}
                      className="flex items-start gap-1.5 text-xs text-muted-foreground"
                    >
                      <span className="mt-1 h-1 w-1 shrink-0 rounded-full bg-emerald-500" />
                      {k}
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        )}

        {mode === "metro2" && (
          <div className="flex-1 space-y-3 overflow-y-auto px-5 py-4">
            <div className="flex items-start gap-2 rounded-xl border border-amber-500/30 bg-amber-500/10 p-3 text-xs text-amber-700 dark:text-amber-400">
              <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
              Metro 2 is a furnisher reporting format, not a consumer dispute
              format. These are conceptual references for factual analysis only.
            </div>
            {metro2Fields.map((f) => (
              <div
                key={f.code}
                className="rounded-xl border border-border bg-card p-4"
              >
                <div className="flex items-center justify-between gap-2">
                  <h3 className="text-sm font-semibold">{f.label}</h3>
                  <span className="shrink-0 rounded-full bg-muted px-2 py-0.5 text-[10px] font-medium text-muted-foreground">
                    {f.category}
                  </span>
                </div>
                <p className="mt-2 text-sm text-muted-foreground">
                  {f.meaning}
                </p>
                {f.note && (
                  <p className="mt-2 rounded-lg bg-muted/50 p-2 text-[11px] text-muted-foreground">
                    {f.note}
                  </p>
                )}
              </div>
            ))}
          </div>
        )}

        {mode === "violations" && (
          <div className="flex-1 space-y-3 overflow-y-auto px-5 py-4">
            {violationLibrary.map((v) => (
              <div
                key={v.id}
                className="rounded-xl border border-border bg-card p-4"
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="rounded-full bg-muted px-2 py-0.5 text-[10px] font-semibold text-muted-foreground">
                    {v.law}
                  </span>
                  <span
                    className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${severityStyle[v.severity]}`}
                  >
                    {v.severity === "high"
                      ? "High priority"
                      : v.severity === "caution"
                        ? "Needs review"
                        : "Informational"}
                  </span>
                </div>
                <h3 className="mt-2 text-sm font-semibold">{v.title}</h3>
                <p className="font-mono text-[11px] text-muted-foreground">
                  {v.citation}
                </p>
                <p className="mt-2 text-sm text-muted-foreground">
                  {v.summary}
                </p>
                <div className="mt-2">
                  <p className="text-[11px] font-semibold text-muted-foreground">
                    Red flags
                  </p>
                  <ul className="mt-1 space-y-1">
                    {v.redFlags.map((r) => (
                      <li
                        key={r}
                        className="flex items-start gap-1.5 text-xs text-muted-foreground"
                      >
                        <span className="mt-1 h-1 w-1 shrink-0 rounded-full bg-red-500" />
                        {r}
                      </li>
                    ))}
                  </ul>
                </div>
                <div className="mt-2">
                  <p className="text-[11px] font-semibold text-muted-foreground">
                    Evidence needed
                  </p>
                  <div className="mt-1 flex flex-wrap gap-1.5">
                    {v.requiredEvidence.map((e) => (
                      <span
                        key={e}
                        className="rounded-full bg-muted px-2 py-0.5 text-[10px] text-muted-foreground"
                      >
                        {e}
                      </span>
                    ))}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
};

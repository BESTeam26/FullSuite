import { useState } from "react";
import {
  Copy,
  Check,
  Mail,
  MessageSquare,
  Sparkles,
  Pencil,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import type { GeneratedProgressUpdate } from "@/lib/progress-report-logic";

const tabs = [
  { key: "clientFacingSummary", label: "1️⃣ Client-Facing Summary" },
  { key: "affiliateSummary", label: "2️⃣ Affiliate Summary" },
  { key: "clientSms", label: "📱 Client SMS" },
] as const;

export function ProgressReportNarrative({
  generated,
  onEdit,
}: {
  generated: GeneratedProgressUpdate;
  onEdit: (
    key: keyof GeneratedProgressUpdate["sections"],
    value: string,
  ) => void;
}) {
  const [tab, setTab] = useState<(typeof tabs)[number]["key"]>(
    "clientFacingSummary",
  );
  const [copied, setCopied] = useState(false);
  const [editing, setEditing] = useState(false);

  const activeText = generated.sections[tab];

  const handleCopy = () => {
    navigator.clipboard?.writeText(activeText);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  return (
    <div className="rounded-2xl border border-border bg-card">
      <div className="flex items-center gap-2 border-b border-border p-5">
        <Sparkles className="h-5 w-5 text-status-success" />
        <div>
          <h2 className="font-semibold">AI-Generated Progress Update</h2>
          <p className="text-xs text-muted-foreground">
            Built directly from the verified data above. No fabricated outcomes,
            no promised results.
          </p>
        </div>
      </div>

      <div className="flex flex-wrap gap-1.5 border-b border-border p-3">
        {tabs.map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`rounded-lg px-3 py-1.5 text-xs font-medium transition-colors ${
              tab === t.key
                ? "bg-gradient-emerald text-white"
                : "bg-muted text-muted-foreground hover:text-foreground"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      <div className="p-5">
        {editing ? (
          <Textarea
            value={activeText}
            onChange={(e) =>
              onEdit(
                tab as keyof GeneratedProgressUpdate["sections"],
                e.target.value,
              )
            }
            rows={tab === "clientSms" ? 4 : 10}
            className="text-sm"
          />
        ) : (
          <div className="whitespace-pre-line rounded-xl bg-muted/30 p-4 text-sm leading-relaxed">
            {activeText}
          </div>
        )}

        <div className="mt-4 flex flex-wrap items-center gap-2">
          <Button
            size="sm"
            variant="outline"
            onClick={() => setEditing((e) => !e)}
          >
            <Pencil className="h-3.5 w-3.5" />
            {editing ? "Done editing" : "Manually correct"}
          </Button>
          <Button size="sm" variant="outline" onClick={handleCopy}>
            {copied ? (
              <Check className="h-3.5 w-3.5 text-status-success" />
            ) : (
              <Copy className="h-3.5 w-3.5" />
            )}
            {copied ? "Copied" : "Copy text"}
          </Button>
          {tab === "clientSms" ? (
            <Button
              size="sm"
              className="bg-gradient-emerald text-white hover:opacity-90"
            >
              <MessageSquare className="h-3.5 w-3.5" /> Send SMS to client
            </Button>
          ) : (
            <Button
              size="sm"
              className="bg-gradient-emerald text-white hover:opacity-90"
            >
              <Mail className="h-3.5 w-3.5" /> Email to client
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}

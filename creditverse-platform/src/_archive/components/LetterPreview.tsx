// Letter Preview — shows the AI-drafted dispute letter for a single item
import { useState } from "react";
import {
  Eye,
  X,
  Copy,
  CheckCircle2,
  Sparkles,
  Upload,
  Mail,
  ShieldAlert,
  Scale,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { generateDisputeDraft } from "@/lib/dispute/package-builder";
import { getItemLetterCategory, ftcResourceFor } from "@/lib/dispute/letters-and-channels";
import type { ClassifiedItem } from "@/lib/credit-classification";

export const LetterPreview = ({
  item,
  round,
  onClose,
}: {
  item: ClassifiedItem | null;
  round: number;
  onClose: () => void;
}) => {
  const [copied, setCopied] = useState(false);
  const [aiTone, setAiTone] = useState<
    "legal" | "concerned" | "annoyed" | "firm"
  >("legal");
  const [customText, setCustomText] = useState<string | null>(null);

  if (!item) return null;

  const rawDraft = generateDisputeDraft(item, round);
  const cat = getItemLetterCategory(item);
  /* Archived screen — see CategoryLettersPanel. No recorded statement, so no resource. */
  const ftcRule = ftcResourceFor(item.category, undefined);
  const hasExperian = item.bureaus.includes("EX");
  const hasNonExperian = item.bureaus.some((b) => b !== "EX");

  const rewriteWithTone = (
    tone: "legal" | "concerned" | "annoyed" | "firm",
  ) => {
    setAiTone(tone);
    let modified = rawDraft;
    if (tone === "concerned") {
      modified = modified.replace(
        /I am writing to formally dispute/g,
        "I am reviewing my credit file and am deeply concerned about",
      );
      modified = modified.replace(
        /Under 15 U.S.C. § 1681i/g,
        "Please examine this item under FCRA rules as it appears erroneous:",
      );
    } else if (tone === "annoyed") {
      modified = modified.replace(
        /I am writing to formally dispute/g,
        "I have repeatedly reviewed this account and am frustrated by the inaccurate reporting of",
      );
      modified = modified.replace(
        /Please reinvestigate and delete or correct/g,
        "I insist on an immediate audit and deletion of this inaccurate tradeline",
      );
    } else if (tone === "firm") {
      modified = modified.replace(
        /I am writing to formally dispute/g,
        "Notice of Formal Dispute regarding",
      );
      modified = modified.replace(
        /Please reinvestigate/g,
        "Reinvestigate immediately and provide written verification within 30 days",
      );
    }
    setCustomText(modified);
  };

  const draft = customText ?? rawDraft;

  const copyToClipboard = () => {
    navigator.clipboard?.writeText(draft);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
      onClick={onClose}
    >
      <div
        className="flex max-h-[90vh] w-full max-w-3xl flex-col overflow-hidden rounded-2xl border border-border bg-card"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-border p-5">
          <div className="flex items-center gap-2">
            <Eye className="h-5 w-5 text-emerald-600" />
            <h2 className="font-semibold">Dispute letter preview</h2>
            <Badge className="bg-muted text-muted-foreground">
              {cat?.label ?? "Dispute"}
            </Badge>
          </div>
          <button
            onClick={onClose}
            className="flex h-8 w-8 items-center justify-center rounded-lg border border-border hover:bg-muted"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="overflow-y-auto p-6">
          {/* Filing channels */}
          <div className="mb-4 flex flex-wrap gap-2">
            {hasExperian && (
              <span className="flex items-center gap-1.5 rounded-full bg-blue-500/10 px-3 py-1.5 text-xs font-medium text-blue-600">
                <Upload className="h-3.5 w-3.5" /> Experian: Upload only
              </span>
            )}
            {hasNonExperian && (
              <span className="flex items-center gap-1.5 rounded-full bg-emerald-500/10 px-3 py-1.5 text-xs font-medium text-emerald-600">
                <Mail className="h-3.5 w-3.5" /> Mail via LetterStream
              </span>
            )}
            {ftcRule && (
              <span className="flex items-center gap-1.5 rounded-full bg-red-500/10 px-3 py-1.5 text-xs font-medium text-red-600">
                <ShieldAlert className="h-3.5 w-3.5" /> FTC: {ftcRule.url}
              </span>
            )}
            <span className="flex items-center gap-1.5 rounded-full bg-amber-500/10 px-3 py-1.5 text-xs font-medium text-amber-600">
              <Scale className="h-3.5 w-3.5" /> CFPB by category
            </span>
          </div>

          {/* AI Tone Rewriter bar */}
          <div className="mb-4 rounded-xl border border-emerald-500/20 bg-emerald-500/5 p-4 space-y-2">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="flex items-center gap-1.5 text-xs font-semibold text-emerald-700">
                <Sparkles className="h-4 w-4 text-emerald-600" /> AI Letter Tone
                & Anti-Template Variator
              </span>
              <div className="flex flex-wrap gap-1">
                {(["legal", "firm", "concerned", "annoyed"] as const).map(
                  (t) => (
                    <button
                      key={t}
                      onClick={() => rewriteWithTone(t)}
                      className={`rounded-lg px-2.5 py-1 text-xs font-medium capitalize transition-all ${
                        aiTone === t
                          ? "bg-emerald-600 text-white shadow-sm"
                          : "bg-background border border-border text-muted-foreground hover:bg-muted"
                      }`}
                    >
                      {t}
                    </button>
                  ),
                )}
              </div>
            </div>
            <p className="text-[11px] text-muted-foreground">
              Varies paragraph phrasing dynamically to prevent credit bureau
              optical scanners (e-OSCAR) from flagging templates.
            </p>
          </div>

          {/* Letter content */}
          <div className="rounded-xl border border-border bg-muted/20 p-5 space-y-4">
            <pre className="whitespace-pre-wrap font-sans text-sm leading-relaxed text-foreground">
              {draft}
            </pre>
          </div>

          {/* Item detail */}
          <div className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-4">
            <div className="rounded-lg border border-border bg-muted/30 p-3">
              <p className="text-[10px] font-medium uppercase text-muted-foreground">
                Account
              </p>
              <p className="mt-1 text-sm font-medium">{item.name}</p>
            </div>
            <div className="rounded-lg border border-border bg-muted/30 p-3">
              <p className="text-[10px] font-medium uppercase text-muted-foreground">
                Balance
              </p>
              <p className="mt-1 text-sm font-medium">{item.balance ?? "—"}</p>
            </div>
            <div className="rounded-lg border border-border bg-muted/30 p-3">
              <p className="text-[10px] font-medium uppercase text-muted-foreground">
                DOFD
              </p>
              <p className="mt-1 text-sm font-medium">{item.dofd ?? "—"}</p>
            </div>
            <div className="rounded-lg border border-border bg-muted/30 p-3">
              <p className="text-[10px] font-medium uppercase text-muted-foreground">
                Bureaus
              </p>
              <p className="mt-1 text-sm font-medium">
                {item.bureaus.join(", ")}
              </p>
            </div>
          </div>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border p-5">
          <p className="text-xs text-muted-foreground">
            Consumer attestation required before filing. This letter cannot be
            sent without a separate QA pass.
          </p>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={copyToClipboard}>
              {copied ? (
                <>
                  <CheckCircle2 className="h-3.5 w-3.5" /> Copied
                </>
              ) : (
                <>
                  <Copy className="h-3.5 w-3.5" /> Copy text
                </>
              )}
            </Button>
            <Button
              size="sm"
              className="bg-gradient-emerald text-white hover:opacity-90"
              onClick={onClose}
            >
              <CheckCircle2 className="h-3.5 w-3.5" /> Approve & close
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
};

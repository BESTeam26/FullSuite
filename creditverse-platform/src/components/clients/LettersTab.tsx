import { useState } from "react";
import { formatDate } from "@/lib/format-date";
import {
  FileText,
  Send,
  ArrowRight,
  CheckCircle2,
  Sparkles,
  Edit3,
  Save,
  Copy,
  X,
  ChevronRight,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  useClientWorkspace,
  type ActiveLetter,
} from "@/lib/client-workspace-context";
import {
  buildDisputePackage,
  generateDisputeDraft,
} from "@/lib/dispute/package-builder";
import { RoundEscalationPanel } from "./dispute-flow/RoundEscalationPanel";
import { TrapStrategyPanel } from "./dispute-flow/TrapStrategyPanel";
import { ComplianceGuardrailPanel } from "./dispute-flow/ComplianceGuardrailPanel";
import { LegalPathPanel } from "./dispute-flow/LegalPathPanel";
import {
  BuilderSelectorPanel,
  type BuilderMode,
} from "./dispute-flow/BuilderSelectorPanel";
import { getItemLetterCategory } from "@/lib/dispute/letters-and-channels";
import type { ClassifiedItem } from "@/lib/credit-classification";
import { RoundLettersPanel } from "./letters/RoundLettersPanel";

interface LettersTabProps {
  /** Live client (uuid) → the round-letters builder on real templates and rounds; absent → the sample builder. */
  liveClientId?: string | null;
  liveClientName?: string | null;
}

const LettersTab = ({ liveClientId = null, liveClientName = null }: LettersTabProps = {}) => {
  const { items, round, setRound, setTab, addActiveLetter, roundCycleDays } =
    useClientWorkspace();
  const [editingItem, setEditingItem] = useState<ClassifiedItem | null>(null);
  const [editText, setEditText] = useState("");
  const [selectedBuilder, setSelectedBuilder] = useState<BuilderMode | null>(
    null,
  );

  const pkg = buildDisputePackage(items, round);

  const handleGenerateMode = (mode: BuilderMode) => {
    setSelectedBuilder(mode);
  };

  const openEditor = (item: ClassifiedItem) => {
    setEditingItem(item);
    setEditText(generateDisputeDraft(item, round));
  };

  const saveLetter = () => {
    if (!editingItem) return;
    const cat = getItemLetterCategory(editingItem);
    const dueDate = new Date();
    dueDate.setDate(dueDate.getDate() + roundCycleDays);
    const letter: ActiveLetter = {
      id: crypto.randomUUID(),
      itemName: editingItem.name,
      category: cat?.label ?? "Dispute",
      builderMode: selectedBuilder ?? "factual",
      bureaus: editingItem.bureaus,
      generatedDate: formatDate(new Date()),
      dueDate: formatDate(dueDate),
      status: "draft",
      body: editText,
      attachments: [],
    };
    addActiveLetter(letter);
    setEditingItem(null);
    setTab("print");
  };

  if (liveClientId) {
    return (
      <div className="space-y-6">
        <div className="rounded-2xl border border-border bg-card p-6">
          <h2 className="text-base font-bold text-foreground">Letter Builder</h2>
          <p className="mt-1 text-xs text-muted-foreground">
            Round letters on the Letter Library's templates, filled from this client's own report items and the consumer's attestation. Facts from the report, wording from the template, approval by a person, clocks from the mailing date.
          </p>
        </div>
        <RoundLettersPanel clientId={liveClientId} clientName={liveClientName ?? "Consumer"} items={items} disputeOrigin="cro_prepared" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Pipeline header */}
      <div className="rounded-2xl border border-border bg-card p-6">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <FileText className="h-5 w-5 text-status-success" />
            <h2 className="font-semibold">Letter Builder</h2>
            <Badge className="bg-muted text-muted-foreground">
              Round {round} · {pkg.totalItems} items
            </Badge>
          </div>
          <div className="flex items-center gap-2 text-xs">
            <span className="flex items-center gap-1 font-semibold text-status-success bg-emerald-500/10 px-3 py-1.5 rounded-lg border border-emerald-500/20">
              1. Build Letters
            </span>
            <ChevronRight className="h-4 w-4 text-muted-foreground" />
            <span className="text-muted-foreground px-2 py-1">2. Print</span>
            <ChevronRight className="h-4 w-4 text-muted-foreground" />
            <span className="text-muted-foreground px-2 py-1">
              3. Next Steps
            </span>
          </div>
        </div>
      </div>

      {/* Round escalation + TRAP */}
      <RoundEscalationPanel round={round} onRoundChange={setRound} />
      <TrapStrategyPanel pkg={pkg} />

      {/* Builder selector — choose Factual / Metro2 / Freeze / Hybrid */}
      <BuilderSelectorPanel pkg={pkg} onGenerateMode={handleGenerateMode} />

      {/* Legal path decision engine */}
      <LegalPathPanel />

      {/* Compliance guardrails */}
      <ComplianceGuardrailPanel items={items} />

      {/* Items ready for letter creation */}
      <div className="rounded-2xl border border-border bg-card p-6">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Sparkles className="h-4 w-4 text-status-success" />
            <h2 className="font-semibold">
              Dispute items — create & edit letters
            </h2>
          </div>
          <Badge className="bg-emerald-500/10 text-status-success">
            {pkg.totalItems} ready
          </Badge>
        </div>
        <p className="mt-1 text-xs text-muted-foreground">
          Select a builder mode above, then click "View & Edit" on each item to
          review, edit, and save the generated letter. Saved letters move to the
          Print step.
        </p>

        <div className="mt-4 space-y-2">
          {pkg.items.map((pkgItem) => {
            const cat = getItemLetterCategory(pkgItem.item);
            return (
              <div
                key={pkgItem.item.id}
                className="flex flex-col gap-3 rounded-xl border border-border bg-muted/20 p-4 sm:flex-row sm:items-center sm:justify-between"
              >
                <div className="flex items-start gap-3">
                  <FileText className="mt-0.5 h-4 w-4 text-status-success" />
                  <div>
                    <p className="text-sm font-medium">{pkgItem.item.name}</p>
                    <p className="text-xs text-muted-foreground">
                      {cat?.label ?? "Dispute"} ·{" "}
                      {pkgItem.item.bureaus.join(", ")}
                      {pkgItem.ftcRequired &&
                        !pkgItem.ftcBlocked &&
                        " · FTC required"}
                      {pkgItem.cfpbCategory &&
                        ` · CFPB: ${pkgItem.cfpbCategory}`}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  {pkgItem.experianUploadOnly &&
                    pkgItem.item.bureaus.includes("EX") && (
                      <Badge className="bg-blue-500/10 text-status-info text-[10px]">
                        Experian: Upload only
                      </Badge>
                    )}
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => openEditor(pkgItem.item)}
                  >
                    <Edit3 className="h-3.5 w-3.5" /> View & Edit
                  </Button>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Proceed to print */}
      <div className="flex items-center justify-between rounded-2xl border border-emerald-500/20 bg-emerald-950/80 p-5 text-emerald-50 shadow-sm">
        <div className="flex items-center gap-3">
          <CheckCircle2 className="h-5 w-5 text-emerald-400" />
          <div>
            <p className="text-sm font-semibold text-emerald-200">
              Letters saved
            </p>
            <p className="text-xs text-emerald-100/90 leading-relaxed">
              Print, download, and attach documents in the next step
            </p>
          </div>
        </div>
        <Button
          onClick={() => setTab("print")}
          className="bg-gradient-emerald text-white hover:opacity-90"
        >
          <Send className="h-4 w-4" /> Go to Print & Download{" "}
          <ArrowRight className="h-4 w-4" />
        </Button>
      </div>

      {/* Letter editor modal */}
      {editingItem && (
        <LetterEditorModal
          item={editingItem}
          text={editText}
          setText={setEditText}
          builderMode={selectedBuilder}
          onClose={() => setEditingItem(null)}
          onSave={saveLetter}
        />
      )}
    </div>
  );
};

const LetterEditorModal = ({
  item,
  text,
  setText,
  builderMode,
  onClose,
  onSave,
}: {
  item: ClassifiedItem;
  text: string;
  setText: (t: string) => void;
  builderMode: BuilderMode | null;
  onClose: () => void;
  onSave: () => void;
}) => {
  const [copied, setCopied] = useState(false);
  const cat = getItemLetterCategory(item);

  const copyToClipboard = () => {
    navigator.clipboard?.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
      onClick={onClose}
    >
      <div
        className="flex max-h-[92vh] w-full max-w-5xl flex-col overflow-hidden rounded-2xl border border-border bg-card"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-border p-5">
          <div className="flex items-center gap-2">
            <Edit3 className="h-5 w-5 text-status-success" />
            <h2 className="font-semibold">View & edit dispute letter</h2>
            <Badge className="bg-muted text-muted-foreground">
              {cat?.label ?? "Dispute"}
            </Badge>
            {builderMode && (
              <Badge className="bg-emerald-500/10 text-status-success text-[10px] capitalize">
                {builderMode}
              </Badge>
            )}
          </div>
          <button
            onClick={onClose}
            className="flex h-8 w-8 items-center justify-center rounded-lg border border-border hover:bg-muted"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="overflow-y-auto p-6">
          <div className="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
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

          <div className="mb-3 flex items-center justify-between">
            <span className="text-xs font-medium text-muted-foreground">
              Edit the letter below — the dispute reason and item details are
              auto-attached
            </span>
            <Button variant="outline" size="sm" onClick={copyToClipboard}>
              {copied ? (
                <>
                  <CheckCircle2 className="h-3.5 w-3.5" /> Copied
                </>
              ) : (
                <>
                  <Copy className="h-3.5 w-3.5" /> Copy
                </>
              )}
            </Button>
          </div>

          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            rows={26}
            className="w-full rounded-xl border border-border bg-muted/20 p-4 font-sans text-sm leading-relaxed text-foreground focus:outline-none focus:ring-2 focus:ring-emerald-500/40"
          />
        </div>

        <div className="flex items-center justify-between gap-3 border-t border-border p-5">
          <p className="text-xs text-muted-foreground">
            Consumer attestation required before filing. Saving moves this
            letter to the Print step.
          </p>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={onClose}>
              Cancel
            </Button>
            <Button
              size="sm"
              className="bg-gradient-emerald text-white hover:opacity-90"
              onClick={onSave}
            >
              <Save className="h-3.5 w-3.5" /> Save letter
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default LettersTab;

import { useState } from "react";
import { formatDate } from "@/lib/format-date";
import {
  Printer,
  Download,
  FileText,
  Paperclip,
  Plus,
  Mail,
  ShieldAlert,
  Scale,
  CheckCircle2,
  Calendar,
  ArrowRight,
  ChevronRight,
  Loader2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useClientWorkspace } from "@/lib/client-workspace-context";

const POSSIBLE_ATTACHMENTS = [
  "Driver's License",
  "Proof of Residency",
  "Settlement Agreement",
  "Bank Statement",
  "Payment Receipt",
  "FTC Identity Theft Report",
  "Police Report",
  "Bankruptcy Schedules",
  "Creditor Statement",
  "Court Document",
];

type AttachmentMap = Record<string, Array<string>>;

const PrintTab = () => {
  const { activeLetters, setTab, roundCycleDays, round } = useClientWorkspace();
  const [attachments, setAttachments] = useState<AttachmentMap>({});
  const [showAttachPicker, setShowAttachPicker] = useState<string | null>(null);
  const [printed, setPrinted] = useState<Set<string>>(new Set());
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [batchExporting, setBatchExporting] = useState(false);

  const toggleAttachment = (letterId: string, att: string) => {
    setAttachments((prev) => {
      const current = prev[letterId] ?? [];
      const next = current.includes(att)
        ? current.filter((a) => a !== att)
        : [...current, att];
      return { ...prev, [letterId]: next };
    });
  };

  const markPrinted = (letterId: string) => {
    setPrinted((prev) => new Set(prev).add(letterId));
  };

  const toggleSelect = (letterId: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(letterId)) next.delete(letterId);
      else next.add(letterId);
      return next;
    });
  };

  const selectAll = () => {
    if (selected.size === activeLetters.length) setSelected(new Set());
    else setSelected(new Set(activeLetters.map((l) => l.id)));
  };

  const runBatchExport = () => {
    if (selected.size === 0) return;
    setBatchExporting(true);
    setTimeout(() => {
      setBatchExporting(false);
      selected.forEach((id) => setPrinted((prev) => new Set(prev).add(id)));
    }, 1800);
  };

  const allPrinted =
    activeLetters.length > 0 && printed.size === activeLetters.length;

  return (
    <div className="space-y-6">
      <div className="rounded-2xl border border-border bg-card p-6">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Printer className="h-5 w-5 text-status-success" />
            <h2 className="font-semibold">Print & download letters</h2>
            <Badge className="bg-muted text-muted-foreground">
              {activeLetters.length} letter
              {activeLetters.length === 1 ? "" : "s"}
            </Badge>
          </div>
          <div className="flex items-center gap-2 text-xs">
            <span className="text-muted-foreground px-2 py-1">1. Build</span>
            <ChevronRight className="h-4 w-4 text-muted-foreground" />
            <span className="flex items-center gap-1 font-semibold text-status-success bg-emerald-500/10 px-3 py-1.5 rounded-lg border border-emerald-500/20">
              2. Print
            </span>
            <ChevronRight className="h-4 w-4 text-muted-foreground" />
            <span className="text-muted-foreground px-2 py-1">
              3. Next Steps
            </span>
          </div>
        </div>
        <p className="mt-1 text-xs text-muted-foreground">
          Attach supporting documents, print or download each letter, then mark
          as sent. The next due date is auto-calculated ({roundCycleDays} days
          from today).
        </p>
      </div>

      {/* Bulk batch export bar */}
      {activeLetters.length > 0 && (
        <div className="sticky top-2 z-10 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-border bg-card/95 p-4 shadow-sm backdrop-blur">
          <div className="flex items-center gap-3">
            <button
              onClick={selectAll}
              className="flex h-5 w-5 items-center justify-center rounded border border-emerald-500 text-status-success"
            >
              {selected.size === activeLetters.length && (
                <CheckCircle2 className="h-3.5 w-3.5" />
              )}
            </button>
            <span className="text-sm font-medium">
              {selected.size} of {activeLetters.length} selected
            </span>
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              disabled={selected.size === 0 || batchExporting}
              onClick={runBatchExport}
            >
              {batchExporting ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <Download className="h-3.5 w-3.5" />
              )}
              Download batch PDF
            </Button>
            <Button
              size="sm"
              disabled={selected.size === 0 || batchExporting}
              onClick={runBatchExport}
              className="bg-gradient-emerald text-white hover:opacity-90"
            >
              {batchExporting ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <Printer className="h-3.5 w-3.5" />
              )}
              Batch print &amp; mark sent
            </Button>
          </div>
        </div>
      )}

      {activeLetters.length === 0 ? (
        <div className="flex flex-col items-center gap-2 rounded-2xl border border-border bg-card py-16 text-center">
          <FileText className="h-8 w-8 text-muted-foreground" />
          <p className="font-medium">No letters saved yet</p>
          <p className="text-sm text-muted-foreground">
            Build and save letters in the Letter Builder first.
          </p>
          <Button
            onClick={() => setTab("letters")}
            className="mt-2 bg-gradient-emerald text-white"
          >
            Go to Letter Builder
          </Button>
        </div>
      ) : (
        <div className="space-y-3">
          {activeLetters.map((letter) => {
            const isPrinted = printed.has(letter.id);
            const letterAttachments = attachments[letter.id] ?? [];

            return (
              <div
                key={letter.id}
                className={`rounded-2xl border p-5 ${
                  isPrinted
                    ? "border-emerald-500/40 bg-emerald-500/5"
                    : "border-border bg-card"
                }`}
              >
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="flex items-start gap-3">
                    <button
                      onClick={() => toggleSelect(letter.id)}
                      className={`mt-1 flex h-5 w-5 shrink-0 items-center justify-center rounded border ${
                        selected.has(letter.id)
                          ? "border-emerald-500 bg-emerald-500/10 text-status-success"
                          : "border-border text-transparent hover:border-emerald-500/50"
                      }`}
                    >
                      <CheckCircle2 className="h-3.5 w-3.5" />
                    </button>
                    <span
                      className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-lg ${
                        isPrinted
                          ? "bg-emerald-500/10 text-status-success"
                          : "bg-muted text-muted-foreground"
                      }`}
                    >
                      {isPrinted ? (
                        <CheckCircle2 className="h-5 w-5" />
                      ) : (
                        <FileText className="h-5 w-5" />
                      )}
                    </span>
                    <div>
                      <p className="font-medium">{letter.itemName}</p>
                      <p className="text-xs text-muted-foreground">
                        {letter.category} · {letter.builderMode} ·{" "}
                        {letter.bureaus.join(", ")}
                      </p>
                      <div className="mt-2 flex flex-wrap gap-1.5">
                        <span className="flex items-center gap-1 rounded-full bg-emerald-500/10 px-2.5 py-1 text-[10px] font-medium text-status-success">
                          <Mail className="h-3 w-3" /> Mail via LetterStream
                        </span>
                        <span className="flex items-center gap-1 rounded-full bg-amber-500/10 px-2.5 py-1 text-[10px] font-medium text-status-warning">
                          <Scale className="h-3 w-3" /> CFPB by category
                        </span>
                      </div>
                    </div>
                  </div>
                  <div className="text-right">
                    <p className="text-[10px] uppercase text-muted-foreground">
                      Due date
                    </p>
                    <p className="flex items-center gap-1 text-sm font-semibold text-status-success">
                      <Calendar className="h-3.5 w-3.5" /> {formatDate(letter.dueDate)}
                    </p>
                    <p className="text-[10px] text-muted-foreground">
                      {roundCycleDays} days from today
                    </p>
                  </div>
                </div>

                {/* Attachments */}
                <div className="mt-4 rounded-xl border border-border bg-muted/20 p-3">
                  <div className="flex items-center justify-between">
                    <span className="flex items-center gap-1.5 text-xs font-medium">
                      <Paperclip className="h-3.5 w-3.5 text-muted-foreground" />
                      Attachments ({letterAttachments.length})
                    </span>
                    <button
                      onClick={() =>
                        setShowAttachPicker(
                          showAttachPicker === letter.id ? null : letter.id,
                        )
                      }
                      className="flex items-center gap-1 text-[11px] font-medium text-status-success hover:underline"
                    >
                      <Plus className="h-3 w-3" /> Add attachment
                    </button>
                  </div>

                  {showAttachPicker === letter.id && (
                    <div className="mt-2 flex flex-wrap gap-1.5 border-t border-border pt-2">
                      {POSSIBLE_ATTACHMENTS.map((att) => (
                        <button
                          key={att}
                          onClick={() => toggleAttachment(letter.id, att)}
                          className={`rounded-full px-2.5 py-1 text-[10px] font-medium transition-colors ${
                            letterAttachments.includes(att)
                              ? "bg-emerald-500/10 text-status-success border border-emerald-500/30"
                              : "bg-background border border-border text-muted-foreground hover:bg-muted"
                          }`}
                        >
                          {att}
                        </button>
                      ))}
                    </div>
                  )}

                  {letterAttachments.length > 0 && (
                    <div className="mt-2 flex flex-wrap gap-1.5">
                      {letterAttachments.map((att) => (
                        <span
                          key={att}
                          className="flex items-center gap-1 rounded-full bg-emerald-500/10 px-2.5 py-1 text-[10px] font-medium text-status-success"
                        >
                          <Paperclip className="h-2.5 w-2.5" /> {att}
                        </span>
                      ))}
                    </div>
                  )}
                </div>

                {/* Actions */}
                <div className="mt-4 flex flex-wrap items-center justify-between gap-2">
                  <div className="flex gap-2">
                    <Button variant="outline" size="sm" onClick={() => window.print()} title="Opens the print dialog — choose Save as PDF"><Download className="h-3.5 w-3.5" /> Download PDF</Button>
                    <Button variant="outline" size="sm" onClick={() => window.print()}><Printer className="h-3.5 w-3.5" /> Print</Button>
                  </div>
                  {!isPrinted ? (
                    <Button
                      size="sm"
                      className="bg-gradient-emerald text-white hover:opacity-90"
                      onClick={() => markPrinted(letter.id)}
                    >
                      <CheckCircle2 className="h-3.5 w-3.5" /> Mark as printed &
                      sent
                    </Button>
                  ) : (
                    <Badge className="bg-emerald-500/10 text-status-success">
                      <CheckCircle2 className="h-3 w-3" /> In Dispute
                    </Badge>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}


      {/* Proceed to next steps */}
      <div className="flex items-center justify-between rounded-2xl border border-emerald-500/20 bg-emerald-950/80 p-5 text-emerald-50 shadow-sm">
        <div className="flex items-center gap-3">
          <CheckCircle2 className="h-5 w-5 text-emerald-400" />
          <div>
            <p className="text-sm font-semibold text-emerald-200">
              {allPrinted
                ? "All letters printed — client moved to In Dispute"
                : `${printed.size} of ${activeLetters.length} letters printed`}
            </p>
            <p className="text-xs text-emerald-100/90 leading-relaxed">
              Next due date: {roundCycleDays} days · Round {round} active
            </p>
          </div>
        </div>
        <Button
          onClick={() => setTab("next-steps")}
          className="bg-gradient-emerald text-white hover:opacity-90"
        >
          View next steps <ArrowRight className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
};

export default PrintTab;

// Item Detail Panel — matches DisputeFox full credit report detail & collapsible breakdown
// Displays 3-bureau raw field comparison, payment history grid, dispute history, reason/instruction selectors,
// and AI statutory pathway decision engine.

import { useState } from "react";
import {
  ChevronDown,
  ChevronUp,
  Sparkles,
  FileText,
  Eye,
  Send,
  Edit2,
  Check,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  getItemLetterCategory,
  getFTCRule,
} from "@/lib/dispute/letters-and-channels";
import { generateDisputeDraft } from "@/lib/dispute/package-builder";
import {
  decideDisputePath,
  type DisputeDecisionInput,
} from "@/lib/dispute/decision-engine";
import { getLegalPathwayMeta } from "@/lib/dispute/legal-paths";
import { CreditReportDetailGrid } from "./CreditReportDetailGrid";
import type { ClassifiedItem } from "@/lib/credit-classification";
import { OpsSelect } from "@/components/ui/ops-select";

const PRESET_REASONS = [
  "Inaccurate Account Balance & Credit Limit reported",
  "Incorrect Payment Status / False Late Payment Record",
  "Account belongs to another individual (Mixed File / ID Theft)",
  "No signed contractual agreement or authority to collect",
  "Date of First Delinquency (DOFD) is re-aged or missing",
  "Account closed by consumer but reported open/derogatory",
  "Inquiry was not authorized / Non-permissible purpose",
];

const PRESET_INSTRUCTIONS = [
  "Please reinvestigate under FCRA §1681i and delete if unverifiable.",
  "Audit Metro 2 Base Segment fields and correct balance to $0.00.",
  "Provide Method of Verification (MOV) including furnisher contact details.",
  "Remove unauthorized inquiry immediately per FCRA §1681b.",
  "Block fraudulent tradeline within 4 business days under FCRA §1681c-2.",
];

export const ItemDetailPanel = ({
  item,
  round,
  onPreview,
}: {
  item: ClassifiedItem;
  round: number;
  onPreview: () => void;
}) => {
  const [showDraft, setShowDraft] = useState(false);
  const [selectedReason, setSelectedReason] = useState<string>(
    item.aiReason || PRESET_REASONS[0],
  );
  const [selectedInstruction, setSelectedInstruction] = useState<string>(
    PRESET_INSTRUCTIONS[0],
  );
  const [isEditingReason, setIsEditingReason] = useState(false);
  const [customReasonInput, setCustomReasonInput] = useState("");

  const cat = getItemLetterCategory(item);
  const ftcRule = cat?.requiresFTC ? getFTCRule(item.category) : null;
  const draft = generateDisputeDraft(item, round);
  const hasExperian = item.bureaus.includes("EX");
  const hasNonExperian = item.bureaus.some((b) => b !== "EX");

  const pathInput: DisputeDecisionInput = {
    item,
    round,
    hasEvidence: !!item.balance || !!item.dofd,
    priorDisputeCount: Math.max(0, round - 1),
    wasVerifiedPrior: round >= 2,
    hasNewEvidence: round >= 2,
    evidenceContradictsVerification: round >= 2,
  };
  const decision = decideDisputePath(pathInput);
  const pathMeta = getLegalPathwayMeta(decision.pathway);

  return (
    <div className="space-y-4 rounded-xl border border-emerald-500/30 bg-card p-5 text-card-foreground shadow-sm">
      {/* 1. Header Toolbar & Quick Actions */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border pb-3">
        <div className="flex flex-wrap items-center gap-2">
          <Badge className="bg-emerald-500/10 text-status-success border-emerald-500/20">
            {item.disposition.toUpperCase()}
          </Badge>
          <span className="font-semibold text-base">{item.name}</span>
          <span className="text-xs text-muted-foreground font-mono">
            ({item.id.slice(-8)})
          </span>
          {item.autoSelected && (
            <Badge
              variant="outline"
              className="text-[10px] border-emerald-500/40 text-status-success"
            >
              AI Auto-Selected
            </Badge>
          )}
          <Badge className="bg-blue-500/10 text-status-info border-none text-[10px]">
            {pathMeta.shortStatute}
          </Badge>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Button
            size="sm"
            variant="outline"
            onClick={() => setIsEditingReason((prev) => !prev)}
            className="h-8 text-xs gap-1 border-border"
          >
            <Edit2 className="h-3.5 w-3.5 text-status-success" />
            {isEditingReason ? "Done Editing" : "Reason & Instructions"}
          </Button>
          <Button
            size="sm"
            variant="outline"
            onClick={onPreview}
            className="h-8 text-xs gap-1 border-border"
          >
            <Eye className="h-3.5 w-3.5 text-status-info" /> Letter Preview
          </Button>
          <Button
            size="sm"
            className="h-8 text-xs gap-1 bg-emerald-600 text-white hover:bg-emerald-700"
          >
            <Check className="h-3.5 w-3.5" /> Mark Dispute Ready
          </Button>
        </div>
      </div>

      {/* 2. Dispute Reason & Instructions Control Bar */}
      <div className="rounded-lg border border-border bg-muted/30 p-3.5 space-y-3">
        <div className="grid gap-3 md:grid-cols-2">
          <div>
            <div className="flex items-center justify-between mb-1">
              <label className="text-xs font-semibold text-foreground flex items-center gap-1.5">
                <Sparkles className="h-3.5 w-3.5 text-status-success" />
                Dispute Reason:
              </label>
              <button
                onClick={() => setIsEditingReason(true)}
                className="text-[11px] text-status-success hover:underline font-medium"
              >
                + Custom Reason
              </button>
            </div>
            {isEditingReason ? (
              <div className="flex gap-2">
                <input
                  type="text"
                  value={customReasonInput || selectedReason}
                  onChange={(e) => setCustomReasonInput(e.target.value)}
                  placeholder="Enter specific factual dispute reason..."
                  className="w-full rounded-md border border-border bg-background px-2.5 py-1 text-xs focus:ring-1 focus:ring-emerald-500"
                />
                <Button
                  size="sm"
                  className="h-7 text-xs bg-emerald-600 text-white"
                  onClick={() => {
                    if (customReasonInput) setSelectedReason(customReasonInput);
                    setIsEditingReason(false);
                  }}
                >
                  Save
                </Button>
              </div>
            ) : (
              <OpsSelect
                value={selectedReason}
                onValueChange={setSelectedReason}
                aria-label="Dispute reason"
                size="field"
                className="rounded-md py-1.5 font-medium"
                options={
                  customReasonInput
                    ? [...PRESET_REASONS, customReasonInput]
                    : PRESET_REASONS
                }
              />
            )}
          </div>

          <div>
            <div className="flex items-center justify-between mb-1">
              <label className="text-xs font-semibold text-foreground flex items-center gap-1.5">
                <FileText className="h-3.5 w-3.5 text-status-info" />
                Instruction to Bureau / Furnisher:
              </label>
            </div>
            <OpsSelect
              value={selectedInstruction}
              onValueChange={setSelectedInstruction}
              options={PRESET_INSTRUCTIONS}
              aria-label="Dispute instruction"
              size="field"
              className="rounded-md py-1.5 font-medium"
            />
          </div>
        </div>

        <div className="flex items-center justify-between rounded-md bg-emerald-500/10 p-2 text-xs text-emerald-800 dark:text-emerald-300">
          <span className="font-medium truncate">
            <span className="font-bold">Active Instruction:</span>{" "}
            {selectedReason} — {selectedInstruction}
          </span>
          <span className="text-[10px] font-mono text-status-success shrink-0 ml-2">
            Targeting: {item.bureaus.join(", ")}
          </span>
        </div>
      </div>

      {/* 3. Detailed 3-Bureau Report & Payment History Grid */}
      <CreditReportDetailGrid item={item} round={round} />

      {/* 4. AI Draft Preview Toggle */}
      <div className="rounded-lg border border-emerald-500/30 bg-emerald-500/5 p-4">
        <button
          onClick={() => setShowDraft((s) => !s)}
          className="flex w-full items-center justify-between text-left text-xs font-semibold text-emerald-800 dark:text-emerald-300"
        >
          <span className="flex items-center gap-2">
            <Sparkles className="h-4 w-4 text-status-success" />
            Preview Generated Factual Dispute Letter for Round {round}
          </span>
          {showDraft ? (
            <ChevronUp className="h-4 w-4" />
          ) : (
            <ChevronDown className="h-4 w-4" />
          )}
        </button>

        {showDraft && (
          <div className="mt-3 space-y-3">
            <pre className="whitespace-pre-wrap rounded-lg border border-border bg-card p-4 font-sans text-xs leading-relaxed text-foreground">
              {draft}
            </pre>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="text-[11px] text-muted-foreground">
                Grounding Statute: {pathMeta.shortStatute} ({pathMeta.label})
              </span>
              <div className="flex gap-2">
                <Button
                  size="sm"
                  variant="outline"
                  className="h-7 text-xs"
                  onClick={onPreview}
                >
                  <Eye className="h-3 w-3 mr-1" /> Full Screen Preview
                </Button>
                <Button
                  size="sm"
                  className="h-7 text-xs bg-emerald-600 text-white"
                >
                  <Send className="h-3 w-3 mr-1" /> Approve & Queue
                </Button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

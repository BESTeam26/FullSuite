import { useState } from "react";
import {
  FileText,
  ShieldCheck,
  Check,
  Sparkles,
  AlertTriangle,
  Download,
} from "lucide-react";
import { Button } from "@/components/ui/button";

const sampleDraft = `Dear Experian Dispute Department,

I am disputing the accuracy of the following information on my credit report:

Account: Portfolio Recovery
Account Number: ****9442
Field disputed: Balance
Reported value: $1,284

I believe this information is inaccurate because I settled this account on
March 12, 2025. The settlement agreement and bank payment confirmation are
attached as supporting documentation.

Please conduct a reasonable reinvestigation of this information under the
Fair Credit Reporting Act, 15 U.S.C. § 1681i, and review the enclosed
documents. If the information cannot be verified as complete and accurate,
please delete it. If the underlying information can be verified but the
balance field is inaccurate, please correct it and send me the results of
your reinvestigation.

Sincerely,
Maria Torres`;

export const ConsumerDisputePrep = () => {
  const [draft, setDraft] = useState(sampleDraft);
  const [approved, setApproved] = useState(false);
  const [aiAssisted, setAiAssisted] = useState(true);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">
          Prepare your communication
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          The system organizes your facts and evidence into a draft. You review,
          edit, and approve before anything is sent.
        </p>
      </div>

      <div className="flex items-start gap-3 rounded-xl border border-amber-400/30 bg-amber-500/5 p-4">
        <Sparkles className="mt-0.5 h-4 w-4 shrink-0 text-amber-300" />
        <div className="text-xs leading-relaxed text-muted-foreground">
          <p className="font-semibold text-amber-200">AI-assisted draft</p>
          <p className="mt-1">
            This draft was prepared using your confirmed facts and evidence. AI
            assists with language — it does not determine legal facts. You are
            responsible for reviewing and approving the final content.
          </p>
        </div>
      </div>

      <div className="rounded-2xl border border-border bg-card p-5">
        <div className="mb-3 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <FileText className="h-4 w-4 text-muted-foreground" />
            <span className="text-sm font-semibold text-foreground">
              Dispute letter — Experian
            </span>
          </div>
          <label className="flex items-center gap-2 text-[11px] text-muted-foreground">
            <input
              type="checkbox"
              checked={aiAssisted}
              onChange={(e) => setAiAssisted(e.target.checked)}
              className="h-3.5 w-3.5 accent-amber-500"
            />
            Mark as AI-assisted
          </label>
        </div>
        <textarea
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          className="min-h-[320px] w-full rounded-lg border border-border bg-navy-deep/60 p-4 font-mono text-xs leading-relaxed text-slate-200"
        />
        <p className="mt-2 text-[10px] text-muted-foreground">
          Edit freely. This is your communication in your own words.
        </p>
      </div>

      <div className="rounded-2xl border border-border bg-card p-5">
        <h2 className="text-sm font-semibold text-foreground">Attachments</h2>
        <div className="mt-3 space-y-2">
          {["Settlement_Agreement.pdf", "Bank_Payment_Confirmation.pdf"].map(
            (f) => (
              <div
                key={f}
                className="flex items-center justify-between rounded-lg bg-navy-deep/60 px-3 py-2.5"
              >
                <span className="flex items-center gap-2 text-xs text-muted-foreground">
                  <FileText className="h-3.5 w-3.5 text-emerald-300" /> {f}
                </span>
                <Check className="h-4 w-4 text-emerald-400" />
              </div>
            ),
          )}
        </div>
      </div>

      <div className="rounded-2xl border border-amber-400/20 bg-amber-500/5 p-4">
        <label className="flex items-start gap-3">
          <input
            type="checkbox"
            checked={approved}
            onChange={(e) => setApproved(e.target.checked)}
            className="mt-0.5 h-4 w-4 accent-emerald-500"
          />
          <span className="text-xs leading-relaxed text-amber-200">
            I have reviewed this communication, confirm the facts are accurate,
            and approve it for sending or download. I understand nothing is sent
            automatically without my approval.
          </span>
        </label>
      </div>

      <div className="flex flex-wrap gap-3">
        <Button
          disabled={!approved}
          className="bg-gradient-green text-white hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60"
        >
          <ShieldCheck className="h-4 w-4" /> Approve & send
        </Button>
        <Button
          disabled={!approved}
          variant="outline"
          className="border-border text-slate-200 hover:bg-muted disabled:cursor-not-allowed disabled:opacity-60"
        >
          <Download className="h-4 w-4" /> Approve & download
        </Button>
      </div>

      <div className="flex items-start gap-3 rounded-xl border border-red-400/20 bg-red-500/5 p-4">
        <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-red-400" />
        <p className="text-[11px] leading-relaxed text-muted-foreground">
          This platform does not guarantee deletions or score increases. A
          dispute asks the bureau to reinvestigate — the outcome depends on the
          facts and the investigation.
        </p>
      </div>
    </div>
  );
};

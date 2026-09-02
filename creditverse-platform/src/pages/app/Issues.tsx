import { useState } from "react";
import {
  FileCheck2,
  Plus,
  Paperclip,
  ShieldCheck,
  CheckCircle2,
  Clock,
  Send,
  Eye,
  Gavel,
  AlertTriangle,
  Sparkles,
  ChevronLeft,
  ChevronRight,
  Pencil,
  XCircle,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { useClientWorkspace } from "@/lib/client-workspace-context";

const stages = [
  { name: "Evidence", count: 6, color: "bg-slate-400" },
  { name: "Attestation", count: 4, color: "bg-blue-500" },
  { name: "Drafting", count: 9, color: "bg-indigo-500" },
  { name: "QA", count: 5, color: "bg-amber-500" },
  { name: "Approval", count: 7, color: "bg-purple-500" },
  { name: "Filed", count: 14, color: "bg-sky-500" },
  { name: "Resolved", count: 31, color: "bg-emerald-500" },
];

const issues = [
  {
    id: "ISS-0418",
    client: "Maria Gonzalez",
    item: "Balance mismatch — Midland",
    bureau: "TransUnion",
    stage: "Drafting",
    evidence: 2,
    attested: true,
  },
  {
    id: "ISS-0417",
    client: "Devon Park",
    item: "Responsibility — Joint vs Individual",
    bureau: "TransUnion",
    stage: "QA",
    evidence: 1,
    attested: true,
  },
  {
    id: "ISS-0416",
    client: "Lena Ortiz",
    item: "Account status — Closed reported as Collection",
    bureau: "Experian",
    stage: "Filed",
    evidence: 3,
    attested: true,
  },
  {
    id: "ISS-0415",
    client: "James Whitaker",
    item: "Date of first delinquency",
    bureau: "Equifax",
    stage: "Attestation",
    evidence: 1,
    attested: false,
  },
  {
    id: "ISS-0414",
    client: "Tanya Brooks",
    item: "Duplicate tradeline",
    bureau: "Experian",
    stage: "Resolved",
    evidence: 2,
    attested: true,
  },
];

const stageIcon: Record<string, React.ReactNode> = {
  Evidence: <Paperclip className="h-4 w-4 text-slate-500" />,
  Attestation: <ShieldCheck className="h-4 w-4 text-blue-500" />,
  Drafting: <FileCheck2 className="h-4 w-4 text-indigo-500" />,
  QA: <Eye className="h-4 w-4 text-amber-500" />,
  Approval: <Clock className="h-4 w-4 text-purple-500" />,
  Filed: <Send className="h-4 w-4 text-sky-500" />,
  Resolved: <CheckCircle2 className="h-4 w-4 text-emerald-500" />,
};

const workbenchFields = [
  {
    field: "Balance",
    experian: "$4,820",
    equifax: "$4,820",
    transunion: "$0",
    consumer: "$0",
  },
  {
    field: "Status",
    experian: "Collection",
    equifax: "Collection",
    transunion: "Closed",
    consumer: "Settled",
  },
  {
    field: "Last payment",
    experian: "Jan 2024",
    equifax: "Jan 2024",
    transunion: "Jun 2023",
    consumer: "Jan 2024",
  },
];

const evidenceFiles = ["Settlement_Agreement.pdf", "Bank_Payment.pdf"];

const Issues = ({ embedded = false }: { embedded?: boolean }) => {
  const [openId, setOpenId] = useState<string | null>("ISS-0418");
  const [explanation, setExplanation] = useState(
    "Consumer says account was settled on March 12, 2025.",
  );
  const [attested, setAttested] = useState(true);
  const { setTab } = useClientWorkspace();
  const open = issues.find((i) => i.id === openId);

  return (
    <div className={embedded ? "" : "p-6 md:p-8"}>
      <div
        className={`${embedded ? "mb-6" : "mb-8"} flex items-center justify-between`}
      >
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Issue Workbench</h1>
          <p className="text-sm text-muted-foreground">
            Issues — not letters — are the core object. Each carries evidence, a
            consumer attestation, and a full lifecycle.
          </p>
        </div>
        <Button className="bg-gradient-emerald text-white hover:opacity-90">
          <Plus className="h-4 w-4" /> New issue
        </Button>
      </div>

      <div className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-7">
        {stages.map((s) => (
          <div
            key={s.name}
            className="rounded-xl border border-border bg-card p-4"
          >
            <div className="flex items-center gap-2">
              <span className={`h-2.5 w-2.5 rounded-full ${s.color}`} />
              <span className="text-xs font-medium text-muted-foreground">
                {s.name}
              </span>
            </div>
            <p className="mt-2 text-2xl font-bold">{s.count}</p>
          </div>
        ))}
      </div>

      <div className="overflow-hidden rounded-2xl border border-border bg-card">
        <div className="border-b border-border p-6">
          <h2 className="font-semibold">Active issues</h2>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="border-b border-border bg-muted/40 text-left text-xs uppercase text-muted-foreground">
              <tr>
                <th className="px-6 py-3 font-medium">Issue</th>
                <th className="px-6 py-3 font-medium">Client</th>
                <th className="px-6 py-3 font-medium">Factual basis</th>
                <th className="px-6 py-3 font-medium">Bureau</th>
                <th className="px-6 py-3 font-medium">Evidence</th>
                <th className="px-6 py-3 font-medium">Attested</th>
                <th className="px-6 py-3 font-medium">Stage</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {issues.map((d) => (
                <tr
                  key={d.id}
                  onClick={() => setOpenId(d.id)}
                  className={`cursor-pointer ${
                    openId === d.id ? "bg-muted/40" : "hover:bg-muted/30"
                  }`}
                >
                  <td className="px-6 py-4 font-mono text-xs font-medium text-emerald-600">
                    {d.id}
                  </td>
                  <td className="px-6 py-4 font-medium">{d.client}</td>
                  <td className="px-6 py-4 text-muted-foreground">{d.item}</td>
                  <td className="px-6 py-4">{d.bureau}</td>
                  <td className="px-6 py-4">
                    <span className="flex items-center gap-1 text-muted-foreground">
                      <Paperclip className="h-3.5 w-3.5" /> {d.evidence}
                    </span>
                  </td>
                  <td className="px-6 py-4">
                    {d.attested ? (
                      <span className="flex items-center gap-1 text-xs font-medium text-emerald-600">
                        <ShieldCheck className="h-3.5 w-3.5" /> Yes
                      </span>
                    ) : (
                      <span className="flex items-center gap-1 text-xs font-medium text-amber-600">
                        <Clock className="h-3.5 w-3.5" /> Pending
                      </span>
                    )}
                  </td>
                  <td className="px-6 py-4">
                    <span className="flex items-center gap-1.5 text-xs font-medium">
                      {stageIcon[d.stage]} {d.stage}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {open && (
        <div className="mt-6 rounded-2xl border border-border bg-card p-6">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border pb-4">
            <div className="text-sm text-muted-foreground">
              <span className="font-medium text-foreground">{open.client}</span>{" "}
              · Report: Aug 18 2026 ·{" "}
              <span className="font-mono text-emerald-600">{open.id}</span>
            </div>
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <button className="flex h-7 w-7 items-center justify-center rounded-md border border-border hover:bg-muted">
                <ChevronLeft className="h-4 w-4" />
              </button>
              Issue 3 of 7
              <button className="flex h-7 w-7 items-center justify-center rounded-md border border-border hover:bg-muted">
                <ChevronRight className="h-4 w-4" />
              </button>
            </div>
          </div>

          <div className="mt-4 flex items-center gap-2">
            <span className="rounded-md bg-muted px-2.5 py-1 text-xs font-medium text-muted-foreground">
              ACME BANK ••••1234
            </span>
          </div>

          <div className="mt-4 overflow-x-auto rounded-xl border border-border">
            <table className="w-full text-sm">
              <thead className="bg-muted/40 text-left text-xs uppercase text-muted-foreground">
                <tr>
                  <th className="px-4 py-2.5 font-medium"></th>
                  <th className="px-4 py-2.5 font-medium">Experian</th>
                  <th className="px-4 py-2.5 font-medium">Equifax</th>
                  <th className="px-4 py-2.5 font-medium">TransUnion</th>
                  <th className="px-4 py-2.5 font-medium">Consumer says</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {workbenchFields.map((f) => {
                  const mismatch =
                    f.experian !== f.transunion || f.equifax !== f.transunion;
                  return (
                    <tr key={f.field} className="hover:bg-muted/20">
                      <td className="px-4 py-3 font-medium">{f.field}</td>
                      <td className="px-4 py-3 text-muted-foreground">
                        {f.experian}
                      </td>
                      <td className="px-4 py-3 text-muted-foreground">
                        {f.equifax}
                      </td>
                      <td className="px-4 py-3 text-muted-foreground">
                        {f.transunion}
                      </td>
                      <td className="px-4 py-3 font-medium text-emerald-600">
                        {f.consumer}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          <div className="mt-4 flex items-start gap-2 rounded-lg bg-amber-500/10 p-3 text-sm">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" />
            <span className="text-amber-700">
              <strong>Potential discrepancy: BALANCE.</strong> Ask the consumer
              to verify before creating a dispute — different reporting can have
              legitimate causes.
            </span>
          </div>

          <div className="mt-5">
            <label className="text-sm font-medium">
              Why is the reported amount believed inaccurate?
            </label>
            <Textarea
              value={explanation}
              onChange={(e) => setExplanation(e.target.value)}
              className="mt-2"
              rows={2}
            />
          </div>

          <div className="mt-5">
            <p className="text-sm font-medium">Evidence</p>
            <div className="mt-2 flex flex-wrap items-center gap-2">
              {evidenceFiles.map((f) => (
                <span
                  key={f}
                  className="flex items-center gap-1.5 rounded-lg border border-border bg-muted/40 px-3 py-1.5 text-xs font-medium text-muted-foreground"
                >
                  <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" />
                  {f}
                </span>
              ))}
              <button className="flex items-center gap-1.5 rounded-lg border border-dashed border-border px-3 py-1.5 text-xs font-medium text-emerald-600 hover:bg-muted/40">
                <Plus className="h-3.5 w-3.5" /> Add document
              </button>
            </div>
          </div>

          <div className="mt-5">
            <p className="text-sm font-medium">Consumer attestation</p>
            <label className="mt-2 flex items-start gap-3 rounded-xl border border-border bg-muted/30 p-4">
              <input
                type="checkbox"
                checked={attested}
                onChange={(e) => setAttested(e.target.checked)}
                className="mt-0.5 h-4 w-4 accent-emerald-500"
              />
              <span className="text-sm text-muted-foreground">
                "I confirm this explanation is true to the best of my
                knowledge."
              </span>
            </label>
          </div>

          <div className="mt-5 rounded-xl border border-border bg-muted/30 p-4">
            <div className="flex items-center gap-2 text-sm font-medium">
              <Sparkles className="h-4 w-4 text-emerald-600" /> AI suggestion
            </div>
            <p className="mt-2 text-sm text-muted-foreground">
              "Experian and Equifax report a balance of $4,820. I believe this
              is inaccurate because the account was settled on March 12, 2025,
              as documented in the attached settlement agreement and bank
              payment record. I am requesting an investigation of this
              information."
            </p>
          </div>

          <div className="mt-5 flex flex-wrap gap-3">
            <Button variant="outline">
              <Pencil className="h-4 w-4" /> Edit
            </Button>
            <Button variant="outline">Run factual check</Button>
            <Button
              disabled={!attested}
              onClick={() => setTab("letters")}
              className="bg-gradient-emerald text-white hover:opacity-90 disabled:opacity-40"
            >
              <Send className="h-4 w-4" /> Send to QA
            </Button>
            <Button variant="ghost" className="text-muted-foreground">
              <XCircle className="h-4 w-4" /> Do not dispute
            </Button>
          </div>

          <div className="mt-6 flex items-start gap-3 rounded-2xl border border-border bg-muted/40 p-5">
            <Gavel className="mt-0.5 h-5 w-5 shrink-0 text-emerald-600" />
            <p className="text-sm text-muted-foreground">
              No issue can move from Drafting to Filed without a consumer
              attestation and a separate QA pass. This maker-checker control is
              enforced by the workflow engine and recorded in the audit ledger.
            </p>
          </div>
        </div>
      )}
    </div>
  );
};

export default Issues;

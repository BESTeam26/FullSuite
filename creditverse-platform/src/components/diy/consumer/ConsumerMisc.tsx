import { Plus, FileText, Download, LifeBuoy, Mail, Phone } from "lucide-react";
import { useDiyManagement } from "@/lib/diy/diy-management-context";
import { Button } from "@/components/ui/button";

const issues = [
  {
    account: "Portfolio Recovery",
    field: "Balance",
    reported: "$1,284",
    why: "Bureau difference detected",
    status: "Potential Issue",
    confirmed: false,
  },
  {
    account: "LVNV Funding",
    field: "DOFD",
    reported: "11/2023",
    why: "DOFD may be inconsistent with delinquency chronology",
    status: "Needs Your Confirmation",
    confirmed: false,
  },
  {
    account: "Synchrony Bank",
    field: "Inquiry",
    reported: "Hard inquiry",
    why: "Needs confirmation — did you authorize this?",
    status: "Needs Your Confirmation",
    confirmed: false,
  },
];

export const ConsumerIssues = () => (
  <div className="space-y-6">
    <div>
      <h1 className="text-2xl font-bold tracking-tight">Issues</h1>
      <p className="mt-1 text-sm text-slate-400">
        Potential issues identified from your report. Each connects to evidence
        and requires your confirmation.
      </p>
    </div>
    <div className="space-y-3">
      {issues.map((it, i) => (
        <div
          key={i}
          className="rounded-2xl border border-white/10 bg-white/5 p-5"
        >
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-sm font-semibold text-white">{it.account}</p>
              <p className="mt-1 text-xs text-slate-400">
                {it.field} · Reported: {it.reported}
              </p>
              <p className="mt-2 rounded-lg bg-navy-deep/60 p-2.5 text-[11px] leading-relaxed text-slate-400">
                {it.why}
              </p>
            </div>
            <span className="shrink-0 rounded-full bg-amber-500/15 px-2.5 py-1 text-[10px] font-bold text-amber-300">
              {it.status}
            </span>
          </div>
          <div className="mt-3 flex gap-2">
            <Button
              size="sm"
              variant="outline"
              className="border-white/20 text-slate-200"
            >
              Confirm facts
            </Button>
            <Button size="sm" variant="ghost" className="text-slate-400">
              Add evidence
            </Button>
          </div>
        </div>
      ))}
    </div>
  </div>
);

const evidence = [
  {
    name: "Settlement_Agreement.pdf",
    type: "Settlement letter",
    date: "Aug 22",
  },
  {
    name: "Bank_Payment_Confirmation.pdf",
    type: "Bank record",
    date: "Aug 22",
  },
];

export const ConsumerEvidence = () => (
  <div className="space-y-6">
    <div>
      <h1 className="text-2xl font-bold tracking-tight">Evidence</h1>
      <p className="mt-1 text-sm text-slate-400">
        Your supporting documents. A dispute is only as strong as its facts.
      </p>
    </div>
    <Button className="bg-gradient-green text-white hover:opacity-90">
      <Plus className="h-4 w-4" /> Upload evidence
    </Button>
    <div className="grid gap-3 sm:grid-cols-2">
      {evidence.map((e) => (
        <div
          key={e.name}
          className="flex items-center gap-3 rounded-xl border border-white/10 bg-white/5 p-4"
        >
          <FileText className="h-8 w-8 text-emerald-300" />
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-medium text-white">{e.name}</p>
            <p className="text-[11px] text-slate-400">
              {e.type} · {e.date}
            </p>
          </div>
          <button className="text-slate-400 hover:text-white">
            <Download className="h-4 w-4" />
          </button>
        </div>
      ))}
    </div>
  </div>
);

const docs = [
  { name: "Round1_Experian_Dispute.pdf", type: "Letter", date: "Aug 24" },
  { name: "USPS_Certified_Receipt.pdf", type: "Mail proof", date: "Aug 24" },
  { name: "Credit_Report_Aug2026.pdf", type: "Report", date: "Aug 18" },
];

export const ConsumerDocuments = () => (
  <div className="space-y-6">
    <div>
      <h1 className="text-2xl font-bold tracking-tight">Documents</h1>
      <p className="mt-1 text-sm text-slate-400">
        Everything attached to your disputes and reports.
      </p>
    </div>
    <Button className="bg-gradient-green text-white hover:opacity-90">
      <Plus className="h-4 w-4" /> Upload
    </Button>
    <div className="grid gap-3 sm:grid-cols-2">
      {docs.map((d) => (
        <div
          key={d.name}
          className="flex items-center gap-3 rounded-xl border border-white/10 bg-white/5 p-4"
        >
          <FileText className="h-8 w-8 text-emerald-300" />
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-medium text-white">{d.name}</p>
            <p className="text-[11px] text-slate-400">
              {d.type} · {d.date}
            </p>
          </div>
          <button className="text-slate-400 hover:text-white">
            <Download className="h-4 w-4" />
          </button>
        </div>
      ))}
    </div>
  </div>
);

const modules = [
  {
    title: "How to read a tradeline",
    desc: "Understand balance, status, utilization, and payment history.",
  },
  {
    title: "Accurate vs. inaccurate negatives",
    desc: "The difference between a true negative and a reporting error.",
  },
  {
    title: "CRA vs. furnisher",
    desc: "Bureaus store it, furnishers supply it. Knowing who changes your strategy.",
  },
  {
    title: "What evidence matters",
    desc: "Which documents support which claims.",
  },
  {
    title: "Identity-theft procedures",
    desc: "Identity theft has a specific, documented process.",
  },
  {
    title: "What happens after a dispute",
    desc: "30-day reinvestigation, response, reimport, and reading results.",
  },
];

export const ConsumerEducation = () => (
  <div className="space-y-6">
    <div>
      <h1 className="text-2xl font-bold tracking-tight">Education</h1>
      <p className="mt-1 text-sm text-slate-400">
        Credit Academy — learn how credit works so you can make informed
        decisions.
      </p>
    </div>
    <div className="grid gap-4 sm:grid-cols-2">
      {modules.map((m) => (
        <div
          key={m.title}
          className="rounded-2xl border border-white/10 bg-white/5 p-5"
        >
          <h2 className="text-sm font-semibold text-white">{m.title}</h2>
          <p className="mt-1 text-xs leading-relaxed text-slate-400">
            {m.desc}
          </p>
          <button className="mt-3 text-xs font-semibold text-emerald-400 hover:text-emerald-300">
            Start lesson →
          </button>
        </div>
      ))}
    </div>
  </div>
);

export const ConsumerHelp = () => {
  const { whiteLabel } = useDiyManagement();
  return (
    <div className="mx-auto max-w-lg space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Help</h1>
        <p className="mt-1 text-sm text-slate-400">
          Need help? Contact your organization's support team.
        </p>
      </div>
      <div className="rounded-2xl border border-white/10 bg-white/5 p-5">
        <LifeBuoy className="h-6 w-6 text-amber-300" />
        <p className="mt-3 text-sm font-semibold text-white">
          {whiteLabel.programName} support
        </p>
        <div className="mt-3 space-y-2 text-xs text-slate-300">
          {whiteLabel.supportEmail && (
            <p className="flex items-center gap-2">
              <Mail className="h-3.5 w-3.5" /> {whiteLabel.supportEmail}
            </p>
          )}
          {whiteLabel.supportPhone && (
            <p className="flex items-center gap-2">
              <Phone className="h-3.5 w-3.5" /> {whiteLabel.supportPhone}
            </p>
          )}
        </div>
      </div>
      <div className="rounded-2xl border border-amber-400/20 bg-amber-500/5 p-4 text-[11px] leading-relaxed text-amber-200">
        This platform is software and education, not a law firm. This is not
        legal advice. For legal action, consult a licensed attorney.
      </div>
    </div>
  );
};

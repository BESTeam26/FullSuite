import { ShieldCheck, AlertTriangle, Info } from "lucide-react";

// Plain-language credit review. Never uses "Violation Detected" / "Illegal
// Reporting" / "Guaranteed Deletion".
const sections = [
  {
    title: "Positive Accounts",
    tone: "text-emerald-300",
    items: [
      { name: "Capital One", detail: "Open · $2,400 balance · Current" },
      { name: "Discover", detail: "Open · $0 balance · Pays as agreed" },
    ],
  },
  {
    title: "Accounts Needing Review",
    tone: "text-amber-300",
    items: [
      {
        name: "Portfolio Recovery",
        detail: "Collection · $1,284 · Bureau difference detected",
      },
      { name: "LVNV Funding", detail: "Collection · DOFD may be inconsistent" },
    ],
  },
  {
    title: "Collections",
    tone: "text-red-300",
    items: [{ name: "Midland Funding", detail: "Collection · $842" }],
  },
  {
    title: "Late Payments",
    tone: "text-amber-300",
    items: [{ name: "Chase Bank", detail: "30-day late · May 2026" }],
  },
  {
    title: "Inquiries",
    tone: "text-amber-300",
    items: [
      { name: "Synchrony Bank", detail: "Hard inquiry — needs confirmation" },
    ],
  },
  {
    title: "Personal Information",
    tone: "text-slate-300",
    items: [{ name: "Previous address", detail: "Review for accuracy" }],
  },
];

const statusLabels: Record<string, { label: string; tone: string }> = {
  potential: {
    label: "Potential Issue",
    tone: "text-amber-300 bg-amber-500/10",
  },
  observed: {
    label: "Observed Difference",
    tone: "text-slate-300 bg-white/10",
  },
  "needs-confirmation": {
    label: "Needs Your Confirmation",
    tone: "text-amber-300 bg-amber-500/10",
  },
  "evidence-needed": {
    label: "Evidence Needed",
    tone: "text-sky-300 bg-sky-500/10",
  },
  "needs-review": {
    label: "Needs Review",
    tone: "text-amber-300 bg-amber-500/10",
  },
};

export const ConsumerCreditReview = () => (
  <div className="space-y-6">
    <div>
      <h1 className="text-2xl font-bold tracking-tight">My Credit</h1>
      <p className="mt-1 text-sm text-slate-400">
        Your credit profile in plain language. Review each section before
        identifying potential issues.
      </p>
    </div>

    <div className="flex items-start gap-3 rounded-xl border border-amber-400/30 bg-amber-500/5 p-4">
      <Info className="mt-0.5 h-4 w-4 shrink-0 text-amber-300" />
      <p className="text-xs leading-relaxed text-slate-300">
        A difference between bureaus is not automatically an error. Different
        reporting dates or data sources can cause legitimate differences. We
        flag items for your review — you confirm the facts.
      </p>
    </div>

    {sections.map((s) => (
      <div
        key={s.title}
        className="rounded-2xl border border-white/10 bg-white/5 p-5"
      >
        <h2 className={`text-sm font-bold ${s.tone}`}>{s.title}</h2>
        <div className="mt-3 space-y-2">
          {s.items.map((it) => (
            <div
              key={it.name}
              className="flex items-center justify-between rounded-lg bg-navy-deep/60 p-3"
            >
              <div>
                <p className="text-sm font-medium text-white">{it.name}</p>
                <p className="text-[11px] text-slate-400">{it.detail}</p>
              </div>
              <span className="rounded-full bg-white/10 px-2.5 py-1 text-[10px] font-bold text-slate-300">
                Review
              </span>
            </div>
          ))}
        </div>
      </div>
    ))}

    <div className="rounded-2xl border border-white/10 bg-white/5 p-5">
      <h2 className="text-sm font-bold text-amber-300">Bureau Differences</h2>
      <p className="mt-1 text-xs text-slate-400">
        Where the three bureaus report different values for the same account.
      </p>
      <div className="mt-3 overflow-x-auto">
        <table className="w-full text-left text-xs">
          <thead>
            <tr className="border-b border-white/10 text-slate-400">
              <th className="py-2 pr-4 font-medium">Field</th>
              <th className="py-2 pr-4 font-medium">Equifax</th>
              <th className="py-2 pr-4 font-medium">Experian</th>
              <th className="py-2 pr-4 font-medium">TransUnion</th>
              <th className="py-2 font-medium">Status</th>
            </tr>
          </thead>
          <tbody>
            <tr className="border-b border-white/5">
              <td className="py-2.5 pr-4 text-slate-300">Balance</td>
              <td className="py-2.5 pr-4 text-white">$1,284</td>
              <td className="py-2.5 pr-4 text-white">$0</td>
              <td className="py-2.5 pr-4 text-white">$1,284</td>
              <td className="py-2.5">
                <span className="rounded-full bg-amber-500/10 px-2 py-0.5 text-[10px] font-bold text-amber-300">
                  Observed Difference
                </span>
              </td>
            </tr>
            <tr>
              <td className="py-2.5 pr-4 text-slate-300">Status</td>
              <td className="py-2.5 pr-4 text-white">Collection</td>
              <td className="py-2.5 pr-4 text-white">Collection</td>
              <td className="py-2.5 pr-4 text-white">Collection</td>
              <td className="py-2.5">
                <span className="rounded-full bg-emerald-500/10 px-2 py-0.5 text-[10px] font-bold text-emerald-300">
                  Consistent
                </span>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>

    <div className="flex items-start gap-3 rounded-xl border border-emerald-400/30 bg-emerald-500/5 p-4">
      <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-emerald-300" />
      <p className="text-xs leading-relaxed text-slate-300">
        We never use terms like "Violation Detected" or "Illegal Reporting."
        Every item is a potential issue for your review — you decide what's
        accurate.
      </p>
    </div>
  </div>
);

export { statusLabels };

import { Plus, FileText, Download } from "lucide-react";
import { Button } from "@/components/ui/button";

const docs = [
  { name: "Settlement_Agreement.pdf", type: "Evidence", date: "Aug 22" },
  { name: "Bank_Payment_Confirmation.pdf", type: "Evidence", date: "Aug 22" },
  { name: "Round1_Equifax_Dispute.pdf", type: "Letter", date: "Aug 24" },
  { name: "USPS_Certified_Receipt.pdf", type: "Mail proof", date: "Aug 24" },
];

export const DocumentsView = () => (
  <div className="space-y-6">
    <div className="flex items-center justify-between">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">My documents</h1>
        <p className="mt-1 text-sm text-slate-400">
          Your evidence vault. Everything attached to your disputes is here.
        </p>
      </div>
      <Button className="bg-gradient-emerald text-white hover:opacity-90">
        <Plus className="h-4 w-4" /> Upload
      </Button>
    </div>
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

export const SettingsView = () => (
  <div className="mx-auto max-w-lg space-y-6">
    <div>
      <h1 className="text-2xl font-bold tracking-tight">Settings</h1>
      <p className="mt-1 text-sm text-slate-400">
        Your account and communication preferences.
      </p>
    </div>
    <div className="rounded-2xl border border-white/10 bg-white/5 p-5">
      <p className="text-sm font-semibold">Communication consent</p>
      <div className="mt-3 space-y-2">
        {[
          "Email me progress updates",
          "Text me when mail is delivered",
          "Email me a copy of every letter I approve",
        ].map((c) => (
          <label
            key={c}
            className="flex items-center gap-2.5 text-xs text-slate-300"
          >
            <input
              type="checkbox"
              defaultChecked
              className="h-4 w-4 accent-emerald-500"
            />
            {c}
          </label>
        ))}
      </div>
    </div>
    <div className="rounded-2xl border border-amber-400/20 bg-amber-500/5 p-4 text-[11px] leading-relaxed text-amber-200">
      BES is software and education, not a law firm. This is not legal advice.
      For legal action, consult a licensed attorney.
    </div>
  </div>
);

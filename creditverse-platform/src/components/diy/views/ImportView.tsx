import { useState } from "react";
import { UploadCloud, CheckCircle2, ShieldCheck } from "lucide-react";
import { useDiy } from "@/lib/diy/diy-context";
import { Button } from "@/components/ui/button";
import { providers } from "./shared";

export const ImportView = () => {
  const { setImported, setView, imported } = useDiy();
  const [provider, setProvider] = useState(providers[0]);
  const [importing, setImporting] = useState(false);

  const run = () => {
    setImporting(true);
    setTimeout(() => {
      setImported(true);
      setImporting(false);
      setView("disputes");
    }, 1800);
  };

  return (
    <div className="mx-auto max-w-xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">
          Import your report
        </h1>
        <p className="mt-1 text-sm text-slate-400">
          Pull your three-bureau report from a monitoring provider. The AI
          engine auto-labels negatives and positives and flags items tied to
          open accounts.
        </p>
      </div>

      <div className="rounded-2xl border border-white/10 bg-white/5 p-5">
        <p className="mb-3 text-xs font-semibold uppercase tracking-wider text-slate-400">
          Monitoring provider
        </p>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
          {providers.map((p) => (
            <button
              key={p}
              onClick={() => setProvider(p)}
              className={`rounded-xl border px-3 py-2.5 text-xs font-medium transition-colors ${
                provider === p
                  ? "border-emerald-400/40 bg-emerald-500/15 text-emerald-200"
                  : "border-white/10 bg-white/5 text-slate-300 hover:bg-white/10"
              }`}
            >
              {p}
            </button>
          ))}
        </div>

        <div className="mt-5 rounded-xl bg-navy-deep/60 p-4">
          <p className="text-xs text-slate-400">
            Connecting to <span className="text-white">{provider}</span>…
          </p>
          <div className="mt-2 flex items-center gap-2 text-[11px] text-slate-500">
            <ShieldCheck className="h-3.5 w-3.5 text-emerald-400" />
            Your credentials stay between you and {provider}. BES receives the
            report data only.
          </div>
        </div>

        <Button
          onClick={run}
          disabled={importing || imported}
          className="mt-5 w-full bg-gradient-emerald text-white hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {importing ? (
            <>
              <UploadCloud className="h-4 w-4 animate-pulse" /> Importing &
              analyzing…
            </>
          ) : imported ? (
            "Report imported"
          ) : (
            <>
              <UploadCloud className="h-4 w-4" /> Import {provider} report
            </>
          )}
        </Button>
      </div>

      {imported && (
        <div className="rounded-xl border border-emerald-400/30 bg-emerald-500/5 p-4 text-sm text-emerald-200">
          <CheckCircle2 className="mr-1.5 inline h-4 w-4" />
          Report analyzed. AI classified negatives, protected open-account
          inquiries, and prepared dispute candidates.
          <button
            onClick={() => setView("disputes")}
            className="mt-2 block text-xs font-semibold underline"
          >
            Review your items →
          </button>
        </div>
      )}
    </div>
  );
};

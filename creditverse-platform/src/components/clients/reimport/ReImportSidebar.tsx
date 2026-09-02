import {
  Download,
  RefreshCw,
  Mail,
  MessageSquare,
  Sparkles,
} from "lucide-react";
import { Button } from "@/components/ui/button";

export function ReImportSidebar() {
  return (
    <div className="space-y-4">
      {/* Main Report Card */}
      <div className="rounded-2xl border border-border bg-card overflow-hidden">
        <div className="bg-gradient-to-br from-indigo-500 to-purple-600 px-5 py-4 text-white">
          <p className="text-lg font-bold">Re-Import Progress Report</p>
          <p className="mt-0.5 text-xs text-indigo-100">
            Full breakdown of this customer's credit report highlighting
            negative items, credit usage & more
          </p>
        </div>
        <div className="p-4 space-y-3">
          <div className="rounded-xl bg-indigo-500/10 p-3 text-center">
            <p className="text-sm font-bold text-indigo-700">
              CLIENT PROGRESS REPORT
            </p>
            <div className="mt-2 inline-flex items-center gap-2 rounded-lg bg-white px-4 py-2 shadow-sm">
              <Sparkles className="h-4 w-4 text-indigo-500" />
              <span className="text-xs font-medium">Generating…</span>
            </div>
          </div>

          <Button className="w-full bg-cyan-500 text-white hover:bg-cyan-600">
            <Download className="mr-2 h-4 w-4" /> Download PDF
          </Button>
          <p className="text-center text-[11px] text-muted-foreground">
            View / Save the report
          </p>

          <Button variant="outline" className="w-full" disabled>
            <RefreshCw className="mr-2 h-4 w-4 animate-spin" /> Generating
            Report
          </Button>

          <div className="rounded-lg bg-slate-100 p-3">
            <label className="flex items-center justify-between text-xs font-medium">
              Show In Portal?
              <div className="relative inline-block h-5 w-9 cursor-pointer rounded-full bg-emerald-500 transition-colors">
                <span className="absolute right-0.5 top-0.5 h-4 w-4 rounded-full bg-white shadow-sm transition-transform" />
              </div>
            </label>
          </div>

          <div className="mt-4 space-y-3 rounded-lg border border-border p-3">
            <p className="text-xs font-semibold">Email Report</p>
            <p className="text-[11px] text-muted-foreground">
              Send PDF to customer for review
            </p>
            <div className="flex items-center gap-2">
              <input
                type="email"
                defaultValue="maria.g@email.com"
                className="w-full rounded-lg border border-border px-2 py-1.5 text-xs"
                placeholder="customer@email.com"
              />
              <button className="rounded-lg bg-red-500 p-1.5 text-white">
                <Mail className="h-3.5 w-3.5" />
              </button>
            </div>
            <Button variant="outline" size="sm" className="w-full" disabled>
              <RefreshCw className="mr-2 h-3.5 w-3.5 animate-spin" /> Generating
              Report
            </Button>

            <p className="text-xs font-semibold mt-4">Send Report via SMS</p>
            <p className="text-[11px] text-muted-foreground">
              Send a Text Message with PDF link
            </p>
            <div className="flex items-center gap-2">
              <input
                type="tel"
                defaultValue="+1 (678) 283-8554"
                className="w-full rounded-lg border border-border px-2 py-1.5 text-xs"
                placeholder="+1 (xxx) xxx-xxxx"
              />
              <button className="rounded-lg bg-red-500 p-1.5 text-white">
                <MessageSquare className="h-3.5 w-3.5" />
              </button>
            </div>
            <Button variant="outline" size="sm" className="w-full" disabled>
              <RefreshCw className="mr-2 h-3.5 w-3.5 animate-spin" /> Generating
              Report
            </Button>
          </div>

          <div className="mt-4 rounded-lg border border-emerald-500/30 bg-emerald-500/5 p-3">
            <p className="text-xs font-semibold text-emerald-700">
              Report Auto-Saved
            </p>
            <p className="mt-1 text-[11px] text-emerald-600">
              This report will be saved to the &ldquo;Documents&rdquo; tab on
              the Client&rsquo;s record, as well as inside the Customer Portal
              under &ldquo;Documents&rdquo;
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

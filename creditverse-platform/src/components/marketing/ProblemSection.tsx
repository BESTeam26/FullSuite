import { Unplug, ArrowDown, ArrowRight, CheckCircle2 } from "lucide-react";
import { BrandedVisual } from "@/components/marketing/BrandedVisual";

const fragmented = [
  "CRM",
  "Credit Repair Software",
  "Funding Tracker",
  "Spreadsheets",
  "Project Management",
  "Documents",
  "Team Messages",
];

const connected = ["Clients", "Team", "Work", "Documents", "Reporting"];

export const ProblemSection = () => (
  <section className="container py-24">
    <div className="grid items-center gap-12 lg:grid-cols-2">
      {/* Left: text + fragmented/connected */}
      <div>
        <h2 className="text-3xl font-bold tracking-tight md:text-4xl">
          Your operation shouldn't live in five different systems.
        </h2>
        <p className="mt-4 text-muted-foreground">
          Keep your front-office CRM. Replace the spreadsheets, disconnected
          trackers, duplicate client records, and fragmented fulfillment
          processes behind it.
        </p>

        <div className="mt-8 rounded-2xl border border-destructive/30 bg-destructive/5 p-6">
          <div className="flex items-center gap-2 text-destructive">
            <Unplug className="h-5 w-5" />
            <h3 className="font-semibold">Fragmented operations</h3>
          </div>
          <div className="mt-4 flex flex-wrap gap-2">
            {fragmented.map((f) => (
              <span
                key={f}
                className="rounded-lg border border-destructive/20 bg-background px-3 py-1.5 text-sm text-muted-foreground line-through decoration-destructive/40"
              >
                {f}
              </span>
            ))}
          </div>
        </div>

        <div className="my-4 flex justify-center">
          <ArrowDown className="h-7 w-7 text-muted-foreground/40" />
        </div>

        <div className="rounded-2xl border border-emerald-700/30 bg-emerald-700/5 p-6">
          <div className="flex items-center gap-2 text-emerald-700">
            <CheckCircle2 className="h-5 w-5" />
            <h3 className="font-semibold">BES connected operations</h3>
          </div>
          <div className="mt-4 flex flex-wrap items-center gap-2 text-sm">
            <span className="rounded-lg border border-border bg-background px-3 py-1.5 text-muted-foreground">
              CRM / Lead Source
            </span>
            <ArrowRight className="h-4 w-4 text-muted-foreground/40" />
            <span className="rounded-lg bg-gradient-gold px-3 py-1.5 font-semibold text-charcoal">
              BES Platform
            </span>
            <ArrowRight className="h-4 w-4 text-muted-foreground/40" />
            <span className="flex flex-wrap gap-1.5">
              {connected.map((c) => (
                <span
                  key={c}
                  className="rounded-lg border border-emerald-700/20 bg-emerald-700/5 px-2.5 py-1 text-emerald-700"
                >
                  {c}
                </span>
              ))}
            </span>
          </div>
          <p className="mt-4 text-sm text-muted-foreground">
            One client. One team. One work stream. One set of documents. One
            report.
          </p>
        </div>
      </div>

      {/* Right: branded team visual */}
      <div className="relative">
        <div className="absolute -inset-3 rounded-3xl bg-gradient-to-br from-amber-500/15 to-emerald-700/15 blur-2xl" />
        <BrandedVisual
          variant="team"
          className="relative border-border shadow-elegant"
        />
      </div>
    </div>
  </section>
);

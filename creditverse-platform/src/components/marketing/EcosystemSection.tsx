import { Link } from "react-router-dom";
import { ArrowRight } from "lucide-react";
import { BES_CORE_PRODUCTS, BES_FULL_SUITE } from "@/lib/bes-products";
import { AnimatedGauge } from "@/components/marketing/InteractiveStats";
import { BrandedVisual } from "@/components/marketing/BrandedVisual";

const supportingLayers = [
  "Client 360",
  "Documents",
  "Team",
  "Work",
  "Portals",
  "Reporting",
  "AI Assistance",
  "Integrations",
];

export const EcosystemSection = () => {
  const core = BES_CORE_PRODUCTS.filter((p) => p.id !== "crm");
  const crm = BES_CORE_PRODUCTS.find((p) => p.id === "crm")!;
  return (
    <section id="ecosystem" className="container py-24">
      <div className="mx-auto max-w-2xl text-center">
        <h2 className="text-3xl font-bold tracking-tight md:text-4xl">
          Independent when needed. Connected when useful.
        </h2>
        <p className="mt-4 text-muted-foreground">
          Each BES product works on its own. When you activate more than one,
          they connect around the same organization, team, client identity,
          documents, activity, permissions, and reporting.
        </p>
      </div>

      <div className="mt-12 grid items-center gap-12 lg:grid-cols-2">
        {/* Left: ecosystem branded visual */}
        <div className="relative order-2 lg:order-1">
          <div className="absolute -inset-3 rounded-3xl bg-gradient-to-br from-amber-500/15 to-emerald-700/15 blur-2xl" />
          <BrandedVisual
            variant="ecosystem"
            className="relative border-border shadow-elegant"
          />
        </div>

        {/* Right: interactive gauges + hierarchy */}
        <div className="order-1 lg:order-2">
          <div className="mb-8 flex flex-wrap items-start justify-center gap-8 sm:justify-around">
            <AnimatedGauge
              value={4}
              max={4}
              label="Standalone products"
              color="#EBAA15"
            />
            <AnimatedGauge
              value={1}
              max={1}
              label="Client 360"
              color="#005F4B"
            />
          </div>

          {/* BES — The Connected Platform */}
          <div className="rounded-2xl bg-gradient-charcoal p-6 text-center text-white shadow-elegant">
            <p className="text-xs font-semibold uppercase tracking-widest text-amber-400">
              BES — The Connected Platform
            </p>
            <h3 className="mt-2 text-xl font-bold">
              Credit + Funding Operations
            </h3>
          </div>

          <div className="mx-auto my-4 h-6 w-px bg-border" />

          {/* Core operational products */}
          <div className="grid gap-3 sm:grid-cols-3">
            {core.map((p) => (
              <Link
                key={p.id}
                to={`/${p.slug}`}
                className="group rounded-xl border border-border bg-card p-4 text-center transition-all hover:-translate-y-1 hover:border-amber-400/50 hover:shadow-elegant"
              >
                <div
                  className={`mx-auto flex h-10 w-10 items-center justify-center rounded-lg bg-gradient-to-br ${p.accent} text-white`}
                >
                  <p.icon className="h-5 w-5" />
                </div>
                <p className="mt-2 text-sm font-semibold">{p.name}</p>
                <p className="mt-auto inline-flex items-center gap-1 pt-2 text-xs font-medium text-emerald-700">
                  Standalone <ArrowRight className="h-3 w-3" />
                </p>
              </Link>
            ))}
          </div>

          <div className="mx-auto my-4 h-6 w-px bg-border" />

          {/* CRM + Full Suite */}
          <div className="grid gap-3 sm:grid-cols-2">
            <Link
              to={`/${crm.slug}`}
              className="rounded-xl border border-dashed border-border bg-muted/30 p-4 text-center transition-all hover:border-amber-400/40"
            >
              <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">
                Front-Office
              </p>
              <p className="mt-1 text-sm font-semibold">{crm.name}</p>
            </Link>
            <Link
              to={`/${BES_FULL_SUITE.slug}`}
              className="rounded-xl border border-amber-500/40 bg-amber-500/10 p-4 text-center transition-all hover:border-amber-500/60"
            >
              <p className="text-xs font-semibold uppercase tracking-widest text-amber-600">
                Connected Plan
              </p>
              <p className="mt-1 text-sm font-semibold">
                {BES_FULL_SUITE.name}
              </p>
            </Link>
          </div>
        </div>
      </div>

      {/* Supporting layer */}
      <div className="mx-auto mt-12 max-w-3xl rounded-2xl border border-border bg-muted/30 p-6">
        <p className="text-center text-xs font-semibold uppercase tracking-widest text-muted-foreground">
          Supporting Layer — shared across all products
        </p>
        <div className="mt-4 flex flex-wrap justify-center gap-2">
          {supportingLayers.map((l) => (
            <span
              key={l}
              className="rounded-lg border border-border bg-background px-3 py-1.5 text-sm text-foreground"
            >
              {l}
            </span>
          ))}
        </div>
      </div>
    </section>
  );
};

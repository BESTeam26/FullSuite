import { useState } from "react";
import { Check, ArrowRight, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Link } from "react-router-dom";
import { PricingTier } from "@/lib/bes-pricing";

export const PricingTable = ({ tiers }: { tiers: PricingTier[] }) => {
  const getGridCols = (count: number) => {
    if (count === 2) return "grid gap-6 md:grid-cols-2 max-w-3xl mx-auto";
    if (count === 3)
      return "grid gap-6 sm:grid-cols-2 lg:grid-cols-3 max-w-5xl mx-auto";
    return "grid gap-6 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 max-w-7xl mx-auto";
  };

  return (
    <div className={getGridCols(tiers.length)}>
      {tiers.map((t) => (
        <div
          key={t.id}
          className={`relative flex flex-col rounded-2xl border bg-card p-6 text-left transition-all hover:-translate-y-1 ${
            t.highlight
              ? "border-amber-500 shadow-glow md:-translate-y-2"
              : "border-border hover:border-amber-400/40 hover:shadow-elegant"
          }`}
        >
          {t.badge && (
            <span className="absolute -top-3 left-1/2 -translate-x-1/2 rounded-full bg-gradient-gold px-3 py-1 text-[11px] font-semibold text-charcoal whitespace-nowrap shadow-sm">
              {t.badge}
            </span>
          )}
          <h3 className="text-lg font-bold text-foreground">{t.name}</h3>
          <div className="mt-2 flex items-baseline gap-1">
            <span className="text-3xl font-black tracking-tight text-foreground">
              {t.price}
            </span>
            {t.period && (
              <span className="text-sm text-muted-foreground">{t.period}</span>
            )}
          </div>
          <p className="mt-2 text-sm text-muted-foreground">{t.blurb}</p>
          <div className="mt-4 space-y-1.5 text-xs text-muted-foreground border-y border-border/50 py-3">
            <p className="flex items-center gap-1.5 font-medium text-foreground">
              <Sparkles className="h-3.5 w-3.5 text-amber-500 shrink-0" />{" "}
              {t.seats}
            </p>
            <p className="flex items-center gap-1.5 font-medium text-foreground">
              <Sparkles className="h-3.5 w-3.5 text-amber-500 shrink-0" />{" "}
              {t.capacity}
            </p>
          </div>
          <ul className="mt-5 flex-1 space-y-2.5">
            {t.features.map((f) => (
              <li
                key={f}
                className="flex items-start gap-2 text-sm text-foreground"
              >
                <Check className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600 font-bold" />
                <span>{f}</span>
              </li>
            ))}
          </ul>
          <Button
            asChild
            className={`mt-6 w-full ${
              t.highlight
                ? "bg-gradient-gold text-charcoal hover:opacity-90 font-semibold shadow-md"
                : "bg-background text-foreground hover:bg-muted font-medium border border-border"
            }`}
            variant={t.highlight ? "default" : "outline"}
          >
            <Link to={t.to} className="flex items-center justify-center">
              {t.cta} <ArrowRight className="ml-1.5 h-4 w-4" />
            </Link>
          </Button>
        </div>
      ))}
    </div>
  );
};

export const ProductPricingSection = ({
  tiers,
  intro,
  note,
}: {
  tiers: PricingTier[];
  intro: string;
  note?: string;
}) => {
  const [annual, setAnnual] = useState(false);
  return (
    <section id="pricing" className="container py-20">
      <div className="mx-auto max-w-2xl text-center">
        <p className="text-sm font-semibold uppercase tracking-widest text-amber-600">
          Pricing
        </p>
        <h2 className="mt-3 text-3xl font-bold tracking-tight md:text-4xl">
          Start with what you need.
        </h2>
        <p className="mt-4 text-muted-foreground">{intro}</p>
      </div>

      <div className="mt-10 flex items-center justify-center gap-3">
        <span
          className={`text-sm ${!annual ? "font-semibold" : "text-muted-foreground"}`}
        >
          Monthly
        </span>
        <button
          onClick={() => setAnnual(!annual)}
          className="relative h-7 w-12 rounded-full bg-muted transition-colors"
          aria-label="Toggle billing cycle"
        >
          <span
            className={`absolute top-1 h-5 w-5 rounded-full bg-gradient-gold transition-all ${
              annual ? "left-6" : "left-1"
            }`}
          />
        </button>
        <span
          className={`text-sm ${annual ? "font-semibold" : "text-muted-foreground"}`}
        >
          Annual <span className="text-emerald-700">(-15%)</span>
        </span>
      </div>

      <div className="mt-12">
        <PricingTable tiers={tiers} />
      </div>

      {note && (
        <p className="mx-auto mt-10 max-w-2xl rounded-xl border border-border bg-muted/40 p-4 text-center text-sm text-muted-foreground">
          {note}
        </p>
      )}
    </section>
  );
};

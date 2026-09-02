import { Link } from "react-router-dom";
import { ArrowRight } from "lucide-react";
import { BES_PRODUCTS } from "@/lib/bes-products";
import { BrandedVisual } from "@/components/marketing/BrandedVisual";

type Variant =
  | "hero"
  | "creditops"
  | "fundingops"
  | "diy"
  | "fullsuite"
  | "crm"
  | "ecosystem"
  | "team";

const cards: { q: string; to: string; label: string; variant: Variant }[] = [
  {
    q: "I help people improve credit",
    to: "/creditops",
    label: "BES CreditOps",
    variant: "creditops",
  },
  {
    q: "I help businesses get funding",
    to: "/fundingops",
    label: "BES FundingOps",
    variant: "fundingops",
  },
  {
    q: "I offer both",
    to: "/full-suite",
    label: "BES Full Suite",
    variant: "fullsuite",
  },
  {
    q: "I want to offer a white-label DIY tool to my clients",
    to: "/diy-credit",
    label: "BES DIY Credit",
    variant: "diy",
  },
  {
    q: "I also need CRM + automation",
    to: "/crm",
    label: "BES CRM",
    variant: "crm",
  },
];

export const ProductSelector = () => (
  <section id="selector" className="bg-muted/40 py-24">
    <div className="container">
      <div className="mx-auto max-w-2xl text-center">
        <h2 className="text-3xl font-bold tracking-tight md:text-4xl">
          What do you need to run?
        </h2>
        <p className="mt-4 text-muted-foreground">
          Start with the product your business needs today. Connect more as you
          grow — without rebuilding your operation.
        </p>
      </div>
      <div className="mt-16 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
        {cards.map((c) => (
          <Link
            key={c.q}
            to={c.to}
            className="group flex flex-col overflow-hidden rounded-2xl border border-border bg-card transition-all hover:-translate-y-1 hover:border-amber-400/50 hover:shadow-elegant"
          >
            <div className="relative aspect-[16/10] overflow-hidden">
              <BrandedVisual
                variant={c.variant}
                className="h-full w-full rounded-none border-0"
              />
              <div className="absolute inset-0 bg-gradient-to-t from-charcoal/70 to-transparent" />
              <p className="absolute bottom-3 left-4 text-sm font-semibold text-white">
                {c.label}
              </p>
            </div>
            <div className="flex flex-1 flex-col p-6">
              <p className="text-lg font-semibold">{c.q}</p>
              <div className="mt-auto flex items-center gap-2 pt-6 text-sm font-medium text-emerald-700">
                Explore {c.label}
                <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-1" />
              </div>
            </div>
          </Link>
        ))}
      </div>

      {/* All products quick grid */}
      <div className="mt-20 grid gap-4 lg:grid-cols-5">
        {BES_PRODUCTS.map((p) => (
          <Link
            key={p.id}
            to={`/${p.slug}`}
            className="group rounded-xl border border-border bg-card p-5 transition-all hover:border-amber-400/50"
          >
            <div
              className={`flex h-9 w-9 items-center justify-center rounded-lg bg-gradient-to-br ${p.accent} text-white`}
            >
              <p.icon className="h-4 w-4" />
            </div>
            <p className="mt-3 text-sm font-semibold">{p.name}</p>
            <p className="text-xs text-muted-foreground">{p.tagline}</p>
          </Link>
        ))}
      </div>
    </div>
  </section>
);

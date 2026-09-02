import { Link } from "react-router-dom";
import { ArrowRight, Check, ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { MarketingNav } from "@/components/marketing/MarketingNav";
import { Footer } from "@/components/marketing/Footer";
import { CTA } from "@/components/marketing/CTA";
import { ProductPricingSection } from "@/components/marketing/PricingTable";
import { BrandedVisual } from "@/components/marketing/BrandedVisual";
import { useSeo, BASE_URL } from "@/lib/use-seo";
import { BesProduct } from "@/lib/bes-products";
import { getProductPricing } from "@/lib/bes-pricing";

export interface ProductPageProps {
  product: BesProduct;
  title: string;
  description: string;
  h1: string;
  subhead: string;
  keywords?: string;
  useCase?: { title: string; points: string[] }[];
  upsell?: { title: string; desc: string; to: string; cta: string }[];
  visualVariant?:
    | "hero"
    | "creditops"
    | "fundingops"
    | "diy"
    | "fullsuite"
    | "crm"
    | "ecosystem"
    | "team";
}

export const ProductPage = ({
  product,
  title,
  description,
  h1,
  subhead,
  keywords,
  useCase,
  upsell,
  visualVariant,
}: ProductPageProps) => {
  useSeo({
    title,
    description,
    canonical: `/${product.slug}`,
    keywords,
    jsonLd: [
      {
        "@context": "https://schema.org",
        "@type": "BreadcrumbList",
        itemListElement: [
          {
            "@type": "ListItem",
            position: 1,
            name: "Home",
            item: BASE_URL,
          },
          {
            "@type": "ListItem",
            position: 2,
            name: `BES ${product.name}`,
            item: `${BASE_URL}/${product.slug}`,
          },
        ],
      },
      {
        "@context": "https://schema.org",
        "@type": "SoftwareApplication",
        name: `BES ${product.name}`,
        applicationCategory: "BusinessApplication",
        operatingSystem: "Web",
        description: product.tagline,
        url: `${BASE_URL}/${product.slug}`,
        offers: {
          "@type": "Offer",
          name: `BES ${product.name}`,
          url: `${BASE_URL}/${product.slug}`,
        },
      },
    ],
  });

  const pricing = getProductPricing(product.id);

  return (
    <div className="min-h-screen bg-background">
      <MarketingNav />
      <main>
        {/* Hero */}
        <section className="relative overflow-hidden bg-gradient-charcoal py-20 text-white md:py-24">
          <div className="absolute inset-0 grid-pattern opacity-[0.06]" />
          <div className="absolute -right-40 top-0 h-96 w-96 rounded-full bg-amber-500/20 blur-[120px]" />
          <div className="container relative">
            <div className="grid items-center gap-12 lg:grid-cols-2">
              <div>
                <Link
                  to="/"
                  className="mb-6 inline-flex items-center gap-2 text-sm text-slate-300 transition-colors hover:text-white"
                >
                  <ArrowLeft className="h-4 w-4" /> Back to ecosystem
                </Link>
                <div className="flex items-center gap-3">
                  <div
                    className={`flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-br ${product.accent} text-white`}
                  >
                    <product.icon className="h-7 w-7" />
                  </div>
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-widest text-amber-400">
                      {product.position}
                    </p>
                    <h1 className="text-3xl font-bold tracking-tight md:text-5xl">
                      {h1}
                    </h1>
                  </div>
                </div>
                <p className="mt-6 max-w-xl text-pretty text-lg text-slate-300">
                  {subhead}
                </p>
                <p className="mt-2 max-w-xl text-sm text-slate-400">
                  For {product.audience}.
                </p>
                <div className="mt-8 flex flex-col gap-3 sm:flex-row">
                  <Button
                    asChild
                    size="lg"
                    className="bg-gradient-gold text-charcoal hover:opacity-90"
                  >
                    <Link to="/app">
                      {product.cta} <ArrowRight className="ml-1 h-4 w-4" />
                    </Link>
                  </Button>
                  <Button
                    asChild
                    size="lg"
                    variant="outline"
                    className="border-white/20 bg-transparent text-white hover:bg-white/10"
                  >
                    <a href="#capabilities">View capabilities</a>
                  </Button>
                </div>
              </div>
              {visualVariant && (
                <div className="relative">
                  <div className="absolute -inset-3 rounded-3xl bg-gradient-to-br from-amber-500/15 to-emerald-700/15 blur-2xl" />
                  <BrandedVisual
                    variant={visualVariant}
                    className="relative border-white/10"
                  />
                </div>
              )}
            </div>
          </div>
        </section>

        {/* Capabilities */}
        <section id="capabilities" className="container py-24">
          <h2 className="text-2xl font-bold tracking-tight md:text-3xl">
            What's inside {product.name}
          </h2>
          <div className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {product.capabilities.map((c) => (
              <div
                key={c}
                className="flex items-start gap-3 rounded-xl border border-border bg-card p-5"
              >
                <Check className="mt-0.5 h-5 w-5 shrink-0 text-emerald-700" />
                <span className="text-sm font-medium">{c}</span>
              </div>
            ))}
          </div>
        </section>

        {/* Use cases */}
        {useCase && (
          <section className="bg-muted/40 py-24">
            <div className="container">
              <h2 className="text-2xl font-bold tracking-tight md:text-3xl">
                Built for how you work
              </h2>
              <div className="mt-10 grid gap-6 lg:grid-cols-2">
                {useCase.map((u) => (
                  <div
                    key={u.title}
                    className="rounded-2xl border border-border bg-card p-8"
                  >
                    <h3 className="text-lg font-semibold">{u.title}</h3>
                    <ul className="mt-4 space-y-2">
                      {u.points.map((p) => (
                        <li
                          key={p}
                          className="flex items-start gap-2 text-sm text-muted-foreground"
                        >
                          <Check className="mt-0.5 h-4 w-4 shrink-0 text-emerald-700" />
                          {p}
                        </li>
                      ))}
                    </ul>
                  </div>
                ))}
              </div>
            </div>
          </section>
        )}

        {/* Standalone badge */}
        <section className="container py-16 text-center">
          <div
            className={`mx-auto max-w-xl rounded-2xl border ${
              product.standalone
                ? "border-emerald-700/30 bg-emerald-700/5"
                : "border-amber-500/30 bg-amber-500/5"
            } p-8`}
          >
            <p className="text-sm font-semibold uppercase tracking-wider text-emerald-700">
              {product.standalone
                ? "Works on its own"
                : "Connects the ecosystem"}
            </p>
            <p className="mt-3 text-muted-foreground">
              {product.standalone
                ? `${product.name} runs independently. Add FundingOps, CreditOps, DIY Credit, or the Full Suite later — without rebuilding your operation.`
                : `${product.name} extends the workspace by connecting modules around the same organization, team, client identity, documents, and activity.`}
            </p>
          </div>
        </section>

        {/* Pricing */}
        {pricing && (
          <ProductPricingSection
            tiers={pricing.tiers}
            intro={pricing.intro}
            note={pricing.note}
          />
        )}

        {/* Upsell */}
        {upsell && (
          <section className="container py-16">
            <h2 className="text-2xl font-bold tracking-tight md:text-3xl">
              Ready for the next opportunity?
            </h2>
            <div className="mt-8 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
              {upsell.map((u) => (
                <Link
                  key={u.title}
                  to={u.to}
                  className="group rounded-2xl border border-border bg-card p-6 transition-all hover:-translate-y-1 hover:border-amber-400/50 hover:shadow-elegant"
                >
                  <h3 className="font-semibold">{u.title}</h3>
                  <p className="mt-2 text-sm text-muted-foreground">{u.desc}</p>
                  <span className="mt-4 inline-flex items-center gap-1 text-sm font-medium text-emerald-700">
                    {u.cta}
                    <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-1" />
                  </span>
                </Link>
              ))}
            </div>
          </section>
        )}

        <CTA />
      </main>
      <Footer />
    </div>
  );
};

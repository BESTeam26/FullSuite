import { Link } from "react-router-dom";
import { ArrowRight, Check, Link2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { MarketingNav } from "@/components/marketing/MarketingNav";
import { Footer } from "@/components/marketing/Footer";
import { CTA } from "@/components/marketing/CTA";
import { useSeo, BASE_URL } from "@/lib/use-seo";

export interface SeoPageConfig {
  slug: string;
  title: string;
  description: string;
  h1: string;
  intro: string;
  primaryCta: { label: string; to: string };
  secondaryCta?: { label: string; to: string };
  modules: { title: string; desc: string }[];
  journey: string;
  jsonLdType?: string;
  keywords?: string;
  faqs?: { q: string; a: string }[];
  howTo?: { name: string; steps: string[] };
}

export const SeoProductPage = (cfg: SeoPageConfig) => {
  const breadcrumb = {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: [
      { "@type": "ListItem", position: 1, name: "Home", item: BASE_URL },
      {
        "@type": "ListItem",
        position: 2,
        name: cfg.h1,
        item: `${BASE_URL}/${cfg.slug}`,
      },
    ],
  };

  const app = {
    "@context": "https://schema.org",
    "@type": cfg.jsonLdType || "SoftwareApplication",
    name: cfg.h1,
    applicationCategory: "BusinessApplication",
    operatingSystem: "Web",
    description: cfg.description,
    url: `${BASE_URL}/${cfg.slug}`,
  };

  const faqJsonLd = cfg.faqs
    ? {
        "@context": "https://schema.org",
        "@type": "FAQPage",
        mainEntity: cfg.faqs.map((f) => ({
          "@type": "Question",
          name: f.q,
          acceptedAnswer: { "@type": "Answer", text: f.a },
        })),
      }
    : null;

  const howToJsonLd = cfg.howTo
    ? {
        "@context": "https://schema.org",
        "@type": "HowTo",
        name: cfg.howTo.name,
        step: cfg.howTo.steps.map((s, i) => ({
          "@type": "HowToStep",
          position: i + 1,
          text: s,
        })),
      }
    : null;

  const jsonLd = [breadcrumb, app, faqJsonLd, howToJsonLd].filter(
    Boolean,
  ) as object[];

  useSeo({
    title: cfg.title,
    description: cfg.description,
    canonical: `/${cfg.slug}`,
    keywords: cfg.keywords,
    jsonLd,
  });

  return (
    <div className="min-h-screen bg-background">
      <MarketingNav />
      <main>
        <section className="relative overflow-hidden bg-gradient-charcoal py-20 text-white md:py-28">
          <div className="absolute inset-0 grid-pattern opacity-[0.06]" />
          <div className="absolute -right-40 top-0 h-96 w-96 rounded-full bg-amber-500/20 blur-[120px]" />
          <div className="container relative">
            <nav className="mb-6 flex items-center gap-2 text-sm text-slate-300">
              <Link to="/" className="transition-colors hover:text-white">
                Home
              </Link>
              <span aria-hidden>/</span>
              <span className="text-white">{cfg.h1}</span>
            </nav>
            <h1 className="max-w-3xl text-3xl font-bold tracking-tight md:text-5xl">
              {cfg.h1}
            </h1>
            <p className="mt-6 max-w-2xl text-pretty text-lg text-slate-300">
              {cfg.intro}
            </p>
            <div className="mt-8 flex flex-col gap-3 sm:flex-row">
              <Button
                asChild
                size="lg"
                className="bg-gradient-gold text-charcoal hover:opacity-90"
              >
                <Link to={cfg.primaryCta.to}>
                  {cfg.primaryCta.label} <ArrowRight className="ml-1 h-4 w-4" />
                </Link>
              </Button>
              {cfg.secondaryCta && (
                <Button
                  asChild
                  size="lg"
                  variant="outline"
                  className="border-white/20 bg-transparent text-white hover:bg-white/10"
                >
                  <Link to={cfg.secondaryCta.to}>{cfg.secondaryCta.label}</Link>
                </Button>
              )}
            </div>
          </div>
        </section>

        <section className="container py-24">
          <h2 className="text-2xl font-bold tracking-tight md:text-3xl">
            What you get
          </h2>
          <div className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {cfg.modules.map((m) => (
              <div
                key={m.title}
                className="rounded-xl border border-border bg-card p-6"
              >
                <Check className="h-5 w-5 text-emerald-700" />
                <h3 className="mt-3 font-semibold">{m.title}</h3>
                <p className="mt-1 text-sm text-muted-foreground">{m.desc}</p>
              </div>
            ))}
          </div>
        </section>

        <section className="bg-muted/40 py-24">
          <div className="container">
            <h2 className="text-2xl font-bold tracking-tight md:text-3xl">
              How it connects
            </h2>
            <p className="mt-4 max-w-2xl text-muted-foreground">
              {cfg.journey}
            </p>
            <div className="mt-8 flex items-center gap-2 text-sm text-muted-foreground">
              <Link2 className="h-4 w-4" />
              <Link
                to="/"
                className="font-medium text-foreground hover:underline"
              >
                Explore the full BES ecosystem
              </Link>
            </div>
          </div>
        </section>

        {cfg.howTo && (
          <section className="container py-24">
            <h2 className="text-2xl font-bold tracking-tight md:text-3xl">
              {cfg.howTo.name}
            </h2>
            <ol className="mt-8 space-y-4">
              {cfg.howTo.steps.map((s, i) => (
                <li key={i} className="flex gap-4">
                  <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-amber-500/15 text-sm font-bold text-amber-700">
                    {i + 1}
                  </span>
                  <span className="pt-0.5 text-muted-foreground">{s}</span>
                </li>
              ))}
            </ol>
          </section>
        )}

        {cfg.faqs && (
          <section className="bg-muted/40 py-24">
            <div className="container max-w-3xl">
              <h2 className="text-2xl font-bold tracking-tight md:text-3xl">
                Frequently asked questions
              </h2>
              <div className="mt-8 space-y-6">
                {cfg.faqs.map((f) => (
                  <div key={f.q}>
                    <h3 className="font-semibold">{f.q}</h3>
                    <p className="mt-2 text-sm text-muted-foreground">{f.a}</p>
                  </div>
                ))}
              </div>
            </div>
          </section>
        )}

        <CTA />
      </main>
      <Footer />
    </div>
  );
};

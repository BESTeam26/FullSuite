import { MarketingNav } from "@/components/marketing/MarketingNav";
import { Footer } from "@/components/marketing/Footer";
import { CTA } from "@/components/marketing/CTA";
import { useSeo } from "@/lib/use-seo";
import {
  Link2,
  CreditCard,
  FileSignature,
  MessageSquare,
  Mail,
  Plug,
} from "lucide-react";

const categories = [
  {
    icon: Link2,
    title: "Credit monitoring providers",
    items: [
      "SmartCredit",
      "IdentityIQ",
      "MyScoreIQ",
      "MyFreeScoreNow",
      "Manual PDF import",
    ],
  },
  {
    icon: CreditCard,
    title: "Payments",
    items: [
      "Stripe",
      "Authorize.Net-style tokenization",
      "Hosted payment fields",
    ],
  },
  {
    icon: FileSignature,
    title: "E-signature",
    items: ["DocuSign", "Dropbox Sign", "CROA-mandated agreements"],
  },
  {
    icon: MessageSquare,
    title: "SMS & email",
    items: ["Twilio", "SendGrid", "Postmark", "Amazon SES"],
  },
  {
    icon: Mail,
    title: "Print & mail",
    items: ["LetterStream", "Lob", "USPS tracking"],
  },
  {
    icon: Plug,
    title: "CRM & automation",
    items: ["BES CRM", "Your existing CRM", "Webhooks & API"],
  },
];

export default function IntegrationsPage() {
  useSeo({
    title: "Integrations — Credit Monitoring, Payments, Mail & CRM | BES",
    description:
      "BES connects with credit monitoring providers (SmartCredit, IdentityIQ, MyScoreIQ, MyFreeScoreNow), payment processors, e-signature, SMS, email, print & mail, and CRM systems. The operational platform stays CRM-agnostic.",
    canonical: "/integrations",
    keywords:
      "credit monitoring integrations, SmartCredit, IdentityIQ, MyScoreIQ, MyFreeScoreNow, credit repair integrations, funding software integrations, Stripe, Twilio, DocuSign, LetterStream",
    jsonLd: [
      {
        "@context": "https://schema.org",
        "@type": "BreadcrumbList",
        itemListElement: [
          {
            "@type": "ListItem",
            position: 1,
            name: "Home",
            item: "https://creditverse-platform.vibepreview.com/",
          },
          {
            "@type": "ListItem",
            position: 2,
            name: "Integrations",
            item: "https://creditverse-platform.vibepreview.com/integrations",
          },
        ],
      },
      {
        "@context": "https://schema.org",
        "@type": "WebPage",
        name: "BES Integrations",
        description:
          "Credit monitoring, payments, e-sign, SMS, email, print & mail, and CRM integrations.",
      },
    ],
  });

  return (
    <div className="min-h-screen bg-background">
      <MarketingNav />
      <main>
        <section className="relative overflow-hidden bg-gradient-charcoal py-20 text-white md:py-28">
          <div className="absolute inset-0 grid-pattern opacity-[0.06]" />
          <div className="container relative">
            <h1 className="max-w-3xl text-3xl font-bold tracking-tight md:text-5xl">
              Integrations
            </h1>
            <p className="mt-6 max-w-2xl text-lg text-slate-300">
              BES connects with the tools your operation already uses — credit
              monitoring providers, payments, e-sign, SMS, email, print & mail,
              and CRM. The operational platform stays CRM-agnostic.
            </p>
          </div>
        </section>

        <section className="container py-24">
          <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {categories.map((c) => (
              <div
                key={c.title}
                className="rounded-2xl border border-border bg-card p-6"
              >
                <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-emerald-700/10 text-emerald-700">
                  <c.icon className="h-5 w-5" />
                </div>
                <h3 className="mt-4 font-semibold">{c.title}</h3>
                <ul className="mt-3 space-y-1.5">
                  {c.items.map((i) => (
                    <li key={i} className="text-sm text-muted-foreground">
                      {i}
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
          <p className="mt-8 text-center text-xs text-muted-foreground">
            Integration availability shown as planned capabilities. Provider
            agreements and certifications required before production use.
          </p>
        </section>

        <CTA />
      </main>
      <Footer />
    </div>
  );
}

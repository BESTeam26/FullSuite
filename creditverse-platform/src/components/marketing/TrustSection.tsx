import { Lock, FileCheck, Link2, ShieldQuestion } from "lucide-react";
import { AnimatedBar } from "@/components/marketing/InteractiveStats";

const trustItems = [
  {
    icon: Lock,
    title: "Security & access controls",
    desc: "MFA, role-based access, tenant isolation, field-level encryption, and an append-only audit trail for every action.",
    bars: [
      { label: "MFA & role-based access", value: 100 },
      { label: "Field-level encryption", value: 100 },
      { label: "Audit trail coverage", value: 100 },
    ],
  },
  {
    icon: FileCheck,
    title: "Compliance-aware operations",
    desc: "CROA controls, state registration tracking, billing eligibility, and consumer attestations built into the workflow — not bolted on.",
    bars: [
      { label: "CROA controls", value: 95 },
      { label: "Billing eligibility engine", value: 92 },
      { label: "Consumer attestation gates", value: 98 },
    ],
  },
  {
    icon: Link2,
    title: "Integrations",
    desc: "Credit monitoring providers, payment processors, e-sign, SMS, email, print & mail, and CRM connections.",
    bars: [
      { label: "Credit monitoring providers", value: 80 },
      { label: "Payment & e-sign", value: 90 },
      { label: "CRM automation bridge", value: 85 },
    ],
  },
  {
    icon: ShieldQuestion,
    title: "Human + AI philosophy",
    desc: "AI assists with speed. People make the judgments. BES keeps the record accountable — every action is logged.",
    bars: [
      { label: "AI-assisted tasks", value: 90 },
      { label: "Human-reviewed decisions", value: 100 },
    ],
  },
];

export const TrustSection = () => (
  <section className="container py-24">
    <div className="mx-auto max-w-2xl text-center">
      <h2 className="text-3xl font-bold tracking-tight md:text-4xl">
        Built for high-trust operations
      </h2>
      <p className="mt-4 text-muted-foreground">
        The platform your team, your clients, and your regulators can rely on.
      </p>
    </div>
    <div className="mt-16 grid gap-6 sm:grid-cols-2">
      {trustItems.map((t) => (
        <div
          key={t.title}
          className="rounded-2xl border border-border bg-card p-8"
        >
          <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-emerald-700/10 text-emerald-700">
            <t.icon className="h-5 w-5" />
          </div>
          <h3 className="mt-4 text-lg font-semibold">{t.title}</h3>
          <p className="mt-2 text-sm text-muted-foreground">{t.desc}</p>
          <div className="mt-6 space-y-3">
            {t.bars.map((b, i) => (
              <AnimatedBar
                key={b.label}
                label={b.label}
                value={b.value}
                max={100}
                delay={i * 100}
              />
            ))}
          </div>
        </div>
      ))}
    </div>
  </section>
);

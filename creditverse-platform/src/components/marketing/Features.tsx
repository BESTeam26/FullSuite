import {
  Users,
  ScanSearch,
  FolderLock,
  FileCheck2,
  Scale,
  Workflow,
  BarChart3,
  Building2,
  ShieldCheck,
} from "lucide-react";

const features = [
  {
    icon: Users,
    title: "Client CRM & lifecycle",
    desc: "Leads, prospects, clients, household relationships, pipeline, notes, tasks and appointments in one record with full audit history.",
  },
  {
    icon: ScanSearch,
    title: "Accuracy Inspector",
    desc: "Field-level three-bureau comparison surfaces discrepancies without declaring them illegal — the consumer verifies before any dispute.",
  },
  {
    icon: FolderLock,
    title: "Evidence Vault",
    desc: "Statements, IDs, correspondence and consumer explanations linked to each issue with immutable provenance and versioning.",
  },
  {
    icon: FileCheck2,
    title: "Issue Workbench",
    desc: "Issue → evidence → attestation → draft → QA → approval → delivery → response → disposition. Not just a letter generator.",
  },
  {
    icon: Scale,
    title: "Compliance Center",
    desc: "CROA/state rules, registration & bond tracker, contract & cancellation engine, and an AI marketing-compliance linter.",
  },
  {
    icon: Workflow,
    title: "Managed Operations",
    desc: "Cross-tenant work queues, maker-checker QA, SLAs and delegated scopes for your outsourcing team — no over-access.",
  },
  {
    icon: BarChart3,
    title: "Reporting & analytics",
    desc: "Deletion rates, score lifts, QA pass rates, SLA adherence and team productivity across the whole operation.",
  },
  {
    icon: Building2,
    title: "Multi-tenant & white-label",
    desc: "Per-agency branding, domains, seats, locations and roles — with a white-label DIY portal for each tenant's consumers.",
  },
  {
    icon: ShieldCheck,
    title: "Audit & billing ledger",
    desc: "Compliance-aware billing that blocks advance fees, plus an append-only audit trail of who did what, when, and why.",
  },
];

export const Features = () => (
  <section id="features" className="container py-24">
    <div className="mx-auto max-w-2xl text-center">
      <h2 className="text-3xl font-bold tracking-tight md:text-4xl">
        The operating system for compliant credit-accuracy businesses
      </h2>
      <p className="mt-4 text-muted-foreground">
        The best of CRC, DisputeFox, CDM, Creditfixrr and Dispute Beast —
        rebuilt around verified facts, evidence, and auditability instead of
        template letters.
      </p>
    </div>
    <div className="mt-16 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
      {features.map((f) => (
        <div
          key={f.title}
          className="group rounded-2xl border border-border bg-card p-6 transition-all hover:-translate-y-1 hover:border-amber-400/50 hover:shadow-elegant"
        >
          <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-emerald-700/10 text-emerald-700 transition-colors group-hover:bg-emerald-700 group-hover:text-white">
            <f.icon className="h-5 w-5" />
          </div>
          <h3 className="mt-4 text-lg font-semibold">{f.title}</h3>
          <p className="mt-2 text-sm text-muted-foreground">{f.desc}</p>
        </div>
      ))}
    </div>
  </section>
);

import { Check, FileCheck, Link2, Lock, ShieldQuestion } from "lucide-react";

/**
 * What the platform actually does, in plain claims that can be checked.
 *
 * This section used to carry animated percentage bars — "MFA & role-based
 * access 100%", "Field-level encryption 100%", "Billing eligibility engine
 * 92%", "Credit monitoring providers 80%". They were invented, and several
 * described things that do not exist: there is no MFA, no field-level
 * encryption and no billing-eligibility engine. Publishing security and
 * compliance claims that are not true is the worst version of made-up data,
 * so the numbers are gone and each item now says only what is real today.
 */
const trustItems = [
  {
    icon: Lock,
    title: "Access is decided in the database",
    desc:
      "Every table has row-level security, and every write checks the person's role, scope and assignment again on the server. Hiding a button is never the protection. A tenant's records are unreachable from another tenant, and BES staff reach a customer's work only under a live engagement.",
    points: [
      "Row-level security on every table",
      "Permissions re-checked inside each writer",
      "Append-only audit of who changed what, and what it was before",
    ],
  },
  {
    icon: FileCheck,
    title: "Compliance built into the workflow",
    desc:
      "A dispute letter passes an approval before it can be mailed, and who approved it is recorded on the letter. Statutory response clocks run from the date a letter went out. Findings are stated as differences to check, never as legal conclusions.",
    points: [
      "Approval gate before any letter is sent",
      "Response clocks computed, not typed",
      "Client agreements and disclosures kept by version",
    ],
  },
  {
    icon: Link2,
    title: "Integrations, honestly described",
    desc:
      "Credit reports import from PDF or CSV today, and a scan can be read for you. Posted letters, payments, e-signature and the CRM bridge are built against their providers and switch on when their accounts are connected — the platform says which of those are live rather than implying all of them are.",
    points: [
      "PDF and CSV report import, with every item reviewed before it saves",
      "Email and posted letters through connected providers",
      "A screen tells you what is connected and what is not",
    ],
  },
  {
    icon: ShieldQuestion,
    title: "People decide; the record proves it",
    desc:
      "The assistant reads and drafts. Deterministic rules compute what must be the same every time. A person decides what to dispute, what a letter says and when a file is funded — and the audit shows who decided.",
    points: [
      "No draft becomes an action on its own",
      "No model is asked for a legal or lending judgement",
      "Every meaningful change carries an actor and a timestamp",
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
          <ul className="mt-6 space-y-2">
            {t.points.map((point) => (
              <li key={point} className="flex items-start gap-2 text-sm text-foreground">
                <Check className="mt-0.5 h-4 w-4 shrink-0 text-emerald-700" />
                <span>{point}</span>
              </li>
            ))}
          </ul>
        </div>
      ))}
    </div>
  </section>
);

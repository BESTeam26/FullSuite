import { Link } from "react-router-dom";
import { Check, ArrowRight } from "lucide-react";

const scenarios = [
  {
    title: "BES CreditOps only",
    desc: "Complete credit-repair operations. No FundingOps required.",
    points: ["Client management", "Dispute operations", "Letters & progress"],
    to: "/creditops",
  },
  {
    title: "BES FundingOps only",
    desc: "Complete funding operations. No CreditOps required.",
    points: ["Applications", "Deal packaging", "Lender intelligence"],
    to: "/fundingops",
  },
  {
    title: "CreditOps + FundingOps",
    desc: "One Client 360. Two specialized operational workflows.",
    points: [
      "Shared client record",
      "Credit-to-funding transitions",
      "Unified reporting",
    ],
    to: "/full-suite",
  },
  {
    title: "BES Full Suite",
    desc: "The connected plan — Credit + Funding + DIY Credit + CRM + operational intelligence.",
    points: [
      "Everything above",
      "Operational intelligence",
      "Advanced reporting",
    ],
    to: "/full-suite",
  },
];

export const StandaloneConnected = () => (
  <section className="container py-24">
    <div className="mx-auto max-w-2xl text-center">
      <h2 className="text-3xl font-bold tracking-tight md:text-4xl">
        Use one. Connect two. Run the whole ecosystem.
      </h2>
      <p className="mt-4 text-muted-foreground">
        Purchasing another module extends the workspace — it never creates
        another disconnected account. Full Suite isn't a separate system; it's
        the BES platform with every module activated.
      </p>
    </div>
    <div className="mt-16 grid gap-6 lg:grid-cols-4">
      {scenarios.map((s) => (
        <Link
          key={s.title}
          to={s.to}
          className="group flex flex-col rounded-2xl border border-border bg-card p-6 transition-all hover:-translate-y-1 hover:border-amber-400/50 hover:shadow-elegant"
        >
          <h3 className="font-semibold">{s.title}</h3>
          <p className="mt-2 text-sm text-muted-foreground">{s.desc}</p>
          <ul className="mt-4 space-y-2">
            {s.points.map((p) => (
              <li
                key={p}
                className="flex items-start gap-2 text-sm text-foreground"
              >
                <Check className="mt-0.5 h-4 w-4 shrink-0 text-emerald-700" />
                {p}
              </li>
            ))}
          </ul>
          <span className="mt-auto flex items-center gap-1 pt-6 text-xs font-medium text-emerald-700">
            Explore <ArrowRight className="h-3 w-3" />
          </span>
        </Link>
      ))}
    </div>
  </section>
);

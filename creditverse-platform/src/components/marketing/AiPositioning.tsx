import { Cpu, Brain, ShieldCheck } from "lucide-react";
import { AnimatedBar } from "@/components/marketing/InteractiveStats";

const principles = [
  {
    icon: Cpu,
    title: "AI for speed",
    desc: "AI assists with analysis, extraction, summaries, drafting, document intelligence, workflow assistance, and operational insights — so your team spends less time on manual data work.",
  },
  {
    icon: Brain,
    title: "People for judgment",
    desc: "AI never makes lender approvals or legal determinations. A human reviews every legal conclusion, compliance escalation, and outcome decision before it leaves the platform.",
  },
  {
    icon: ShieldCheck,
    title: "BES for accountability",
    desc: "Every action — AI-assisted or human-approved — is logged in an immutable audit trail. Who did what, when, and why.",
  },
];

export const AiPositioning = () => (
  <section className="bg-gradient-charcoal py-24 text-white">
    <div className="container">
      <div className="mx-auto max-w-2xl text-center">
        <p className="text-sm font-semibold uppercase tracking-widest text-amber-400">
          AI positioning
        </p>
        <h2 className="mt-3 text-3xl font-bold tracking-tight md:text-4xl">
          AI for speed. People for judgment. BES for accountability.
        </h2>
        <p className="mt-4 text-slate-300">
          BES is not an "AI credit repair platform." AI is an enabling
          capability — it assists, it never decides.
        </p>
      </div>
      <div className="mt-16 grid gap-6 md:grid-cols-3">
        {principles.map((p) => (
          <div
            key={p.title}
            className="rounded-2xl border border-white/10 bg-white/5 p-8 backdrop-blur"
          >
            <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-amber-500/15 text-amber-300">
              <p.icon className="h-6 w-6" />
            </div>
            <h3 className="mt-4 text-lg font-semibold">{p.title}</h3>
            <p className="mt-2 text-sm text-slate-300">{p.desc}</p>
          </div>
        ))}
      </div>

      {/* AI-assisted task breakdown */}
      <div className="mx-auto mt-12 max-w-2xl rounded-2xl border border-white/10 bg-white/5 p-8">
        <p className="text-center text-sm font-semibold uppercase tracking-widest text-amber-400">
          What AI assists with
        </p>
        <div className="mt-6 space-y-4">
          <AnimatedBar
            label="Report analysis & extraction"
            value={95}
            max={100}
            color="bg-gradient-gold"
            light
          />
          <AnimatedBar
            label="Dispute drafting assistance"
            value={88}
            max={100}
            color="bg-gradient-gold"
            delay={150}
            light
          />
          <AnimatedBar
            label="Progress & summary reports"
            value={92}
            max={100}
            color="bg-gradient-gold"
            delay={300}
            light
          />
          <AnimatedBar
            label="Legal / lender decisions (human-only)"
            value={0}
            max={100}
            color="bg-emerald-600"
            delay={450}
            light
          />
        </div>
      </div>
    </div>
  </section>
);

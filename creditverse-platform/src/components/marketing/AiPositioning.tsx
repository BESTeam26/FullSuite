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

      {/* What the assistant does, and what it never does. These used to be
          four animated bars reading 95%, 88% and 92% — percentages of nothing,
          on a public page where a prospect might rely on them. The rule they
          were trying to express is real and needs no number. */}
      <div className="mx-auto mt-12 max-w-2xl rounded-2xl border border-white/10 bg-white/5 p-8">
        <p className="text-center text-sm font-semibold uppercase tracking-widest text-amber-400">
          Where the line sits
        </p>
        <dl className="mt-6 space-y-4 text-sm">
          <div>
            <dt className="font-semibold text-white">The assistant reads and drafts</dt>
            <dd className="mt-1 text-slate-300">
              It transcribes a scanned report into a review grid, rephrases a letter in the consumer's own voice, and
              puts an analysis into plain words. Every one of those lands in front of a person before it counts.
            </dd>
          </div>
          <div>
            <dt className="font-semibold text-white">The engine decides what is deterministic</dt>
            <dd className="mt-1 text-slate-300">
              Program fit against a stored lender policy, statutory response clocks, score factors, production and
              End of Day are computed in code and are the same every time they run.
            </dd>
          </div>
          <div>
            <dt className="font-semibold text-white">People decide everything that matters</dt>
            <dd className="mt-1 text-slate-300">
              What to dispute, what a letter says, whether a document is acceptable, when a file is funded. No draft
              becomes an action on its own, and no model is asked for a legal or lending judgement.
            </dd>
          </div>
        </dl>
      </div>
    </div>
  </section>
);

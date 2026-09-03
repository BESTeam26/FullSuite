import { GraduationCap, BookOpen, Trophy, MessageSquare } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Link } from "react-router-dom";

const items = [
  {
    icon: BookOpen,
    title: "Adaptive Credit Academy",
    desc: "How to read a tradeline, accurate vs. inaccurate info, CRA vs. furnisher, identity-theft procedures — built around the consumer's situation.",
  },
  {
    icon: GraduationCap,
    title: "Consumer-directed review",
    desc: "Learn → review → verify → document → decide → approve → track. The consumer states and attests the facts, not an attack engine.",
  },
  {
    icon: Trophy,
    title: "Progress & milestones",
    desc: "Gamified score tracking and educational completion keep consumers engaged and reduce support load.",
  },
  {
    icon: MessageSquare,
    title: "Fully white-labeled",
    desc: "Your logo, your colors, your domain — each tenant's consumers see your brand, not ours.",
  },
];

export const DiySection = () => (
  <section id="diy" className="container py-24">
    <div className="grid items-center gap-16 lg:grid-cols-2">
      <div>
        <span className="text-sm font-semibold uppercase tracking-wider text-emerald-700">
          White-label consumer OS
        </span>
        <h2 className="mt-3 text-3xl font-bold tracking-tight md:text-4xl">
          A consumer DIY portal that multi-channels your expertise
        </h2>
        <p className="mt-4 text-muted-foreground">
          Offer a self-serve education and factual-review track alongside your
          done-for-you service. Capture DIY consumers, upsell to full-service,
          and keep your brand front and center — with consumer attestations that
          make direct disputes defensible.
        </p>
        <div className="mt-8 grid gap-6 sm:grid-cols-2">
          {items.map((i) => (
            <div key={i.title}>
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-emerald-700/10 text-emerald-700">
                <i.icon className="h-5 w-5" />
              </div>
              <h3 className="mt-3 font-semibold">{i.title}</h3>
              <p className="mt-1 text-sm text-muted-foreground">{i.desc}</p>
            </div>
          ))}
        </div>
        <Button
          asChild
          className="mt-8 bg-gradient-gold text-charcoal hover:opacity-90"
        >
          <Link to="/portal">See the consumer portal</Link>
        </Button>
      </div>

      <div className="relative rounded-2xl border border-border bg-gradient-charcoal p-8 text-white shadow-elegant">
        <div className="absolute -right-10 -top-10 h-40 w-40 rounded-full bg-amber-500/20 blur-3xl" />
        <div className="relative">
          <div className="flex items-center gap-2 text-sm text-amber-300">
            <GraduationCap className="h-5 w-5" /> Apex Credit Academy
          </div>
          <h3 className="mt-4 text-2xl font-bold">Your Credit Journey</h3>
          <div className="mt-6 space-y-3">
            {[
              { t: "Understanding your credit report", p: 100 },
              { t: "Identifying factual errors", p: 60 },
              { t: "Rebuilding positive history", p: 25 },
            ].map((c) => (
              <div
                key={c.t}
                className="rounded-xl border border-white/10 bg-white/5 p-4"
              >
                <div className="flex items-center justify-between text-sm">
                  <span>{c.t}</span>
                  <span className="text-amber-300">{c.p}%</span>
                </div>
                <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-white/10">
                  <div
                    className="h-full rounded-full bg-gradient-gold"
                    style={{ width: `${c.p}%` }}
                  />
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  </section>
);

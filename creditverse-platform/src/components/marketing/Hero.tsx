import { Link } from "react-router-dom";
import {
  ArrowRight,
  Layers,
  Banknote,
  ShieldCheck,
  User,
  Workflow,
  Sparkles,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { AnimatedStat } from "@/components/marketing/InteractiveStats";
import { BrandedVisual } from "@/components/marketing/BrandedVisual";

export const Hero = () => (
  <section className="relative overflow-hidden bg-gradient-charcoal text-white">
    <div className="absolute inset-0 grid-pattern opacity-[0.06]" />
    <div className="absolute -right-40 top-0 h-96 w-96 rounded-full bg-amber-500/20 blur-[120px]" />
    <div className="absolute -left-40 bottom-0 h-96 w-96 rounded-full bg-emerald-700/25 blur-[120px]" />
    <div className="container relative py-20 md:py-28">
      <div className="grid items-center gap-12 lg:grid-cols-2">
        {/* Left: copy + CTAs */}
        <div className="max-w-xl">
          <Badge className="mb-6 border-amber-400/30 bg-amber-400/10 text-amber-300">
            BES — The Connected Platform
          </Badge>
          <h1 className="text-balance text-4xl font-bold tracking-tight md:text-5xl xl:text-6xl">
            Credit + Funding Operations.{" "}
            <span className="bg-gradient-to-r from-amber-400 to-amber-300 bg-clip-text text-transparent">
              One Connected Platform.
            </span>
          </h1>
          <p className="mt-6 text-pretty text-lg text-slate-300">
            Start with what you need. Connect more as you grow. BES CreditOps,
            FundingOps, DIY Credit, and CRM each work independently — and
            connect into one Full Suite when your business is ready.
          </p>
          <div className="mt-8 flex flex-col gap-4 sm:flex-row">
            <Button
              asChild
              size="lg"
              className="bg-gradient-gold text-charcoal hover:opacity-90"
            >
              <a href="#selector">
                Find the Right Solution <ArrowRight className="h-4 w-4" />
              </a>
            </Button>
            <Button
              asChild
              size="lg"
              variant="outline"
              className="border-white/20 bg-transparent text-white hover:bg-white/10"
            >
              <a href="#ecosystem">Explore the Platform</a>
            </Button>
          </div>
          <p className="mt-6 text-sm text-slate-400">
            Built for credit repair companies, funding brokers, and teams that
            offer both.
          </p>

          {/* Animated stats */}
          <div className="mt-10 grid grid-cols-3 gap-4 border-t border-white/10 pt-8">
            <AnimatedStat light value={4} label="Connected products" />
            <AnimatedStat light value={1} label="Client 360 record" />
            <AnimatedStat
              light
              value={100}
              prefix="%"
              label="Audit-trail logged"
            />
          </div>
        </div>

        {/* Right: branded product preview */}
        <div className="relative">
          <div className="absolute -inset-4 rounded-3xl bg-gradient-to-br from-amber-500/20 to-emerald-700/20 blur-2xl" />
          <BrandedVisual variant="hero" className="relative" />
          <div className="absolute inset-x-0 bottom-0 flex items-center justify-between rounded-b-2xl bg-gradient-to-t from-charcoal/90 to-transparent p-5">
            <div className="flex items-center gap-2 text-sm text-slate-200">
              <Sparkles className="h-4 w-4 text-amber-400" />
              Live operations workspace
            </div>
            <Button
              asChild
              size="sm"
              className="bg-gradient-gold text-charcoal hover:opacity-90"
            >
              <Link to="/app">
                Launch <ArrowRight className="ml-1 h-3.5 w-3.5" />
              </Link>
            </Button>
          </div>
        </div>
      </div>

      {/* BES product preview strip */}
      <div className="mx-auto mt-16 grid max-w-5xl gap-4 sm:grid-cols-2 lg:grid-cols-5">
        {[
          {
            icon: ShieldCheck,
            name: "BES CreditOps",
            sub: "Credit repair operations",
            to: "/creditops",
          },
          {
            icon: Banknote,
            name: "BES FundingOps",
            sub: "Business funding operations",
            to: "/fundingops",
          },
          {
            icon: User,
            name: "BES DIY Credit",
            sub: "White-label consumer portal",
            to: "/diy-credit",
          },
          {
            icon: Workflow,
            name: "BES CRM",
            sub: "Front-office automation",
            to: "/crm",
          },
          {
            icon: Layers,
            name: "BES Full Suite",
            sub: "Everything connected",
            to: "/full-suite",
          },
        ].map((p) => (
          <Link
            key={p.name}
            to={p.to}
            className="group rounded-2xl border border-white/10 bg-white/5 p-5 backdrop-blur transition-all hover:-translate-y-1 hover:border-amber-400/40 hover:bg-white/10"
          >
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-amber-500/15 text-amber-300">
              <p.icon className="h-5 w-5" />
            </div>
            <p className="mt-3 font-semibold text-white">{p.name}</p>
            <p className="text-xs text-slate-400">{p.sub}</p>
          </Link>
        ))}
      </div>
    </div>
  </section>
);

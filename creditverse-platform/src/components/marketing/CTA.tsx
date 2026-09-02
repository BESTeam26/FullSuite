import { ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Link } from "react-router-dom";

export const CTA = () => (
  <section className="container py-24">
    <div className="relative overflow-hidden rounded-3xl bg-gradient-charcoal px-8 py-16 text-center text-white md:px-16">
      <div className="absolute inset-0 grid-pattern opacity-[0.07]" />
      <div className="absolute -left-20 bottom-0 h-60 w-60 rounded-full bg-amber-500/20 blur-[100px]" />
      <div className="absolute -right-20 top-0 h-60 w-60 rounded-full bg-emerald-700/25 blur-[100px]" />
      <div className="relative mx-auto max-w-2xl">
        <h2 className="text-3xl font-bold tracking-tight md:text-4xl">
          Start with what you need. Connect more as you grow.
        </h2>
        <p className="mt-4 text-slate-300">
          Run credit repair, business funding, or both from one operating system
          built for the work behind the sale.
        </p>
        <div className="mt-8 flex flex-col items-center justify-center gap-4 sm:flex-row">
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
            <Link to="/app">Launch the platform</Link>
          </Button>
        </div>
      </div>
    </div>
  </section>
);

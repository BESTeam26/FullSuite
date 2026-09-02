import { ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Link } from "react-router-dom";
import { HOMEPAGE_PRICING_TIERS } from "@/lib/bes-pricing";
import { PricingTable } from "@/components/marketing/PricingTable";

export const Pricing = () => (
  <section id="pricing" className="container py-24">
    <div className="mx-auto max-w-2xl text-center">
      <p className="text-sm font-semibold uppercase tracking-widest text-amber-600">
        Pricing
      </p>
      <h2 className="mt-3 text-3xl font-bold tracking-tight md:text-4xl">
        Start with what you need. Connect more as you grow.
      </h2>
      <p className="mt-4 text-muted-foreground">
        Each product is purchased and used independently. Add modules without
        rebuilding your operation. Full Suite is a connected plan — not a fifth
        system.
      </p>
    </div>
    <div className="mt-16">
      <PricingTable tiers={HOMEPAGE_PRICING_TIERS} />
    </div>
    <div className="mt-12 text-center">
      <Button asChild variant="outline">
        <Link to="/full-suite">
          Compare all plans <ArrowRight className="ml-1 h-4 w-4" />
        </Link>
      </Button>
    </div>
  </section>
);

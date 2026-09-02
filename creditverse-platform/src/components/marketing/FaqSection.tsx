import { ChevronDown } from "lucide-react";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";

const faqs = [
  {
    q: "Do I have to buy the entire ecosystem on day one?",
    a: "No. Start with the product your business needs today — CreditOps, FundingOps, or DIY Credit. Each works independently. Add more as you grow; activating another module extends your workspace, it never creates a disconnected account.",
  },
  {
    q: "Can I use CreditOps without FundingOps?",
    a: "Yes. CreditOps is a complete credit-repair operations product on its own. FundingOps is not required. The same is true in reverse — FundingOps works independently without CreditOps.",
  },
  {
    q: "Does BES replace my CRM?",
    a: "Not necessarily. BES is CRM-agnostic. You can keep your front-office CRM and let BES handle the operational work behind the sale. If you need lead capture, funnels, and automation, BES CRM can provide or connect that layer.",
  },
  {
    q: "If a credit client becomes a funding client, do they start over?",
    a: "No. When multiple products are activated, they connect around the same organization, team, client identity, documents, activity, permissions, and reporting. A credit client can become a funding client without a disconnected record.",
  },
  {
    q: "Does BES use AI?",
    a: "Yes — as an enabling capability. AI assists with analysis, extraction, summaries, drafting, and workflow intelligence. It never makes lender approvals or legal determinations. People make the judgment; BES keeps the record accountable.",
  },
  {
    q: "Does credit improvement guarantee funding approval?",
    a: "No. Credit improvement does not guarantee funding. The funding-readiness review may identify credit or other readiness factors requiring attention, but completing credit work is not a guarantee of any funding outcome.",
  },
];

export const FaqSection = () => (
  <section className="bg-muted/40 py-24">
    <div className="container">
      <div className="mx-auto max-w-2xl text-center">
        <h2 className="text-3xl font-bold tracking-tight md:text-4xl">
          Frequently asked questions
        </h2>
      </div>
      <div className="mx-auto mt-12 max-w-3xl">
        <Accordion type="single" collapsible className="space-y-3">
          {faqs.map((f, i) => (
            <AccordionItem
              key={i}
              value={`item-${i}`}
              className="rounded-xl border border-border bg-card px-6"
            >
              <AccordionTrigger className="text-left text-base font-semibold">
                <span className="flex items-center gap-2">
                  <ChevronDown className="h-4 w-4 text-amber-500" />
                  {f.q}
                </span>
              </AccordionTrigger>
              <AccordionContent className="text-muted-foreground">
                {f.a}
              </AccordionContent>
            </AccordionItem>
          ))}
        </Accordion>
      </div>
    </div>
  </section>
);

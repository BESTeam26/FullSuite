import { ProductPage } from "@/components/marketing/ProductPage";
import { getProduct } from "@/lib/bes-products";

const product = getProduct("full-suite")!;

export default function FullSuitePage() {
  return (
    <ProductPage
      product={product}
      title="Full Suite — Credit + Funding, One Connected Operation | BES"
      description="The BES Full Suite connects CreditOps and FundingOps around one Client 360, shared documents, team, tasks, and activity — with credit-to-funding and funding-to-credit transitions, operational intelligence, and advanced reporting."
      keywords="credit repair and funding software, credit and funding platform, BES full suite, connected credit and funding, credit to funding, funding to credit"
      h1="Full Suite"
      subhead="Credit + Funding. One connected operation. Not a bundle discount — the highest-value connected operating environment. CreditOps and FundingOps share one Client 360, documents, team, tasks, and activity, with credit-to-funding and funding-to-credit transitions."
      visualVariant="fullsuite"
      useCase={[
        {
          title: "One client, two workflows",
          points: [
            "Shared Client 360",
            "Shared documents & tasks",
            "Shared team & activity timeline",
            "Credit-to-funding transitions",
            "Funding-to-credit transitions",
          ],
        },
        {
          title: "Operational intelligence",
          points: [
            "Advanced reporting",
            "Unified client & partner experience",
            "Operational visibility across both lines",
            "Cross-product insights",
          ],
        },
      ]}
      upsell={[
        {
          title: "Need a front-office CRM?",
          desc: "BES CRM can provide or connect the lead-capture and automation layer — CreditOps and FundingOps stay CRM-agnostic.",
          to: "/crm",
          cta: "Explore BES CRM",
        },
      ]}
    />
  );
}

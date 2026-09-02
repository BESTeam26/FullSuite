import { ProductPage } from "@/components/marketing/ProductPage";
import { getProduct } from "@/lib/bes-products";

const product = getProduct("creditops")!;

export default function CreditOpsPage() {
  return (
    <ProductPage
      product={product}
      title="CreditOps — Credit Repair Fulfillment & Operations Software | BES"
      description="CreditOps is credit repair fulfillment & operations software: client management, 3-bureau report importing, dispute operations, evidence, rounds, letters, complaints, mailing, reimports, progress tracking, team assignments, QA, and a client portal."
      keywords="credit repair software, credit repair operations, dispute operations, credit repair fulfillment, 3 bureau report import, credit repair CRM, white label credit repair"
      h1="CreditOps"
      subhead="Credit repair fulfillment & operations software. Run client management, report importing, analysis, dispute operations, evidence, rounds, letters, complaints, mailing, reimports, and progress tracking — with team assignments, QA, and a client portal."
      visualVariant="creditops"
      useCase={[
        {
          title: "Fulfillment operations",
          points: [
            "Client management & portal",
            "3-bureau credit report importing",
            "Credit analysis & dispute operations",
            "Evidence vault",
            "Round management & escalation",
          ],
        },
        {
          title: "Letters, mail & progress",
          points: [
            "Letters, complaints & mailing",
            "Reimports & before/after comparison",
            "Progress tracking & reporting",
            "Team assignments & QA",
            "AI-assisted workflows",
          ],
        },
      ]}
      upsell={[
        {
          title: "Add funding operations",
          desc: "When a credit client becomes funding-ready, FundingOps extends the same workspace — no disconnected record.",
          to: "/fundingops",
          cta: "Explore FundingOps",
        },
        {
          title: "Offer DIY credit too",
          desc: "Capture self-service consumers and upsell to your done-for-you service with DIY Credit.",
          to: "/diy-credit",
          cta: "Explore DIY Credit",
        },
        {
          title: "Run both as one",
          desc: "Connect CreditOps and FundingOps into one Client 360 with the Full Suite.",
          to: "/full-suite",
          cta: "Explore the Full Suite",
        },
      ]}
    />
  );
}

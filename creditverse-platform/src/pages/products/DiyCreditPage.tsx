import { ProductPage } from "@/components/marketing/ProductPage";
import { getProduct } from "@/lib/bes-products";

const product = getProduct("diy-credit")!;

export default function DiyCreditPage() {
  return (
    <ProductPage
      product={product}
      title="BES DIY Credit — White-Label Consumer Credit Platform | BES"
      description="BES DIY Credit is a white-label B2B2C consumer credit platform. BES sells the software to your organization; you offer it to your consumers under your own brand. Same credit-intelligence engine as CreditOps, simpler consumer surface."
      keywords="white label credit repair software, DIY credit repair, consumer credit platform, B2B2C credit software, white label credit portal, credit education tool"
      h1="BES DIY Credit"
      subhead="A white-label consumer credit platform your organization offers under its own brand. Consumers get guided credit review, issue identification, evidence organization, dispute preparation with attestation, and progress tracking — all under your brand. One client keeps one identity across DIY, CreditOps, and FundingOps."
      visualVariant="diy"
      useCase={[
        {
          title: "For your organization (B2B)",
          points: [
            "Offer DIY Credit under your own brand and domain",
            "Manage consumers, invitations, plans, and conversions",
            "Track DIY → managed credit and DIY → funding transitions",
            "One Client 360 across DIY, CreditOps, and FundingOps",
            "Hide the module entirely when not entitled",
            "Configurable white-label: logo, colors, support, copy",
          ],
        },
        {
          title: "For your consumers (B2C)",
          points: [
            "Guided, step-based DIY journey — consumer-controlled",
            "3-bureau report import (SmartCredit, IDIQ, MyFreeScoreNow, PDF)",
            "Plain-language credit review — never 'violation detected'",
            "Truth Gate: consumer confirms facts before any dispute",
            "Evidence organization & dispute preparation with attestation",
            "Progress tracking with historical report snapshots",
            "Credit Academy education built in",
            "Request professional help or funding readiness when ready",
          ],
        },
      ]}
      upsell={[
        {
          title: "Need done-for-you credit work?",
          desc: "DIY consumers who want professional help can request Done-For-You service — routed back to the referring CreditOps partner if eligible.",
          to: "/creditops",
          cta: "Explore CreditOps",
        },
        {
          title: "Looking for business funding?",
          desc: "DIY consumers who want business funding can request a funding readiness review — routed to the referring FundingOps partner if eligible.",
          to: "/fundingops",
          cta: "Explore FundingOps",
        },
        {
          title: "Run both credit & funding?",
          desc: "The Full Suite connects CreditOps and FundingOps around one Client 360, shared documents, team, and activity.",
          to: "/full-suite",
          cta: "Explore the Full Suite",
        },
      ]}
    />
  );
}

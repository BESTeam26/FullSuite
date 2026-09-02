import { ProductPage } from "@/components/marketing/ProductPage";
import { getProduct } from "@/lib/bes-products";

const product = getProduct("fundingops")!;

export default function FundingOpsPage() {
  return (
    <ProductPage
      product={product}
      title="FundingOps — Business Funding Operations Software | BES"
      description="FundingOps is business funding operations software: applications, client/business profiles, document collection, funding readiness, deal packaging, lender intelligence, program matching, submissions, conditions, offers, funded deals, renewals, team assignments, and partner visibility."
      keywords="business funding software, funding operations software, funding broker software, deal packaging, lender intelligence, funding readiness, funding CRM"
      h1="FundingOps"
      subhead="Business funding operations software. Run applications, client/business profiles, document collection, funding readiness, deal packaging, lender intelligence, program matching, submissions, conditions, offers, funded deals, and renewals — with team assignments and partner visibility."
      visualVariant="fundingops"
      useCase={[
        {
          title: "Deal lifecycle",
          points: [
            "Funding applications",
            "Client & business profiles",
            "Document collection",
            "Funding readiness review",
            "Deal packaging",
          ],
        },
        {
          title: "Lender intelligence & outcomes",
          points: [
            "Lender intelligence",
            "Potential program matching",
            "Submissions & conditions",
            "Offers & funded deals",
            "Renewals & partner portal",
          ],
        },
      ]}
      upsell={[
        {
          title: "Credit readiness barrier?",
          desc: "When a readiness review identifies a credit factor, offer DIY Credit or professional CreditOps — then return for funding reassessment.",
          to: "/creditops",
          cta: "Explore CreditOps",
        },
        {
          title: "Offer self-service credit",
          desc: "Let applicants work on their own credit with DIY Credit while you keep the funding relationship.",
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

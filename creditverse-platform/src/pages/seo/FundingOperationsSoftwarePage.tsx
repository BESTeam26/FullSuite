import { SeoProductPage } from "./SeoProductPage";

export default function FundingOperationsSoftwarePage() {
  return (
    <SeoProductPage
      slug="funding-operations-software"
      title="Funding Operations Software — Business Funding Workflow | BES"
      description="BES FundingOps is business funding operations software: applications, client/business profiles, document collection, funding readiness, deal packaging, lender intelligence, program matching, submissions, conditions, offers, funded deals, and renewals."
      h1="Business Funding Operations Software"
      intro="Run business funding operations in one system — applications, client and business profiles, document collection, funding readiness, deal packaging, lender intelligence, program matching, submissions, conditions, offers, funded deals, and renewals, with team assignments and partner visibility."
      primaryCta={{ label: "Explore FundingOps", to: "/fundingops" }}
      secondaryCta={{ label: "View pricing", to: "/#pricing" }}
      keywords="funding operations software, business funding software, funding broker software, deal packaging, lender intelligence, funding readiness, funding CRM"
      modules={[
        {
          title: "Funding applications",
          desc: "Capture and manage funding applications in one place.",
        },
        {
          title: "Business profiles",
          desc: "Client and business profiles with full document collection.",
        },
        {
          title: "Funding readiness",
          desc: "Review readiness and identify credit or other barriers.",
        },
        {
          title: "Deal packaging",
          desc: "Package deals for submission with the right documentation.",
        },
        {
          title: "Lender intelligence",
          desc: "Track lenders and programs with potential matching.",
        },
        {
          title: "Submissions & conditions",
          desc: "Manage submissions, conditions, and offers through to funded deals.",
        },
        {
          title: "Renewals",
          desc: "Track renewals and ongoing funding relationships.",
        },
        {
          title: "Partner portal",
          desc: "Partner visibility and a client portal for transparency.",
        },
      ]}
      journey="Start with FundingOps. When a readiness review identifies a credit barrier, offer DIY Credit or professional CreditOps — then return for funding reassessment. Credit improvement does not guarantee funding approval."
      howTo={{
        name: "How to run a funding deal in BES",
        steps: [
          "Capture the funding application and build the client and business profile.",
          "Collect required documents and run a funding readiness review.",
          "Identify any credit or readiness barriers and route to the appropriate path if needed.",
          "Package the deal and match against lender programs and intelligence.",
          "Submit, track conditions, and manage offers through to a funded deal.",
          "Track renewals and ongoing funding relationships on the same Client 360.",
        ],
      }}
      faqs={[
        {
          q: "Does BES FundingOps require credit repair software?",
          a: "No. FundingOps is a complete business funding operations product on its own. CreditOps is not required. If a readiness review identifies a credit barrier, you can offer DIY Credit or CreditOps — then return for funding reassessment.",
        },
        {
          q: "Does credit improvement guarantee funding approval?",
          a: "No. Credit improvement does not guarantee funding. Readiness barriers may also include revenue, time in business, banking, documents, debt, entity, ownership, or industry fit.",
        },
        {
          q: "Can a funding broker use BES without a credit repair business?",
          a: "Yes. A funding-only company can run entirely on FundingOps. BES stays CRM-agnostic and connects to your existing front-office tools.",
        },
      ]}
    />
  );
}

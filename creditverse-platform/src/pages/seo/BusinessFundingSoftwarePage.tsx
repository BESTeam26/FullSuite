import { SeoProductPage } from "./SeoProductPage";

export default function BusinessFundingSoftwarePage() {
  return (
    <SeoProductPage
      slug="business-funding-software"
      title="Business Funding Software — Broker & Consultant Operations | BES"
      description="BES FundingOps is business funding software for funding brokers and business finance consultants: applications, readiness, deal packaging, lender intelligence, submissions, conditions, offers, funded deals, and renewals."
      h1="Business Funding Software for Brokers & Consultants"
      intro="Run your funding brokerage or consulting firm in one system — applications, readiness reviews, deal packaging, lender intelligence, submissions, conditions, offers, funded deals, and renewals, with team assignments and partner visibility."
      primaryCta={{ label: "Explore FundingOps", to: "/fundingops" }}
      secondaryCta={{ label: "View pricing", to: "/#pricing" }}
      keywords="business funding software, funding broker software, business finance consultant software, deal packaging software, lender intelligence, funding CRM"
      modules={[
        {
          title: "Applications",
          desc: "Capture and manage funding applications end to end.",
        },
        {
          title: "Readiness review",
          desc: "Assess funding readiness and identify barriers.",
        },
        {
          title: "Deal packaging",
          desc: "Package deals with the right documentation.",
        },
        {
          title: "Lender intelligence",
          desc: "Track lenders, programs, and potential matches.",
        },
        {
          title: "Submissions",
          desc: "Submit, track conditions, and manage offers.",
        },
        { title: "Funded deals", desc: "Track funded deals and renewals." },
        {
          title: "Team assignments",
          desc: "Assign deals and track team performance.",
        },
        {
          title: "Partner visibility",
          desc: "Partner portal and client transparency.",
        },
      ]}
      journey="Run your funding business on FundingOps. When a readiness review identifies a credit barrier, offer DIY Credit or professional CreditOps — then return for funding reassessment."
      faqs={[
        {
          q: "Is BES business funding software for brokers?",
          a: "Yes. FundingOps is built for funding brokers and business finance consultants — applications, readiness, deal packaging, lender intelligence, submissions, conditions, offers, funded deals, and renewals.",
        },
        {
          q: "Does BES replace my CRM?",
          a: "No. BES is the operations and fulfillment layer. It stays CRM-agnostic and connects to your existing front-office CRM, SMS, email, and automation tools.",
        },
        {
          q: "Can I add credit repair services later?",
          a: "Yes. If a funding applicant has a credit-readiness barrier, you can add CreditOps or DIY Credit and connect the same client into one Client 360 without a duplicate record.",
        },
      ]}
    />
  );
}

import { SeoProductPage } from "./SeoProductPage";

export default function CreditRepairBusinessSoftwarePage() {
  return (
    <SeoProductPage
      slug="credit-repair-business-software"
      title="Credit Repair Business Software — Run Your Credit Repair Company | BES"
      description="BES CreditOps is credit repair business software for companies running credit repair at scale: client CRM, dispute operations, team management, QA, compliance controls, billing, reporting, and a white-label client portal."
      h1="Credit Repair Business Software"
      intro="Run your entire credit repair company in one operating system — client CRM, dispute operations, team management, QA, compliance controls, billing eligibility, reporting, and a white-label client portal for your consumers."
      primaryCta={{ label: "Explore CreditOps", to: "/creditops" }}
      secondaryCta={{ label: "Explore the Full Suite", to: "/full-suite" }}
      keywords="credit repair business software, credit repair company software, credit repair CRM, credit repair operations, credit repair team management, credit repair compliance, white label credit repair"
      modules={[
        {
          title: "Client CRM",
          desc: "Manage leads, prospects, and clients across the full lifecycle.",
        },
        {
          title: "Dispute operations",
          desc: "Evidence-grounded, issue-driven dispute workflows with rounds.",
        },
        {
          title: "Team management",
          desc: "Seats, roles, assignments, and maker-checker QA.",
        },
        {
          title: "Compliance controls",
          desc: "CROA controls, state registration tracking, and billing eligibility.",
        },
        {
          title: "Billing",
          desc: "Compliance-aware billing that blocks advance fees.",
        },
        {
          title: "Reporting",
          desc: "Operational visibility across the whole company.",
        },
        {
          title: "White-label portal",
          desc: "Your brand, your domain, your client experience.",
        },
        {
          title: "Outsourcing",
          desc: "Managed operations for your fulfillment team.",
        },
      ]}
      journey="Run your credit repair business on CreditOps. Add FundingOps later to serve clients who become funding-ready — all on one connected platform."
      faqs={[
        {
          q: "Can I run my whole credit repair company on BES?",
          a: "Yes. CreditOps includes client CRM, dispute operations, team management, QA, compliance controls, billing eligibility, reporting, and a white-label client portal — everything to run a credit repair company.",
        },
        {
          q: "Does BES handle CROA compliance?",
          a: "BES embeds CROA controls, state registration tracking, and a compliance-aware billing engine that blocks advance fees for covered services.",
        },
        {
          q: "Can I outsource fulfillment through BES?",
          a: "Yes. Software-only customers can hand work to a managed fulfillment team, with maker-checker QA, SLAs, and audit trails.",
        },
      ]}
    />
  );
}

import { SeoProductPage } from "./SeoProductPage";

export default function CreditRepairSoftwarePage() {
  return (
    <SeoProductPage
      slug="credit-repair-software"
      title="Credit Repair Software — Dispute Operations & Client Management | BES"
      description="BES CreditOps is credit repair software for credit repair companies: 3-bureau report importing, dispute operations, evidence, rounds, letters, complaints, mailing, reimports, progress tracking, team assignments, QA, and a client portal."
      h1="Credit Repair Software for Professional Operators"
      intro="Run credit repair fulfillment and operations in one system — client management, 3-bureau report importing, dispute operations, evidence, rounds, letters, complaints, mailing, reimports, and progress tracking, with team assignments, QA, and a client portal."
      primaryCta={{ label: "Explore CreditOps", to: "/creditops" }}
      secondaryCta={{ label: "View pricing", to: "/#pricing" }}
      keywords="credit repair software, credit dispute software, credit repair CRM, 3 bureau report import, dispute letters, credit repair operations, white label credit repair software"
      modules={[
        {
          title: "Client management",
          desc: "Leads, prospects, clients, and a white-label client portal.",
        },
        {
          title: "3-bureau importing",
          desc: "Import and normalize reports across Equifax, Experian, and TransUnion.",
        },
        {
          title: "Dispute operations",
          desc: "Issue-driven, evidence-grounded dispute workflows — not template letters.",
        },
        {
          title: "Rounds & escalation",
          desc: "Round management with a 7-layer compliance escalation framework.",
        },
        {
          title: "Letters & mailing",
          desc: "Generate, print, and mail dispute letters with USPS tracking.",
        },
        {
          title: "Reimports & progress",
          desc: "Compare reports side-by-side and generate progress reports.",
        },
        {
          title: "Team & QA",
          desc: "Assignments, maker-checker QA, and SLAs for your team.",
        },
        {
          title: "AI-assisted workflows",
          desc: "AI assists with analysis and drafting — people make the judgment.",
        },
      ]}
      journey="Start with CreditOps. When a client becomes funding-ready, add FundingOps and connect them into one Client 360 — without rebuilding your operation."
      howTo={{
        name: "How to run a credit repair round in BES",
        steps: [
          "Import the client's 3-bureau credit report and let the engine normalize and classify tradelines.",
          "Review the Accuracy Inspector for cross-bureau discrepancies and potential factual issues.",
          "Confirm the consumer's facts and attach supporting evidence to each disputed item.",
          "Select the dispute strategy and generate evidence-grounded letters per category.",
          "Print, mail, or upload letters and automatically set the next round due date.",
          "Re-import the updated report to compare results and generate a progress report.",
        ],
      }}
      faqs={[
        {
          q: "Is BES credit repair software or a dispute letter generator?",
          a: "BES is a full credit repair operations platform. It includes client management, 3-bureau report importing, evidence-grounded dispute workflows, rounds, letters, mailing, reimports, progress tracking, team assignments, QA, and a client portal — not just letter generation.",
        },
        {
          q: "Does BES support 3-bureau credit report imports?",
          a: "Yes. BES imports and normalizes reports across Equifax, Experian, and TransUnion, with support for SmartCredit, IdentityIQ, MyScoreIQ, MyFreeScoreNow, and manual PDF import.",
        },
        {
          q: "Can I white-label the client portal?",
          a: "Yes. CreditOps includes a white-label client portal with your brand, domain, and client experience.",
        },
        {
          q: "Does BES use AI to generate disputes?",
          a: "AI assists with analysis, extraction, and drafting. People make the judgment. BES never invents facts, declares legal violations, or guarantees deletions.",
        },
      ]}
    />
  );
}

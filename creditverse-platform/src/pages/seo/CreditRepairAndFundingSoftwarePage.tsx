import { SeoProductPage } from "./SeoProductPage";

export default function CreditRepairAndFundingSoftwarePage() {
  return (
    <SeoProductPage
      slug="credit-repair-and-funding-software"
      title="Credit Repair & Funding Software — One Connected Platform | BES"
      description="BES is one connected platform for credit repair and business funding. CreditOps and FundingOps share one Client 360, documents, team, tasks, and activity — with credit-to-funding and funding-to-credit transitions."
      h1="Credit Repair & Funding Software in One Platform"
      intro="Run credit repair and business funding from one connected operating system. CreditOps and FundingOps share one Client 360, documents, team, tasks, and activity — so a credit client can become a funding client without a disconnected record."
      primaryCta={{ label: "Explore the Full Suite", to: "/full-suite" }}
      secondaryCta={{ label: "View pricing", to: "/#pricing" }}
      keywords="credit repair and funding software, credit and funding platform, credit repair funding operations, connected credit and funding software, BES full suite"
      modules={[
        {
          title: "CreditOps",
          desc: "Complete credit repair fulfillment & operations.",
        },
        { title: "FundingOps", desc: "Complete business funding operations." },
        {
          title: "Shared Client 360",
          desc: "One client record across both workflows.",
        },
        {
          title: "Shared documents",
          desc: "Documents available across credit and funding.",
        },
        {
          title: "Shared team & tasks",
          desc: "One team, one task list, one activity timeline.",
        },
        {
          title: "Credit-to-funding",
          desc: "Transition a credit client into a funding workflow.",
        },
        {
          title: "Funding-to-credit",
          desc: "Route a funding applicant into credit work when needed.",
        },
        {
          title: "Operational intelligence",
          desc: "Advanced reporting across both lines of business.",
        },
      ]}
      journey="Start with CreditOps or FundingOps. Connect the other when ready. Run both as one connected operation with the Full Suite."
      faqs={[
        {
          q: "Can I run credit repair and funding in one platform?",
          a: "Yes. BES CreditOps and FundingOps share one Client 360, documents, team, tasks, and activity. A credit client can become a funding client without a disconnected record.",
        },
        {
          q: "Do I have to buy both on day one?",
          a: "No. Start with CreditOps or FundingOps. Connect the other when ready. The Full Suite activates the connected operating environment when your business is ready.",
        },
        {
          q: "Does credit improvement guarantee funding?",
          a: "No. Credit improvement does not guarantee funding. Funding readiness depends on many factors including revenue, time in business, banking, documents, debt, entity, and industry fit.",
        },
      ]}
    />
  );
}

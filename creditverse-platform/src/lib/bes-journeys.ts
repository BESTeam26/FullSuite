export interface JourneyStep {
  label: string;
  note?: string;
}

export interface Journey {
  id: string;
  title: string;
  summary: string;
  steps: JourneyStep[];
  branch?: {
    label: string;
    paths: { name: string; steps: JourneyStep[] }[];
  };
  responsible: string;
}

export const JOURNEYS: Journey[] = [
  {
    id: "a",
    title: "Consumer starts DIY",
    summary:
      "A customer can start with a lower-cost self-service solution. If they need professional assistance, the company moves them into managed CreditOps — and later into a funding workflow. Their history never starts over.",
    steps: [
      { label: "DIY Credit" },
      { label: "Needs Professional Help" },
      { label: "CreditOps / Done For You" },
      { label: "Becomes Funding Ready" },
      { label: "FundingOps" },
      { label: "Funding Opportunity" },
    ],
    responsible: "Consumer → Company",
  },
  {
    id: "b",
    title: "Funding company",
    summary:
      "A funding application triggers a readiness review. If a credit or readiness barrier is identified, the client can enter an appropriate credit-improvement path and later return for funding reassessment.",
    steps: [
      { label: "Funding Application" },
      { label: "Funding Readiness Review" },
      { label: "Credit / Readiness Barrier Identified" },
      { label: "Choose Path" },
    ],
    branch: {
      label: "Choose Path",
      paths: [
        { name: "Path 1 — Self-service", steps: [{ label: "DIY Credit" }] },
        {
          name: "Path 2 — Professional",
          steps: [{ label: "Professional Credit Service / CreditOps" }],
        },
      ],
    },
    responsible: "Funding Company",
  },
  {
    id: "c",
    title: "Credit repair company",
    summary:
      "A credit company can add funding operations later without replacing CreditOps or creating another disconnected client database.",
    steps: [
      { label: "Credit Client" },
      { label: "CreditOps" },
      { label: "Progress" },
      { label: "Funding Interest Identified" },
      { label: "FundingOps" },
      { label: "Funding Application" },
      { label: "Readiness" },
      { label: "Potential Program Matches" },
      { label: "Submission" },
    ],
    responsible: "Credit Repair Company",
  },
  {
    id: "d",
    title: "Funding-only company",
    summary:
      "FundingOps works independently. The company does not need CreditOps. If they already have another credit-repair solution, FundingOps remains fully functional.",
    steps: [{ label: "FundingOps (independent)" }],
    responsible: "Funding-Only Company",
  },
  {
    id: "e",
    title: "Credit-only company",
    summary:
      "CreditOps works independently. The company does not need FundingOps.",
    steps: [{ label: "CreditOps (independent)" }],
    responsible: "Credit-Only Company",
  },
];

export const RESPONSIBLE_NOTE =
  "Credit improvement does not guarantee funding approval. The funding-readiness review may identify credit or other readiness factors requiring attention.";

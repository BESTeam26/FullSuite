import {
  User,
  ShieldCheck,
  Banknote,
  Layers,
  Workflow,
  type LucideIcon,
} from "lucide-react";

export type ProductId =
  "diy-credit" | "creditops" | "fundingops" | "full-suite" | "crm";

export interface BesProduct {
  id: ProductId;
  slug: string;
  name: string;
  tagline: string;
  position: string;
  audience: string;
  cta: string;
  icon: LucideIcon;
  accent: string; // tailwind gradient classes
  glyph: string; // short label for diagrams
  blurb: string;
  capabilities: string[];
  standalone: boolean;
}

export const BES_PRODUCTS: BesProduct[] = [
  {
    id: "diy-credit",
    slug: "diy-credit",
    name: "BES DIY Credit",
    tagline: "White-label consumer credit platform",
    position: "White-Label B2C Credit Platform",
    audience:
      "Offered by CreditOps partners to their own consumers; resell & earn",
    cta: "Explore BES DIY Credit",
    icon: User,
    accent: "from-amber-500 to-amber-400",
    glyph: "DIY",
    blurb:
      "A white-label consumer credit platform your partners can offer under their own brand and resell to their clients. Consumers get guided credit review, issue identification, evidence organization, dispute preparation with attestation, progress tracking, and credit education — all under the partner's brand. Referrals attribute back to the partner and never create duplicate identities.",
    capabilities: [
      "White-label branded consumer portal",
      "3-bureau credit report import & normalization",
      "Credit insights & issue identification",
      "Evidence organization",
      "Guided action plans",
      "Dispute preparation with consumer attestation",
      "Round tracking & progress reports",
      "Credit education (Credit Academy)",
      "Partner referral links & commission tracking",
      "Lead-gen bridge into professional credit & funding",
    ],
    standalone: true,
  },
  {
    id: "creditops",
    slug: "creditops",
    name: "BES CreditOps",
    tagline: "Credit repair fulfillment & operations",
    position: "Credit Repair Fulfillment & Operations",
    audience: "Credit repair companies & professional credit operators",
    cta: "Explore BES CreditOps",
    icon: ShieldCheck,
    accent: "from-emerald-700 to-emerald-600",
    glyph: "CO",
    blurb:
      "Complete credit-repair operations: client management, report importing, analysis, dispute operations, evidence, rounds, letters, complaints, mailing, reimports, and progress tracking — with team assignments, QA, and a client portal.",
    capabilities: [
      "Client management",
      "Credit report importing",
      "Credit analysis",
      "Dispute operations",
      "Evidence vault",
      "Round management",
      "Letters & complaints",
      "Mailing & reimports",
      "Progress tracking",
      "Team assignments & QA",
      "Client portal",
      "Operational visibility & reporting",
      "AI-assisted workflows",
    ],
    standalone: true,
  },
  {
    id: "fundingops",
    slug: "fundingops",
    name: "BES FundingOps",
    tagline: "Business funding operations",
    position: "Business Funding Operations",
    audience:
      "Funding brokers, funding companies & business finance consultants",
    cta: "Explore BES FundingOps",
    icon: Banknote,
    accent: "from-amber-600 to-yellow-500",
    glyph: "FO",
    blurb:
      "Business funding operations: applications, client/business profiles, document collection, funding readiness, deal packaging, lender intelligence, submissions, conditions, offers, funded deals, and renewals — with team assignments and partner visibility.",
    capabilities: [
      "Funding applications",
      "Client & business profiles",
      "Document collection",
      "Funding readiness review",
      "Deal packaging",
      "Lender intelligence",
      "Potential program matching",
      "Submissions & conditions",
      "Offers & funded deals",
      "Renewals",
      "Team assignments",
      "Partner visibility & client portal",
      "Reporting",
    ],
    standalone: true,
  },
  {
    id: "crm",
    slug: "crm",
    name: "BES CRM",
    tagline: "Front-office CRM & automation layer",
    position: "CRM + Automation (optional, connect-or-replace)",
    audience: "Teams that need lead capture, funnels & sales automation",
    cta: "Explore BES CRM",
    icon: Workflow,
    accent: "from-slate-600 to-slate-500",
    glyph: "CRM",
    blurb:
      "Need a front-office CRM too? BES can provide or connect the CRM layer for lead capture, funnels, forms, calendars, sales pipeline, SMS, email, and automation. The operational platform stays CRM-agnostic — CreditOps and FundingOps never require it.",
    capabilities: [
      "Lead capture",
      "Funnels & forms",
      "Calendars & appointments",
      "Sales pipeline",
      "SMS & email",
      "Automation",
      "Connect your existing CRM",
    ],
    standalone: false,
  },
  {
    id: "full-suite",
    slug: "full-suite",
    name: "BES Full Suite",
    tagline: "Credit + Funding. One connected operation.",
    position: "The connected plan — not a separate system",
    audience: "Teams that offer both credit and funding",
    cta: "Explore the Full Suite",
    icon: Layers,
    accent: "from-emerald-700 to-amber-500",
    glyph: "FS",
    blurb:
      "Full Suite is a plan, not a fifth application. A Full Suite customer gets the BES platform with CreditOps, FundingOps, DIY Credit, and CRM modules activated — one workspace, one client, one team, one activity stream. Adding Full Suite extends the workspace rather than creating another disconnected account.",
    capabilities: [
      "BES CreditOps (full)",
      "BES FundingOps (full)",
      "BES DIY Credit (full)",
      "BES CRM (full)",
      "Shared Client 360",
      "Shared documents & tasks",
      "Shared team & activity",
      "Operational intelligence",
      "Advanced reporting",
      "Credit-to-funding transitions",
      "Funding-to-credit transitions",
      "Unified client & partner experience",
    ],
    standalone: false,
  },
];

export const BES_CORE_PRODUCTS = BES_PRODUCTS.filter(
  (p) => p.id !== "full-suite",
);
export const BES_FULL_SUITE = BES_PRODUCTS.find((p) => p.id === "full-suite")!;

export const getProduct = (slug: string) =>
  BES_PRODUCTS.find((p) => p.slug === slug);

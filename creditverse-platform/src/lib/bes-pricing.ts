export type BillingCycle = "monthly" | "annual" | "custom";

export interface PricingTier {
  id: string;
  name: string;
  price: string;
  period: string;
  blurb: string;
  seats: string;
  capacity: string;
  features: string[];
  cta: string;
  to: string;
  highlight: boolean;
  badge?: string;
}

export interface ProductPricing {
  productId: string;
  intro: string;
  tiers: PricingTier[];
  note?: string;
}

/**
 * Market-calibrated pricing.
 *
 * Benchmarks (as of Aug 2026):
 *  - Credit Repair Cloud: $49–$599/mo
 *  - DisputeFox: $129–$499/mo (1–10 users, 100–2,000 clients)
 *  - CDM: starts ~$107/mo
 *  - Dispute Beast (consumer): $49.99/mo
 *  - Creditfixrr partner: $500–$1,000 setup + $49.99/mo
 *
 * BES positions premium-but-accessible: above DisputeFox entry,
 * competitive with CRC Growth/Scale, below enterprise consulting.
 * DIY Credit is org-level SaaS (BES sells to org, org offers to consumers).
 */
export const PRODUCT_PRICING: Record<string, ProductPricing> = {
  "diy-credit": {
    productId: "diy-credit",
    intro:
      "White-label consumer credit platform. BES sells the software to your organization — you offer it to your consumers under your own brand. Pricing is per-organization plus a per-active-consumer usage fee.",
    tiers: [
      {
        id: "diy-starter",
        name: "Starter",
        price: "$49",
        period: "/mo base",
        blurb: "For organizations piloting DIY with their first consumers.",
        seats: "2 admin seats",
        capacity: "Up to 50 active consumers",
        features: [
          "White-label branded consumer portal",
          "3-bureau report import & normalization",
          "Guided credit review & issue identification",
          "Truth Gate attestation workflow",
          "Progress tracking with report snapshots",
          "Credit Academy education",
          "$9 per active consumer / month",
        ],
        cta: "Start DIY Credit",
        to: "/diy-credit",
        highlight: false,
      },
      {
        id: "diy-growth",
        name: "Growth",
        price: "$149",
        period: "/mo base",
        blurb: "For growing organizations with active consumer pipelines.",
        seats: "5 admin seats",
        capacity: "Up to 500 active consumers",
        features: [
          "Everything in Starter",
          "Custom domain & branding",
          "DIY → CreditOps conversion workflow",
          "DIY → FundingOps readiness routing",
          "Partner referral tracking & commission",
          "$7 per active consumer / month",
        ],
        cta: "Start DIY Credit",
        to: "/diy-credit",
        highlight: true,
        badge: "Most popular",
      },
    ],
    note: "DIY Credit is a B2B2C white-label product. BES licenses the software to your organization — you own the consumer relationship.",
  },

  creditops: {
    productId: "creditops",
    intro:
      "Credit repair fulfillment & operations software. Priced per organization with seat-based and capacity-based tiers. Add mailing, e-sign, and credit-monitoring usage as needed.",
    tiers: [
      {
        id: "co-launch",
        name: "Launch",
        price: "$149",
        period: "/mo",
        blurb: "For solo operators and new credit-repair businesses.",
        seats: "2 seats",
        capacity: "Up to 100 active clients",
        features: [
          "Client management & portal",
          "3-bureau report import & normalization",
          "Dispute operations & round tracking",
          "Letters, complaints & mailing",
          "Reimports & progress tracking",
          "AI-assisted workflows (Lina)",
          "Basic compliance controls",
        ],
        cta: "Start CreditOps",
        to: "/creditops",
        highlight: false,
      },
      {
        id: "co-growth",
        name: "Growth",
        price: "$349",
        period: "/mo",
        blurb: "For established agencies with team workflows and QA.",
        seats: "8 seats",
        capacity: "Up to 500 active clients",
        features: [
          "Everything in Launch",
          "Team assignments & QA queues",
          "White-label client portal",
          "Factual & Metro 2 dispute builder",
          "Compliance & billing eligibility engine",
          "Bulk batch print & PDF export",
          "CRM automation bridge (webhooks)",
        ],
        cta: "Start CreditOps",
        to: "/creditops",
        highlight: true,
        badge: "Most popular",
      },
      {
        id: "co-scale",
        name: "Scale",
        price: "$699",
        period: "/mo",
        blurb: "For large agencies, multi-team operations, and outsourcing.",
        seats: "20 seats",
        capacity: "Up to 1,500 active clients",
        features: [
          "Everything in Growth",
          "Cross-tenant fulfillment workspace",
          "Sub-account management & invoicing",
          "API access & Zapier integration",
          "Advanced reporting & analytics",
          "Score potential & simulation engine",
          "Priority support",
        ],
        cta: "Start CreditOps",
        to: "/creditops",
        highlight: false,
      },
      {
        id: "co-enterprise",
        name: "Enterprise",
        price: "Custom",
        period: "",
        blurb: "For franchises and large organizations with custom needs.",
        seats: "Unlimited seats",
        capacity: "Unlimited clients",
        features: [
          "Everything in Scale",
          "SSO / SAML",
          "Dedicated infrastructure",
          "Custom retention & data residency",
          "SLA & dedicated success manager",
          "SOC 2 readiness support",
        ],
        cta: "Talk to us",
        to: "/creditops",
        highlight: false,
      },
    ],
    note: "Usage charges for credit-data pulls, physical mail, SMS, e-sign, and premium AI may apply on top of the base subscription.",
  },

  fundingops: {
    productId: "fundingops",
    intro:
      "Business funding operations software. Priced per organization. Track applications, readiness, deal packaging, lender intelligence, submissions, and funded deals.",
    tiers: [
      {
        id: "fo-starter",
        name: "Starter",
        price: "$199",
        period: "/mo",
        blurb: "For funding brokers starting to systematize their pipeline.",
        seats: "3 seats",
        capacity: "Up to 50 active deals",
        features: [
          "Funding applications & profiles",
          "Document collection",
          "Funding readiness review",
          "Deal packaging",
          "Submission tracking",
          "Conditions & offers",
          "Basic reporting",
        ],
        cta: "Start FundingOps",
        to: "/fundingops",
        highlight: false,
      },
      {
        id: "fo-growth",
        name: "Growth",
        price: "$399",
        period: "/mo",
        blurb: "For established brokers with lender intelligence needs.",
        seats: "10 seats",
        capacity: "Up to 200 active deals",
        features: [
          "Everything in Starter",
          "Lender intelligence & program matching",
          "Partner visibility & client portal",
          "Renewals & funded-deal tracking",
          "Team assignments & QA",
          "Advanced reporting",
          "CRM automation bridge (webhooks)",
        ],
        cta: "Start FundingOps",
        to: "/fundingops",
        highlight: true,
        badge: "Most popular",
      },
      {
        id: "fo-scale",
        name: "Scale",
        price: "$799",
        period: "/mo",
        blurb: "For large funding teams and multi-lender operations.",
        seats: "25 seats",
        capacity: "Unlimited active deals",
        features: [
          "Everything in Growth",
          "API access & lender integrations",
          "Cross-team operations",
          "Advanced analytics & forecasting",
          "Priority support",
        ],
        cta: "Start FundingOps",
        to: "/fundingops",
        highlight: false,
      },
      {
        id: "fo-enterprise",
        name: "Enterprise",
        price: "Custom",
        period: "",
        blurb: "For large funding organizations and franchise networks.",
        seats: "Unlimited seats",
        capacity: "Unlimited deals",
        features: [
          "Everything in Scale",
          "SSO / SAML",
          "Custom integrations",
          "Dedicated success manager",
          "SLA",
        ],
        cta: "Talk to us",
        to: "/fundingops",
        highlight: false,
      },
    ],
  },

  "full-suite": {
    productId: "full-suite",
    intro:
      "Credit + Funding. One connected operation. Full Suite is a plan, not a fifth system — you get the BES platform with CreditOps, FundingOps, DIY Credit, and CRM modules activated. One workspace, one client, one team.",
    tiers: [
      {
        id: "fs-growth",
        name: "Growth",
        price: "$599",
        period: "/mo",
        blurb: "For teams running both credit repair and funding.",
        seats: "10 seats",
        capacity: "500 clients + 500 deals",
        features: [
          "BES CreditOps (full)",
          "BES FundingOps (full)",
          "BES DIY Credit (full)",
          "BES CRM (full)",
          "Shared Client 360",
          "Shared documents, team & activity",
          "Credit-to-funding transitions",
          "Funding-to-credit transitions",
          "Operational intelligence & reporting",
        ],
        cta: "Start Full Suite",
        to: "/full-suite",
        highlight: true,
        badge: "Best value",
      },
      {
        id: "fs-scale",
        name: "Scale",
        price: "$1,199",
        period: "/mo",
        blurb: "For larger teams with cross-product operations.",
        seats: "25 seats",
        capacity: "1,500 clients + 1,500 deals",
        features: [
          "Everything in Growth",
          "Unlimited sub-accounts",
          "Cross-tenant fulfillment",
          "API access & webhooks",
          "Advanced cross-product analytics",
          "Priority support",
        ],
        cta: "Start Full Suite",
        to: "/full-suite",
        highlight: false,
      },
      {
        id: "fs-enterprise",
        name: "Enterprise",
        price: "Custom",
        period: "",
        blurb: "For franchises and enterprise organizations.",
        seats: "Unlimited seats",
        capacity: "Unlimited",
        features: [
          "Everything in Scale",
          "SSO / SAML",
          "Dedicated infrastructure",
          "Custom retention & data residency",
          "SLA & dedicated success manager",
          "SOC 2 readiness support",
        ],
        cta: "Talk to us",
        to: "/full-suite",
        highlight: false,
      },
    ],
    note: "Full Suite replaces separate CreditOps + FundingOps + DIY subscriptions with one connected plan at a lower combined price.",
  },

  crm: {
    productId: "crm",
    intro:
      "Optional front-office CRM & automation layer. CreditOps and FundingOps do not require BES CRM — you can keep your existing CRM. This is for teams that want lead capture, funnels, and automation in the same ecosystem.",
    tiers: [
      {
        id: "crm-starter",
        name: "Starter",
        price: "$97",
        period: "/mo",
        blurb: "For teams adding front-office automation.",
        seats: "3 seats",
        capacity: "Up to 1,000 contacts",
        features: [
          "Lead capture & forms",
          "Sales pipeline",
          "Email & SMS",
          "Basic automation",
          "Calendar & appointments",
        ],
        cta: "Add BES CRM",
        to: "/crm",
        highlight: false,
      },
      {
        id: "crm-pro",
        name: "Pro",
        price: "$297",
        period: "/mo",
        blurb: "For teams with full automation needs.",
        seats: "10 seats",
        capacity: "Up to 25,000 contacts",
        features: [
          "Everything in Starter",
          "Advanced automation & workflows",
          "Funnels & landing pages",
          "Connect your existing CRM",
          "Operational event triggers",
          "Reporting & analytics",
        ],
        cta: "Add BES CRM",
        to: "/crm",
        highlight: true,
      },
    ],
    note: "BES CRM is optional. CreditOps and FundingOps are CRM-agnostic and work with your existing front-office tools.",
  },
};

export const getProductPricing = (
  productId: string,
): ProductPricing | undefined => PRODUCT_PRICING[productId];

export const HOMEPAGE_PRICING_TIERS: PricingTier[] = [
  {
    id: "hp-creditops",
    name: "CreditOps",
    price: "$149",
    period: "/mo",
    blurb: "Credit repair fulfillment & operations.",
    seats: "from 2 seats",
    capacity: "from 100 clients",
    features: [
      "3-bureau import & dispute operations",
      "Rounds, letters, complaints & mailing",
      "Reimports & progress tracking",
      "AI-assisted workflows (Lina)",
    ],
    cta: "Explore CreditOps",
    to: "/creditops",
    highlight: true,
    badge: "Most popular",
  },
  {
    id: "hp-fundingops",
    name: "FundingOps",
    price: "$199",
    period: "/mo",
    blurb: "Business funding operations.",
    seats: "from 3 seats",
    capacity: "from 50 deals",
    features: [
      "Applications & funding readiness",
      "Deal packaging & lender intelligence",
      "Submissions, conditions & offers",
      "Partner visibility & client portal",
    ],
    cta: "Explore FundingOps",
    to: "/fundingops",
    highlight: false,
  },
  {
    id: "hp-fullsuite",
    name: "Full Suite",
    price: "$599",
    period: "/mo",
    blurb: "Credit + Funding, connected.",
    seats: "10 seats",
    capacity: "500 clients + 500 deals",
    features: [
      "CreditOps + FundingOps + DIY + CRM",
      "Shared Client 360",
      "Credit-to-funding transitions",
      "Operational intelligence",
    ],
    cta: "Explore Full Suite",
    to: "/full-suite",
    highlight: false,
    badge: "Best value",
  },
  {
    id: "hp-diy",
    name: "DIY Credit",
    price: "$49",
    period: "/mo base",
    blurb: "White-label consumer credit platform.",
    seats: "from 2 seats",
    capacity: "from 50 consumers",
    features: [
      "White-label branded portal",
      "Guided credit review & education",
      "Truth Gate attestation",
      "DIY → CreditOps & funding routing",
    ],
    cta: "Explore DIY Credit",
    to: "/diy-credit",
    highlight: false,
  },
];

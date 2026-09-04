import type {
  Organization,
  Business,
  WorkItem,
  AgencyUser,
} from "@/lib/bes-domain";

/* ------------------------------------------------------------------ */
/* Businesses per organization                                         */
/* ------------------------------------------------------------------ */

const org1Businesses: Business[] = [
  {
    id: "biz-1a",
    name: "Apex Credit Co.",
    legalName: "Apex Credit Co. LLC",
    industry: "Financial Services",
    timeInBusinessMonths: 48,
    monthlyRevenue: 8450,
  },
];

const org2Businesses: Business[] = [
  {
    id: "biz-2a",
    name: "Pioneer Credit Solutions",
    legalName: "Pioneer Credit Solutions LLC",
    industry: "Credit Services",
    timeInBusinessMonths: 30,
    monthlyRevenue: 4900,
  },
];

const org3Businesses: Business[] = [
  {
    id: "biz-3a",
    name: "Vantage Funding Group",
    legalName: "Vantage Funding Group LLC",
    industry: "Business Funding",
    timeInBusinessMonths: 22,
    monthlyRevenue: 3800,
  },
];

const org4Businesses: Business[] = [
  {
    id: "biz-4a",
    name: "CreditFix Solutions",
    legalName: "CreditFix Solutions Inc.",
    industry: "Credit Services",
    timeInBusinessMonths: 60,
    monthlyRevenue: 12600,
  },
];

const org5Businesses: Business[] = [
  {
    id: "biz-5a",
    name: "Empire Capital & Credit",
    legalName: "Empire Capital & Credit LLC",
    industry: "Credit Services",
    timeInBusinessMonths: 6,
    monthlyRevenue: 1900,
  },
];

/* ------------------------------------------------------------------ */
/* Customer Organizations (Organizations)                               */
/* ------------------------------------------------------------------ */

export const seedOrganizations: Organization[] = [
  {
    id: "sub-1",
    name: "Apex Credit Co.",
    code: "APEX",
    publicId: "BES-DEMO01",
    principal: { name: "Alex Rivera", email: "alex@apexcredit.com" },
    address: "100 Wilshire Blvd, Ste 400, Los Angeles, CA",
    isPinned: true,
    status: "Active",
    joinedDate: "Jan 15, 2026",
    isFulfillmentSubscriber: true,
    entitlements: [
      { key: "creditOps", label: "CreditOps", enabled: true },
      { key: "fundingOps", label: "FundingOps", enabled: true },
      { key: "diyCredit", label: "DIY Credit", enabled: true },
      { key: "oi", label: "Operational Intelligence", enabled: true },
      { key: "crm", label: "BES CRM", enabled: true },
    ],
    businesses: org1Businesses,
    orgUsers: [
      {
        id: "u-1a",
        name: "Maria Gonzalez",
        email: "maria@apexcredit.com",
        role: "credit_processor",
        product: "creditOps",
        assignedOnly: true,
      },
      {
        id: "u-1b",
        name: "Tom Alvarez",
        email: "tom@apexcredit.com",
        role: "funding_manager",
        product: "fundingOps",
        assignedOnly: false,
        teamScope: "Funding Department",
      },
    ],
    externalUsers: [
      {
        id: "x-1a",
        name: "Lender Westgate",
        email: "rep@westgate.com",
        role: "lender",
        scopedRecordIds: ["FD-1001"],
      },
    ],
    branding: {
      customDomain: "portal.apexcredit.com",
      companyTagline: "Premier Credit Restoration & Funding",
      primaryColor: "#EBAA15",
      darkTheme: true,
    },
  },
  {
    id: "sub-2",
    name: "Pioneer Credit Solutions",
    code: "PIONEER",
    publicId: "BES-DEMO02",
    principal: { name: "Sarah Jenkins", email: "sarah@pioneercredit.com" },
    address: "30 North Gould Street, Ste N, Sheridan, WY",
    isPinned: true,
    status: "Active",
    joinedDate: "Feb 01, 2026",
    isFulfillmentSubscriber: true,
    entitlements: [
      { key: "creditOps", label: "CreditOps", enabled: true },
      { key: "diyCredit", label: "DIY Credit", enabled: true },
    ],
    businesses: org2Businesses,
    orgUsers: [
      {
        id: "u-2a",
        name: "James Whitaker",
        email: "james@pioneercredit.com",
        role: "credit_processor",
        product: "creditOps",
        assignedOnly: true,
      },
    ],
    externalUsers: [],
  },
  {
    id: "sub-3",
    name: "Vantage Funding Group",
    code: "VANTAGE",
    publicId: "BES-DEMO03",
    principal: { name: "Marcus Vance", email: "marcus@vantagefunding.com" },
    address: "15720 Brixham Hill Ave, Charlotte, NC",
    isPinned: false,
    status: "Active",
    joinedDate: "Feb 10, 2026",
    isFulfillmentSubscriber: false,
    entitlements: [
      { key: "fundingOps", label: "FundingOps", enabled: true },
      { key: "crm", label: "BES CRM", enabled: true },
    ],
    businesses: org3Businesses,
    orgUsers: [
      {
        id: "u-3a",
        name: "Dana Pierce",
        email: "dana@vantagefunding.com",
        role: "funding_manager",
        product: "fundingOps",
        assignedOnly: false,
        teamScope: "Funding Department",
      },
    ],
    externalUsers: [
      {
        id: "x-3a",
        name: "BRM - Karen Lee",
        email: "karen@vantagefunding.com",
        role: "brm",
        scopedRecordIds: ["FD-2001", "FD-2002"],
      },
    ],
  },
  {
    id: "sub-4",
    name: "CreditFix Solutions",
    code: "FIX",
    publicId: "BES-DEMO04",
    principal: { name: "Derrick Hall", email: "derrick@creditfix.com" },
    address: "444 Alaska Ave Ste #BAN433, Torrance, CA",
    isPinned: true,
    status: "Active",
    joinedDate: "Dec 04, 2025",
    isFulfillmentSubscriber: true,
    entitlements: [
      { key: "creditOps", label: "CreditOps", enabled: true },
      { key: "fundingOps", label: "FundingOps", enabled: true },
      { key: "diyCredit", label: "DIY Credit", enabled: true },
      { key: "oi", label: "Operational Intelligence", enabled: true },
      { key: "crm", label: "BES CRM", enabled: true },
    ],
    businesses: org4Businesses,
    orgUsers: [],
    externalUsers: [],
  },
  {
    id: "sub-5",
    name: "Empire Capital & Credit",
    code: "EMPIRE",
    publicId: "BES-DEMO05",
    principal: { name: "Chloe Sterling", email: "chloe@empirecap.com" },
    address: "6081 Hamilton Blvd, Ste 600, Allentown, PA",
    isPinned: false,
    status: "Pending Onboarding",
    joinedDate: "Aug 20, 2026",
    isFulfillmentSubscriber: false,
    entitlements: [
      { key: "creditOps", label: "CreditOps", enabled: true },
      { key: "diyCredit", label: "DIY Credit", enabled: true },
    ],
    businesses: org5Businesses,
    orgUsers: [],
    externalUsers: [],
  },
];

/* ------------------------------------------------------------------ */
/* Shared Operations Engine — Work Items (scoped)                      */
/* ------------------------------------------------------------------ */

export const seedWorkItems: WorkItem[] = [
  // AGENCY-scope work (BES fulfillment desk) — only for fulfillment subscribers
  {
    id: "WO-9041",
    scope: "AGENCY",
    relatedType: "fulfillment",
    relatedId: "CR-2041",
    title: "Round 2 Escalation — Maria Gonzalez",
    stage: "In Processing",
    assignedTo: "Carlos Mendoza (CreditOps Lead)",
    slaHoursRemaining: 4,
    createdAt: "Today, 08:30 AM",
  },
  {
    id: "WO-9043",
    scope: "AGENCY",
    relatedType: "fulfillment",
    relatedId: "CR-2043",
    title: "CFPB Complaint — Anthony Ramos",
    stage: "Ready for QA",
    assignedTo: "Keila Betancourt (QA Specialist)",
    slaHoursRemaining: 2,
    createdAt: "Yesterday, 04:45 PM",
  },
  // ORGANIZATION-scope work (self-managed by the customer org)
  {
    id: "WO-9101",
    scope: "ORGANIZATION",
    organizationId: "sub-1",
    relatedType: "credit_case",
    relatedId: "CR-2101",
    title: "Round 1 Processing — Tanya Brooks",
    stage: "In Processing",
    assignedTo: "Maria Gonzalez",
    slaHoursRemaining: 12,
    createdAt: "Today, 10:00 AM",
  },
  {
    id: "WO-9102",
    scope: "ORGANIZATION",
    organizationId: "sub-3",
    relatedType: "funding_deal",
    relatedId: "FD-2001",
    title: "Document Review — Vantage Deal",
    stage: "Queued",
    assignedTo: "Dana Pierce",
    slaHoursRemaining: 36,
    createdAt: "Today, 09:00 AM",
  },
];

/* ------------------------------------------------------------------ */
/* BES Agency users                                                    */
/* ------------------------------------------------------------------ */

export const seedAgencyUsers: AgencyUser[] = [
  {
    id: "ag-1",
    name: "Platform Admin",
    email: "admin@bes.io",
    role: "agency_owner",
  },
  {
    id: "ag-2",
    name: "Carlos Mendoza",
    email: "carlos@bes.io",
    role: "agency_team_lead",
  },
  {
    id: "ag-3",
    name: "Keila Betancourt",
    email: "keila@bes.io",
    role: "agency_agent",
  },
];

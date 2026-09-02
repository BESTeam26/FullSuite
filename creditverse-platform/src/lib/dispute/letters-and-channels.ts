// Dispute Flow — TRAP Channels, Letter Categories, FTC/CFPB Rules
// All logic is HARDCODED (not AI) to avoid compliance issues.

import type { ClassifiedItem, Category } from "@/lib/credit-classification";

// ─── TRAP Strategy ────────────────────────────────────────────────────────────
// TRAP = CRA + FTC + CFPB — multi-channel pressure from Round 1.

export const TRAP_CHANNELS = {
  CRA: {
    label: "CRA Dispute",
    description:
      "Bureau reinvestigation under FCRA §1681i and §1681e(b). Filed with Equifax, Experian (upload only), and TransUnion.",
    icon: "Building2",
  },
  FTC: {
    label: "FTC Filing",
    description:
      "Identity theft / fraud report filed at identitytheft.gov. Required for third-party collections and eligible inquiries.",
    icon: "ShieldAlert",
  },
  CFPB: {
    label: "CFPB Complaint",
    description:
      "Consumer Financial Protection Bureau complaint filed by category. Separate complaint per negative category.",
    icon: "Scale",
  },
} as const;

// ─── Secondary Bureaus & Freeze Registry ────────────────────────────────────

export interface SecondaryBureau {
  id: string;
  name: string;
  category:
    | "chexsystems"
    | "lexisnexis"
    | "sagestream"
    | "ars"
    | "corelogic"
    | "innovis";
  address: string;
  city: string;
  state: string;
  zip: string;
  phone?: string;
  description: string;
  isFreezeRecommended?: boolean;
}

export const SECONDARY_BUREAUS: SecondaryBureau[] = [
  {
    id: "innovis",
    name: "Innovis Data Solutions",
    category: "innovis",
    address: "P.O. Box 1689",
    city: "Pittsburgh",
    state: "PA",
    zip: "15230-1689",
    phone: "1-800-540-2505",
    description:
      "4th primary credit bureau. Reports tradelines, inquiries, and public records.",
    isFreezeRecommended: true,
  },
  {
    id: "lexisnexis",
    name: "LexisNexis Risk Solutions",
    category: "lexisnexis",
    address: "P.O. Box 105108",
    city: "Atlanta",
    state: "GA",
    zip: "30348-5108",
    phone: "1-888-497-0011",
    description:
      "Public records, legal filings, bankruptcies, liens, and background data.",
    isFreezeRecommended: true,
  },
  {
    id: "sagestream",
    name: "SageStream (LexisNexis)",
    category: "sagestream",
    address: "P.O. Box 50379",
    city: "San Diego",
    state: "CA",
    zip: "92150",
    phone: "1-888-395-0277",
    description:
      "Credit risk score data repository used by credit card issuers.",
    isFreezeRecommended: true,
  },
  {
    id: "ars",
    name: "Advanced Resolution Services (ARS)",
    category: "ars",
    address: "P.O. Box 903",
    city: "Cleveland",
    state: "OH",
    zip: "44107",
    phone: "1-800-392-8911",
    description:
      "Used heavily by credit card companies like Chase, Citi, and Bank of America.",
    isFreezeRecommended: true,
  },
  {
    id: "chexsystems",
    name: "ChexSystems Inc.",
    category: "chexsystems",
    address: "P.O. Box 580190",
    city: "Minneapolis",
    state: "MN",
    zip: "55458",
    phone: "1-800-358-5356",
    description:
      "Banking history, deposit accounts, bounced checks, and closed bank accounts.",
    isFreezeRecommended: true,
  },
  {
    id: "corelogic",
    name: "CoreLogic Teletrack",
    category: "corelogic",
    address: "P.O. Box 509124",
    city: "San Diego",
    state: "CA",
    zip: "92150",
    phone: "1-800-729-3700",
    description:
      "Subprime lending, payday loans, rent-to-own, and auto subprime financing.",
    isFreezeRecommended: true,
  },
];

// ─── Category-Based Letters ──────────────────────────────────────────────────

export interface LetterCategory {
  key: string;
  label: string;
  description: string;
  recipient: "CRA" | "Furnisher" | "Collection Agency" | "FTC" | "CFPB";
  requiresFTC: boolean;
  requiresCFPB: boolean;
  experianSpecial: boolean;
  icon: string;
  tone: string;
}

export const LETTER_CATEGORIES: LetterCategory[] = [
  {
    key: "collection",
    label: "Letter to Collection",
    description:
      "Third-party collection account dispute. Validates collector's authority, account ownership, balance accuracy, and DOFD.",
    recipient: "Collection Agency",
    requiresFTC: true,
    requiresCFPB: true,
    experianSpecial: true,
    icon: "Building2",
    tone: "text-red-600",
  },
  {
    key: "chargeoff",
    label: "Letter for Charge-Off Accounts",
    description:
      "Charge-off account dispute. Verifies balance, DOFD, and whether the account was later settled or sold.",
    recipient: "Furnisher",
    requiresFTC: false,
    requiresCFPB: true,
    experianSpecial: true,
    icon: "AlertTriangle",
    tone: "text-red-600",
  },
  {
    key: "late-payment",
    label: "Letter for Open Late Payment / Removal Only",
    description:
      "Late payment removal dispute. Verifies payment history against bank statements for the disputed month.",
    recipient: "Furnisher",
    requiresFTC: false,
    requiresCFPB: true,
    experianSpecial: true,
    icon: "Clock",
    tone: "text-amber-600",
  },
  {
    key: "inquiry",
    label: "Letter for Inquiry",
    description:
      "Unauthorized/unsolicited inquiry dispute. Never include inquiries linked to open accounts in FTC filings.",
    recipient: "CRA",
    requiresFTC: true,
    requiresCFPB: true,
    experianSpecial: true,
    icon: "FileSearch",
    tone: "text-amber-600",
  },
  {
    key: "pid",
    label: "Letter for Personal Information Dispute (PID)",
    description:
      "Personal information dispute — incorrect addresses, employers, names, or other identity data.",
    recipient: "CRA",
    requiresFTC: false,
    requiresCFPB: true,
    experianSpecial: true,
    icon: "UserRound",
    tone: "text-blue-600",
  },
  {
    key: "student-loan",
    label: "Letter for Student Loans",
    description:
      "Student loan dispute. Verifies servicer, rehabilitation status, and DOFD. Federal loans have specific options.",
    recipient: "Furnisher",
    requiresFTC: false,
    requiresCFPB: true,
    experianSpecial: true,
    icon: "GraduationCap",
    tone: "text-amber-600",
  },
  {
    key: "public-record",
    label: "Letter for Public Records",
    description:
      "Public record dispute (bankruptcy, lien, judgment). Verifies accuracy, disposition, and reporting window.",
    recipient: "CRA",
    requiresFTC: false,
    requiresCFPB: true,
    experianSpecial: true,
    icon: "Scale",
    tone: "text-red-600",
  },
];

// ─── FTC Filing Rules ─────────────────────────────────────────────────────────

export interface FTCRule {
  appliesTo: Category;
  url: string;
  requiresCode: boolean;
  notes: string;
}

export const FTC_RULES: FTCRule[] = [
  {
    appliesTo: "3rd-Party Collection",
    url: "https://www.identitytheft.gov/#",
    requiresCode: true,
    notes:
      "If a verification code is required and no phone number is available, attempt SMS to the client and request the code. Document the outreach and outcome.",
  },
  {
    appliesTo: "Inquiry",
    url: "https://reportfraud.ftc.gov/assistant",
    requiresCode: false,
    notes:
      "Use the Blue FTC form. No code needed. NEVER include an inquiry linked to an open account — this may place the open account at risk of closure due to fraud claim exposure.",
  },
];

export function getFTCRule(category: Category): FTCRule | null {
  return FTC_RULES.find((r) => r.appliesTo === category) ?? null;
}

export function requiresFTC(item: ClassifiedItem): boolean {
  return (
    item.category === "3rd-Party Collection" ||
    (item.category === "Inquiry" && !item.linkedOpenAccount)
  );
}

export function isFTCBlocked(item: ClassifiedItem): boolean {
  return item.category === "Inquiry" && !!item.linkedOpenAccount;
}

// ─── CFPB Complaint Rules ────────────────────────────────────────────────────

export const CFPB_CATEGORIES = [
  "Collection accounts",
  "Charge-off accounts",
  "Open late payment / late payment removal only",
  "Inquiries",
  "Personal information disputes",
] as const;

export function getCFPBCategory(item: ClassifiedItem): string | null {
  switch (item.category) {
    case "3rd-Party Collection":
      return "Collection accounts";
    case "Charge-Off":
      return "Charge-off accounts";
    case "Late Payment":
      return "Open late payment / late payment removal only";
    case "Inquiry":
      return "Inquiries";
    case "Public Record":
      return "Personal information disputes";
    case "Student Loan":
      return "Collection accounts";
    default:
      return null;
  }
}

export function requiresCFPB(item: ClassifiedItem): boolean {
  return getCFPBCategory(item) !== null;
}

// ─── Experian Handling Rule ──────────────────────────────────────────────────

export function getExperianHandling() {
  return {
    rule: "Experian = upload only",
    detail:
      "Do not mail Experian dispute letters. Upload to the Experian Upload Center. Mailing applies to other bureaus and applicable letters through approved mailing workflow.",
  };
}

// ─── Mailing & Submission Order ──────────────────────────────────────────────

export const MAILING_ORDER = [
  "Generate dispute letter",
  "Generate FTC report where applicable",
  "Attach FTC to the letter before mailing where required",
  "Mail via LetterStream (all Round 1 letters for paper trail)",
  "Upload Experian via portal (do NOT mail)",
  "File CFPB complaints by category",
];

// ─── Item → Letter Category Mapping ──────────────────────────────────────────

export function getItemLetterCategory(
  item: ClassifiedItem,
): LetterCategory | null {
  const map: Partial<Record<Category, string>> = {
    "3rd-Party Collection": "collection",
    "Charge-Off": "chargeoff",
    "Late Payment": "late-payment",
    Inquiry: "inquiry",
    "Public Record": "public-record",
    "Student Loan": "student-loan",
  };
  const key = map[item.category];
  if (!key) return null;
  return LETTER_CATEGORIES.find((c) => c.key === key) ?? null;
}

// Dispute Flow — channels, letter categories, and the resources behind them.
// All logic is HARDCODED (not AI) to avoid compliance issues.

import type { Category, ClassifiedItem } from "@/lib/credit-classification";
import { identityTheftRouteAvailable, type AccountRecognition } from "./account-recognition";

// ─── Channels ─────────────────────────────────────────────────────────────────
//
// CORRECTED 2026-09-07 (CR-4a). The FTC channel used to read "Required for
// third-party collections". An account type is not evidence of identity theft;
// the FTC warns specifically against false identity-theft reports used as a
// credit-repair tactic, and filing one is a false statement to a federal
// agency. Nothing here is required of an operator by BES, and the identity
// theft route is reached only from a recorded consumer statement — see
// `account-recognition.ts`.

export const TRAP_CHANNELS = {
  CRA: {
    label: "CRA Dispute",
    description:
      "Bureau reinvestigation under FCRA §1681i and §1681e(b). Filed with Equifax, Experian and TransUnion.",
    icon: "Building2",
  },
  FTC: {
    label: "FTC report",
    description:
      "A consumer may create an identity theft report at identitytheft.gov. An account type never establishes identity theft — this is available only where the consumer states the account resulted from it.",
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
  /** Whether an identity-theft resource is RELEVANT to this category — never
   *  whether one is required. Gated at the point of use on a recorded consumer
   *  statement (`account-recognition.ts`), never on the category alone. */
  ftcResourceRelevant: boolean;
  requiresCFPB: boolean;
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
    ftcResourceRelevant: true,
    requiresCFPB: true,
    icon: "Building2",
    tone: "text-red-600",
  },
  {
    key: "chargeoff",
    label: "Letter for Charge-Off Accounts",
    description:
      "Charge-off account dispute. Verifies balance, DOFD, and whether the account was later settled or sold.",
    recipient: "Furnisher",
    ftcResourceRelevant: false,
    requiresCFPB: true,
    icon: "AlertTriangle",
    tone: "text-red-600",
  },
  {
    key: "late-payment",
    label: "Letter for Open Late Payment / Removal Only",
    description:
      "Late payment removal dispute. Verifies payment history against bank statements for the disputed month.",
    recipient: "Furnisher",
    ftcResourceRelevant: false,
    requiresCFPB: true,
    icon: "Clock",
    tone: "text-amber-600",
  },
  {
    key: "inquiry",
    label: "Letter for Inquiry",
    description:
      "Unauthorized/unsolicited inquiry dispute. An inquiry linked to an open account is never treated as fraud.",
    recipient: "CRA",
    ftcResourceRelevant: true,
    requiresCFPB: true,
    icon: "FileSearch",
    tone: "text-amber-600",
  },
  {
    key: "pid",
    label: "Letter for Personal Information Dispute (PID)",
    description:
      "Personal information dispute — incorrect addresses, employers, names, or other identity data.",
    recipient: "CRA",
    ftcResourceRelevant: false,
    requiresCFPB: true,
    icon: "UserRound",
    tone: "text-blue-600",
  },
  {
    key: "student-loan",
    label: "Letter for Student Loans",
    description:
      "Student loan dispute. Verifies servicer, rehabilitation status, and DOFD. Federal loans have specific options.",
    recipient: "Furnisher",
    ftcResourceRelevant: false,
    requiresCFPB: true,
    icon: "GraduationCap",
    tone: "text-amber-600",
  },
  {
    key: "public-record",
    label: "Letter for Public Records",
    description:
      "Public record dispute (bankruptcy, lien, judgment). Verifies accuracy, disposition, and reporting window.",
    recipient: "CRA",
    ftcResourceRelevant: false,
    requiresCFPB: true,
    icon: "Scale",
    tone: "text-red-600",
  },
];

// ─── Consumer FTC resources ───────────────────────────────────────────────────
//
// These are resources a CONSUMER may choose to use once they have said their
// account resulted from identity theft or fraud. They are not steps BES asks
// an operator to take, and they are never reached from a category.
//
// `requiresFTC(item)` used to live here and returned true for every
// third-party collection and every unlinked inquiry. It is deleted rather than
// renamed: nothing should be able to call a function that answers this
// question from an account. Ask `identityTheftRouteAvailable(recognition)` in
// `account-recognition.ts` instead, which answers it from what a person
// recorded.

export interface FtcConsumerResource {
  relevantTo: Category;
  url: string;
  /** What the consumer is doing there, in the consumer's terms. */
  purpose: string;
  /** What an operator should know before mentioning it. */
  caution: string;
}

export const FTC_CONSUMER_RESOURCES: FtcConsumerResource[] = [
  {
    relevantTo: "3rd-Party Collection",
    url: "https://www.identitytheft.gov/",
    purpose:
      "Where a consumer creates an FTC identity theft report, if they state the account resulted from identity theft.",
    caution:
      "A collection account is not evidence of identity theft. Offer this only after the consumer has said so, and never as a step required to dispute the account. A false identity theft report is a false statement to a federal agency.",
  },
  {
    relevantTo: "Inquiry",
    url: "https://reportfraud.ftc.gov/assistant",
    purpose: "Where a consumer reports fraud they say they experienced.",
    caution:
      "Not recognising an inquiry is not fraud. An inquiry linked to an account the consumer holds is never reported as fraud — a fraud claim can put that account at risk.",
  },
];

/**
 * The consumer resource for a category, IF an operator has recorded that the
 * consumer reports identity theft.
 *
 * The recognition argument is required and unforgiving on purpose: there is no
 * overload that takes only a category, because that overload is the defect
 * this function replaces.
 */
export function ftcResourceFor(
  category: Category,
  recognition: AccountRecognition | undefined,
): FtcConsumerResource | null {
  if (!identityTheftRouteAvailable(recognition)) return null;
  return FTC_CONSUMER_RESOURCES.find((r) => r.relevantTo === category) ?? null;
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

// ─── Mailing & Submission Order ──────────────────────────────────────────────

export const MAILING_ORDER = [
  "Generate dispute letter",
  "Generate FTC report where applicable",
  "Attach FTC to the letter before mailing where required",
  "Mail via LetterStream (all Round 1 letters for paper trail)",
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

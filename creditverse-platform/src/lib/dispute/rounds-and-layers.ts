// Dispute Flow — Round Escalation & 7-Layer Compliance Method
// Encodes the internal SOP. All logic is HARDCODED (not AI) to avoid compliance
// issues — AI only assists with drafting language, never decides legal conclusions.

// ─── 7-Layer Compliance Method ────────────────────────────────────────────────
// Each round builds documentation for the next layer if the account remains
// uncorrected. Objective: convert a simple dispute into a documented compliance
// failure case.

export interface ComplianceLayer {
  number: number;
  name: string;
  description: string;
  activatedInRound: number | null;
  status: "pending" | "active" | "completed" | "not-needed";
}

export const SEVEN_LAYERS: Omit<
  ComplianceLayer,
  "activatedInRound" | "status"
>[] = [
  {
    number: 1,
    name: "CRA Dispute",
    description:
      "Bureau reinvestigation request. Establishes the compliance record and evidentiary foundation.",
  },
  {
    number: 2,
    name: "Direct Furnisher Dispute",
    description:
      "Direct dispute to the creditor or collection agency under FCRA §1681s-2(b).",
  },
  {
    number: 3,
    name: "Compliance Officer Escalation",
    description:
      "Escalation to the furnisher's compliance officer citing procedural failures.",
  },
  {
    number: 4,
    name: "Chief Risk Officer Escalation",
    description:
      "Escalation to the furnisher's Chief Risk Officer documenting pattern of non-compliance.",
  },
  {
    number: 5,
    name: "General Counsel Legal Exposure Notice",
    description:
      "Formal notice to the furnisher's General Counsel outlining legal exposure under FCRA.",
  },
  {
    number: 6,
    name: "Executive Office Escalation",
    description:
      "Escalation to the furnisher's executive office with full compliance failure documentation.",
  },
  {
    number: 7,
    name: "Regulatory Pressure",
    description:
      "CFPB, State Attorney General, and federal regulator referrals with complete evidence package.",
  },
];

// ─── Round Escalation Framework ───────────────────────────────────────────────

export interface RoundDefinition {
  number: number;
  name: string;
  focus: string;
  requiredActions: string[];
  legalBasis: string[];
  statusAfter: { clickup: string; googleSheet: string };
  layersActivated: number[];
}

export const ROUND_DEFINITIONS: RoundDefinition[] = [
  {
    number: 1,
    name: "Round 1 — TRAP Filing",
    focus: "Immediate multi-channel dispute",
    requiredActions: [
      "CRA dispute under FCRA §1681i and §1681e(b)",
      "FTC filing for third-party collections and unauthorized inquiries",
      "CFPB complaint filing by category (collections, charge-offs, late payments, inquiries, PID)",
      "Attach FTC report to dispute package and CFPB complaint",
      "Mail all Round 1 letters via LetterStream (paper trail)",
      "Upload Experian dispute to Experian Upload Center (do NOT mail)",
    ],
    legalBasis: ["FCRA §1681i", "FCRA §1681e(b)", "FCRA §1681s-2(a)"],
    statusAfter: {
      clickup: "indispute - mailed",
      googleSheet: "Dispute Ongoing",
    },
    layersActivated: [1],
  },
  {
    number: 2,
    name: "Round 2 — Method of Verification Escalation",
    focus: "Force the bureau to produce verification records",
    requiredActions: [
      "CRA Method of Verification request",
      "CFPB escalation or update citing bureau failures",
      "Request: method of verification, date of verification, furnisher verification method, data furnisher used",
      "Begin building failure of reasonable procedures under FCRA §1681e(b)",
    ],
    legalBasis: ["FCRA §1681i(a)(6)", "FCRA §1681e(b)"],
    statusAfter: {
      clickup: "indispute - mailed",
      googleSheet: "Dispute Ongoing",
    },
    layersActivated: [1, 2],
  },
  {
    number: 3,
    name: "Round 3 — Furnisher Escalation",
    focus: "Shift pressure to the data furnisher",
    requiredActions: [
      "Direct disputes to creditor or collection agency",
      "CFPB complaint update or new complaint referencing furnisher failure",
      "Request: payment ledger, contractual agreement, date of first delinquency, Metro 2 reporting justification, full account verification documentation",
      "Activate furnisher obligations under FCRA §1681s-2(b)",
    ],
    legalBasis: ["FCRA §1681s-2(b)", "Reg V 12 C.F.R. § 1022.43"],
    statusAfter: {
      clickup: "indispute - mailed",
      googleSheet: "Dispute Ongoing",
    },
    layersActivated: [1, 2, 3],
  },
  {
    number: 4,
    name: "Round 4 — Compliance Officer Escalation",
    focus: "Escalate to furnisher compliance officer",
    requiredActions: [
      "Formal escalation to furnisher compliance officer",
      "Cite procedural failures and documentation gaps",
      "CFPB complaint update with compliance failure evidence",
      "Build Layer 3 documentation",
    ],
    legalBasis: ["FCRA §1681e(b)", "FCRA §1681s-2(b)"],
    statusAfter: {
      clickup: "indispute - mailed",
      googleSheet: "Dispute Ongoing",
    },
    layersActivated: [1, 2, 3, 4],
  },
  {
    number: 5,
    name: "Round 5 — Chief Risk Officer Escalation",
    focus: "Escalate to furnisher Chief Risk Officer",
    requiredActions: [
      "Escalation to Chief Risk Officer",
      "Document pattern of non-compliance",
      "CFPB complaint update with full escalation history",
      "Build Layer 4 documentation",
    ],
    legalBasis: ["FCRA §1681e(b)", "FCRA §1681s-2(b)"],
    statusAfter: {
      clickup: "indispute - mailed",
      googleSheet: "Dispute Ongoing",
    },
    layersActivated: [1, 2, 3, 4, 5],
  },
  {
    number: 6,
    name: "Round 6 — General Counsel Legal Exposure Notice",
    focus: "Formal legal exposure notice",
    requiredActions: [
      "Formal notice to furnisher General Counsel",
      "Outline legal exposure under FCRA",
      "CFPB complaint update with legal exposure documentation",
      "Build Layer 5 documentation",
    ],
    legalBasis: [
      "FCRA §1681e(b)",
      "FCRA §1681s-2(b)",
      "FCRA §1681n",
      "FCRA §1681o",
    ],
    statusAfter: {
      clickup: "indispute - mailed",
      googleSheet: "Dispute Ongoing",
    },
    layersActivated: [1, 2, 3, 4, 5, 6],
  },
  {
    number: 7,
    name: "Round 7 — Executive & Regulatory Escalation",
    focus: "Executive office and regulatory referrals",
    requiredActions: [
      "Escalation to furnisher executive office",
      "CFPB, State Attorney General, and federal regulator referrals",
      "Complete evidence package with all prior rounds",
      "Build Layer 6 and 7 documentation",
    ],
    legalBasis: [
      "FCRA §1681e(b)",
      "FCRA §1681s-2(b)",
      "FCRA §1681n",
      "FCRA §1681o",
    ],
    statusAfter: {
      clickup: "indispute - mailed",
      googleSheet: "Dispute Ongoing",
    },
    layersActivated: [1, 2, 3, 4, 5, 6, 7],
  },
];

export function getRoundDefinition(round: number): RoundDefinition {
  return (
    ROUND_DEFINITIONS.find((r) => r.number === round) ?? ROUND_DEFINITIONS[0]
  );
}

export function buildLayerStates(round: number): ComplianceLayer[] {
  const active = getRoundDefinition(round).layersActivated;
  return SEVEN_LAYERS.map((l) => ({
    ...l,
    activatedInRound: active.includes(l.number) ? l.number : null,
    status: (active.includes(l.number) ? "active" : "pending") as
      "pending" | "active",
  }));
}

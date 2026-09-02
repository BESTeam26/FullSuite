// CRA Address Registry — configurable bureau mailing addresses.
// Per the research review: bureaus can change mailing instructions, and the SaaS
// should update an address without redeploying code. Each entry carries an
// effective_date, last_verified_at, source, and active flag.

export interface CRAAddress {
  bureau: string;
  addressee: string;
  street: string;
  cityStateZip: string;
  effectiveDate: string;
  lastVerifiedAt: string;
  source: string;
  active: boolean;
  handling: "mail" | "upload-only";
  handlingNote: string;
}

export const CRA_ADDRESS_REGISTRY: CRAAddress[] = [
  {
    bureau: "Experian",
    addressee: "Experian",
    street: "P.O. Box 4500",
    cityStateZip: "Allen, TX 75013",
    effectiveDate: "2026-01-01",
    lastVerifiedAt: "2026-08-29",
    source: "Experian dispute page (current)",
    active: true,
    handling: "upload-only",
    handlingNote:
      "Experian = upload only. Do not mail Experian dispute letters. Upload to the Experian Upload Center.",
  },
  {
    bureau: "Equifax",
    addressee: "Equifax Information Services LLC",
    street: "P.O. Box 740256",
    cityStateZip: "Atlanta, GA 30374-0256",
    effectiveDate: "2026-01-01",
    lastVerifiedAt: "2026-08-29",
    source: "Equifax published mail-dispute address (current)",
    active: true,
    handling: "mail",
    handlingNote: "Equifax disputes are mailed via LetterStream (paper trail).",
  },
  {
    bureau: "TransUnion",
    addressee: "TransUnion Consumer Solutions",
    street: "P.O. Box 2000",
    cityStateZip: "Chester, PA 19016-2000",
    effectiveDate: "2026-01-01",
    lastVerifiedAt: "2026-08-29",
    source: "TransUnion dispute page (current, ZIP+4 19016-2000)",
    active: true,
    handling: "mail",
    handlingNote:
      "TransUnion disputes are mailed via LetterStream (paper trail).",
  },
];

export function getActiveCRAAddress(bureau: string): CRAAddress | null {
  return (
    CRA_ADDRESS_REGISTRY.find((a) => a.bureau === bureau && a.active) ?? null
  );
}

// ─── Reinsertion Detection ────────────────────────────────────────────────────
// §1681i(a)(5): when deleted information is reinserted, the furnisher must
// certify completeness & accuracy and the CRA must notify the consumer within
// 5 business days. Reasonable procedures must prevent improper reappearance.

export interface ReportSnapshot {
  date: string;
  accountIds: string[]; // accounts present on this snapshot
}

export interface ReinsertionFinding {
  accountId: string;
  wasDeleted: boolean;
  reappeared: boolean;
  deletionDate?: string;
  reappearanceDate?: string;
  consumerNotifiedWithin5BusinessDays: boolean;
  furnisherCertified: boolean;
  alert: string;
}

export function detectReinsertions(
  snapshots: ReportSnapshot[],
): ReinsertionFinding[] {
  const findings: ReinsertionFinding[] = [];
  // Walk snapshots in order; flag accounts that disappear then reappear.
  const presence: Record<string, boolean> = {};
  let lastDeletionDate: Record<string, string> = {};

  for (let i = 0; i < snapshots.length; i++) {
    const snap = snapshots[i];
    const presentSet = new Set(snap.accountIds);
    for (const id of Object.keys(presence)) {
      if (presence[id] && !presentSet.has(id)) {
        // Deleted on this snapshot
        lastDeletionDate[id] = snap.date;
        presence[id] = false;
      }
    }
    for (const id of snap.accountIds) {
      if (presence[id] === false && i > 0) {
        // Reappeared after deletion → reinsertion
        findings.push({
          accountId: id,
          wasDeleted: true,
          reappeared: true,
          deletionDate: lastDeletionDate[id],
          reappearanceDate: snap.date,
          consumerNotifiedWithin5BusinessDays: false, // flag for human check
          furnisherCertified: false, // flag for human check
          alert:
            "Reinsertion detected — require furnisher certification of completeness & accuracy and 5-business-day consumer notice under §1681i(a)(5)(B)-(C).",
        });
      }
      presence[id] = true;
    }
  }
  return findings;
}

// ─── Identity Theft Block Workflow (§1681c-2) ─────────────────────────────────
// The CRA must block information resulting from identity theft within 4 business
// days after receiving: (1) proof of identity, (2) an identity theft report,
// (3) identification of the disputed information, (4) the consumer's statement
// that the information does not relate to a transaction by the consumer.

export interface IdentityTheftBlockChecklist {
  proofOfIdentity: boolean;
  identityTheftReport: boolean; // FTC report via IdentityTheft.gov
  disputedInfoIdentified: boolean;
  consumerStatementProvided: boolean;
  blockingDeadlineBusinessDays: number;
  ready: boolean;
}

export function buildIdentityTheftChecklist(
  overrides: Partial<IdentityTheftBlockChecklist> = {},
): IdentityTheftBlockChecklist {
  const base: IdentityTheftBlockChecklist = {
    proofOfIdentity: false,
    identityTheftReport: false,
    disputedInfoIdentified: false,
    consumerStatementProvided: false,
    blockingDeadlineBusinessDays: 4,
    ready: false,
  };
  const merged = { ...base, ...overrides };
  merged.ready =
    merged.proofOfIdentity &&
    merged.identityTheftReport &&
    merged.disputedInfoIdentified &&
    merged.consumerStatementProvided;
  return merged;
}

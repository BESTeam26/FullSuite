/**
 * ClickUp → BES partner migration: the mapping, and the credential guard.
 *
 * This is the ADAPTER layer of PARTNER_DATA_MIGRATION.md. Everything here is
 * pure: it takes a snapshot of the ClickUp "Partners Database" list and
 * produces a PROPOSAL. It writes nothing. §11 of that document is explicit —
 * Dee reviews the dry run before anything reaches production — so the import
 * is deliberately a separate step that consumes this output.
 *
 * Three rules shape the whole file.
 *
 * 1. LIFECYCLE IS NOT SERVICE. ClickUp mixes them into one status
 *    (`active partner creditops`). Split on the way in, never reproduced.
 *
 * 2. A BILLING ROW MUST NEVER WIDEN WHAT ANYONE CAN READ. This produces
 *    `partner_services` — a commercial line — and never a
 *    `fulfillment_engagement`, which is the authorization `bes_may_fulfil()`
 *    reads. The two sound identical and are opposite things.
 *
 * 3. CREDENTIALS ARE NEVER MIGRATED. Dee: "Never import plaintext
 *    passwords/credentials found in ClickUp descriptions. Strip them. Mark:
 *    CREDENTIAL_MIGRATION_REQUIRED. Never print those secrets in logs or
 *    reports." Measured against the live list, the descriptions hold
 *    DisputeFox, LetterStream, Gmail, GoHighLevel and Zapier passwords in
 *    plain text — so `scrubCredentials` is not a precaution here, it is the
 *    load-bearing part of the import.
 *
 * The ClickUp field ids live in this file and must not appear in domain logic.
 *
 * NOTHING IN THE APPLICATION IMPORTS THIS, BY DESIGN — it is a one-way
 * migration tool, not a feature, and it is not in the bundle. It lives under
 * `src/` only because that is where vitest looks for tests, and it is tested
 * because the credential guard below is the load-bearing part. Its consumer is
 * the import run Dee has yet to approve (`PARTNER_DATA_MIGRATION.md` §11).
 * Do not remove it as dead code.
 */

/* ------------------------------------------------------------------ */
/* 1. The ClickUp side                                                 */
/* ------------------------------------------------------------------ */

/** Custom field ids on list 901812869358 (BES HQ ▸ Partners Database). */
export const CLICKUP_FIELD = {
  activeClients: "e3710e8d-8ade-44ee-b713-99ebd87696ee",
  owner: "7e2b2c95-b47b-452d-9a72-1fe76b7ced52",
  mrr: "f903a359-5ca5-4a94-b69c-4cc4d4bae048",
  assignedTeam: "01f6ba56-bda9-4b27-b24e-3757eb211c17",
  billingStatus: "087bdf2a-aa33-47dc-84b8-898b95077227",
  mood: "ac3d2ef4-f9b1-4926-bea3-a77f4b5e77ad",
  paymentMethod: "c7aff838-7ccd-420b-9a06-ca14300fde6b",
  saasPlan: "062a3e4f-1d85-462e-8369-606bc5053adb",
  /** Derived in BES from `started_on`; the ClickUp formula is not imported. */
  daysActive: "8bd1e6c0-b4aa-4d65-861e-a72599f4eb13",
} as const;

/** The list's own status vocabulary. */
export type ClickUpPartnerStatus =
  | "new partner"
  | "onboarding"
  | "active partner creditops"
  | "active partner full"
  | "active partner bes crm"
  | "on hold"
  | "cancelled / archived";

/**
 * One ClickUp task, normalised. Dropdown values arrive as an ORDER INDEX, not
 * a label, so the option lists are resolved here rather than by the caller.
 */
export interface ClickUpPartnerRow {
  taskId: string;
  name: string;
  status: string;
  tags: string[];
  /** The partner's own person, from the OWNER field — not the BES assignee. */
  owner: string | null;
  /** `Team Dan` (0) or `Team Daniel` (1). */
  assignedTeamIndex: number | null;
  saasPlanIndex: number | null;
  billingStatusIndex: number | null;
  moodIndex: number | null;
  paymentMethodIndex: number | null;
  /**
   * ClickUp returns a NUMBER field's value as a STRING ("625", "536"), and a
   * DROPDOWN's as an order index. Coerce with `clickupNumber` when building
   * the snapshot — a string that reaches `legacyReportedActiveClients` lands
   * in an integer column by Postgres coercion and looks identical in the
   * proposal, which is the kind of wrong that survives review.
   */
  mrrUsd: number | null;
  activeClients: number | null;
  startDateMs: number | null;
  /**
   * The task description. Held only long enough to be scrubbed and
   * classified: `proposePartnerImport` never returns it and nothing writes it.
   */
  description: string | null;
}

/**
 * A ClickUp number field, as a number.
 *
 * The API sends `"625"`, and an empty field is absent rather than null. Only
 * a finite number survives: `""`, `"n/a"` and a stray `Infinity` all become
 * null, because a partner with no MRR recorded must read as "not recorded"
 * and never as zero — zero is a commercial claim.
 */
export function clickupNumber(value: unknown): number | null {
  if (value === null || value === undefined || value === "") return null;
  const n = typeof value === "number" ? value : Number(String(value).replace(/[$,\s]/g, ""));
  return Number.isFinite(n) ? n : null;
}

/* ------------------------------------------------------------------ */
/* 2. Lifecycle and service — the split                                */
/* ------------------------------------------------------------------ */

export type PartnerLifecycle =
  "new" | "onboarding" | "active" | "on_hold" | "suspended" | "archived";

/** ClickUp status → BES partner lifecycle (migration doc §2.1). */
export function partnerLifecycleFor(status: string): PartnerLifecycle {
  switch (status.trim().toLowerCase()) {
    case "new partner": return "new";
    case "onboarding": return "onboarding";
    case "active partner creditops":
    case "active partner full":
    case "active partner bes crm": return "active";
    case "on hold": return "on_hold";
    case "cancelled / archived": return "archived";
    /* An unrecognised status is never guessed into `active`: a partner who is
       silently activated by a typo is worse than one Dee has to place. */
    default: return "new";
  }
}

export type PartnerServiceType = "creditops" | "fundingops" | "bes_crm" | "talentops";

const TAG_SERVICE: Record<string, PartnerServiceType> = {
  creditops: "creditops",
  fundingops: "fundingops",
  "bes crm": "bes_crm",
  bes_crm: "bes_crm",
  talentops: "talentops",
};

/**
 * Which services this partner buys.
 *
 * Both sources are weak on their own: the status says `active partner full`
 * without saying what "full" contains, and the tags are free text somebody
 * typed. So both are read and unioned, and `full` on its own produces NO
 * service — an empty list is a question for Dee, where a guessed CreditOps
 * line would become a commercial fact nobody decided.
 */
export function servicesFor(status: string, tags: string[]): PartnerServiceType[] {
  const found = new Set<PartnerServiceType>();
  const s = status.trim().toLowerCase();
  if (s === "active partner creditops") found.add("creditops");
  if (s === "active partner bes crm") found.add("bes_crm");
  for (const tag of tags) {
    const service = TAG_SERVICE[tag.trim().toLowerCase()];
    if (service) found.add(service);
  }
  return [...found].sort();
}

export type PartnerHealth = "happy" | "neutral" | "concerned" | "at_risk";

/** Client Feeling / Mood, by option order. */
export function healthFor(index: number | null): PartnerHealth | null {
  return index === null || index === undefined
    ? null
    : (["happy", "neutral", "concerned", "at_risk"][index] as PartnerHealth) ?? null;
}

export type BillingStatus = "active" | "invoice_pending" | "overdue";

export function billingStatusFor(index: number | null): BillingStatus | null {
  return index === null || index === undefined
    ? null
    : (["active", "invoice_pending", "overdue"][index] as BillingStatus) ?? null;
}

export type PaymentChannel = "PAYPAL" | "WISE" | "GHL_INVOICE" | "AUTHORIZE_NET" | "STRIPE" | "UNKNOWN";

export function paymentChannelFor(index: number | null): PaymentChannel {
  return index === null || index === undefined
    ? "UNKNOWN"
    : (["PAYPAL", "WISE", "GHL_INVOICE", "AUTHORIZE_NET", "STRIPE"][index] as PaymentChannel) ?? "UNKNOWN";
}

export function saasPlanFor(index: number | null): string | null {
  return index === null || index === undefined ? null : ["Core", "Enterprise"][index] ?? null;
}

/** `Team Dan` and `Team Daniel` are two options; the team is resolved by name at import. */
export function assignedTeamNameFor(index: number | null): string | null {
  return index === null || index === undefined ? null : ["Team Dan", "Team Daniel"][index] ?? null;
}

/* ------------------------------------------------------------------ */
/* 3. Credentials — detect, classify, strip                            */
/* ------------------------------------------------------------------ */

/**
 * The platforms whose credentials appear in these descriptions. Naming the
 * PLATFORM is safe and actionable ("rotate the DisputeFox login"); naming the
 * value is the thing that must never leave ClickUp.
 */
const PLATFORM_PATTERNS: { platform: string; re: RegExp }[] = [
  { platform: "DisputeFox", re: /\b(disputefox|\bDF\b)/i },
  { platform: "LetterStream", re: /letterstream|\bLS MAILING\b/i },
  { platform: "GoHighLevel", re: /gohighlevel|\bGHL\b/i },
  { platform: "Google / Gmail", re: /\bgmail\b|google account/i },
  { platform: "Zapier", re: /\bzapier\b/i },
  { platform: "Credit Repair Cloud", re: /\bCRC\b|credit repair cloud/i },
  { platform: "Stripe", re: /\bstripe\b/i },
  { platform: "PayPal", re: /\bpaypal\b/i },
  { platform: "Quo phone system", re: /\bquo\b/i },
];

/**
 * A line that carries a secret.
 *
 * Deliberately GENEROUS: a false positive costs one stripped line of an
 * operational note, and a false negative copies a password into a database
 * column that everyone with `partners.view` can read. The asymmetry decides
 * the tuning.
 *
 * `password: N/A` and `Pending for Activation` are still stripped. They look
 * harmless, but keeping the shape of a credential block invites somebody to
 * fill the blank in later.
 */
const SECRET_LINE =
  /(pass\s*word|passcode|pwd|api[\s_-]?key|secret|token|security\s*code|otp|2fa|mfa\s*code|credential)/i;

/** A line that is only a label — "Logins & Links" — and is not itself a secret. */
const SECRET_HEADING = /^#{1,6}\s|^\*\*[^*]+\*\*:?\s*$/;

export interface CredentialFinding {
  /** Whether anything credential-shaped was found at all. */
  present: boolean;
  /** Platforms named alongside the secrets. Safe to show and to act on. */
  platforms: string[];
  /** How many lines were withheld. A count, never the content. */
  strippedLines: number;
}

/**
 * Split a description into the part that may be stored and a finding about
 * the part that may not.
 *
 * The operational content is worth keeping — Kenneth Winfield's task holds a
 * complete, useful SOP (scope of work, communication rules, dispute
 * standards) with three passwords in the middle of it. Dropping the whole
 * description to be safe would throw that away; keeping the whole description
 * would publish the passwords. So it is stripped line by line.
 */
export function scrubCredentials(description: string | null): {
  safeText: string;
  finding: CredentialFinding;
} {
  if (!description || !description.trim()) {
    return { safeText: "", finding: { present: false, platforms: [], strippedLines: 0 } };
  }
  const kept: string[] = [];
  let stripped = 0;
  for (const line of description.split(/\r?\n/)) {
    if (SECRET_LINE.test(line) && !SECRET_HEADING.test(line.trim())) {
      stripped += 1;
      continue;
    }
    kept.push(line);
  }
  const platforms = stripped > 0
    ? PLATFORM_PATTERNS.filter((p) => p.re.test(description)).map((p) => p.platform)
    : [];
  return {
    safeText: kept.join("\n").replace(/\n{3,}/g, "\n\n").trim(),
    finding: { present: stripped > 0, platforms, strippedLines: stripped },
  };
}

/**
 * The note that goes into `outsourcing_groups.credential_note`.
 *
 * Says WHAT KIND of secret exists and WHERE IT LIVES TODAY. Never the secret.
 */
export function credentialNoteFor(row: ClickUpPartnerRow, finding: CredentialFinding): string | null {
  if (!finding.present) return null;
  const where = `ClickUp task ${row.taskId}`;
  const what = finding.platforms.length > 0
    ? finding.platforms.join(", ")
    : "unnamed platforms";
  return `CREDENTIAL_MIGRATION_REQUIRED — plaintext credentials for ${what} are held in ${where}`
    + ` (${finding.strippedLines} line${finding.strippedLines === 1 ? "" : "s"} withheld from this record).`
    + " Move them into a secret store and delete them from ClickUp; they were not copied here.";
}

/* ------------------------------------------------------------------ */
/* 4. Identity reconciliation                                          */
/* ------------------------------------------------------------------ */

/** Company suffixes and separators that differ between the two sources. */
const NAME_NOISE = /\b(llc|inc|ltd|l\.?l\.?c|corp|corporation|company|co|group|solutions|consulting|consultants|services|enterprise|enterprises)\b/g;

export function normalizeName(name: string): string {
  return name
    .toLowerCase()
    .replace(/\(.*?\)/g, " ")
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(NAME_NOISE, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** Token overlap, 0..1. Enough to PROPOSE a match; never enough to make one. */
export function nameSimilarity(a: string, b: string): number {
  const at = new Set(normalizeName(a).split(" ").filter(Boolean));
  const bt = new Set(normalizeName(b).split(" ").filter(Boolean));
  if (at.size === 0 || bt.size === 0) return 0;
  let shared = 0;
  for (const t of at) if (bt.has(t)) shared += 1;
  return shared / Math.max(at.size, bt.size);
}

export interface ExistingPartner {
  id: string;
  name: string;
  /** The partner's own contact person, when BES recorded one. */
  primaryContact: string | null;
}

export interface MatchCandidate {
  partnerId: string;
  partnerName: string;
  confidence: number;
  /** Why this was proposed, in words Dee can check. */
  evidence: string[];
}

/**
 * Candidate existing partners for a ClickUp row, best first.
 *
 * The two sources name the same partner differently in both directions:
 * ClickUp's CreditOps folder writes "Wavy One Solutions - Quentin Grays"
 * while the BES record is called "Quentin Grays". So the OWNER field is
 * matched against the existing name as well as the company name is — that
 * single rule is what finds the two partners BES already has.
 *
 * Nothing here merges anything. Dee approves each match (§8).
 */
export function matchCandidates(
  row: ClickUpPartnerRow,
  existing: ExistingPartner[],
): MatchCandidate[] {
  const out: MatchCandidate[] = [];
  for (const p of existing) {
    const evidence: string[] = [];
    const byName = nameSimilarity(row.name, p.name);
    if (byName > 0) evidence.push(`company name ${Math.round(byName * 100)}% similar`);

    let byOwner = 0;
    if (row.owner) {
      byOwner = nameSimilarity(row.owner, p.name);
      if (byOwner > 0) evidence.push(`ClickUp OWNER "${row.owner}" ${Math.round(byOwner * 100)}% similar to the BES record's name`);
    }

    let byContact = 0;
    if (row.owner && p.primaryContact) {
      byContact = nameSimilarity(row.owner, p.primaryContact);
      if (byContact > 0) evidence.push(`contact "${p.primaryContact}" ${Math.round(byContact * 100)}% similar to the ClickUp OWNER`);
    }

    const confidence = Math.max(byName, byOwner, byContact);
    if (confidence > 0) out.push({ partnerId: p.id, partnerName: p.name, confidence, evidence });
  }
  return out.sort((a, b) => b.confidence - a.confidence);
}

/* ------------------------------------------------------------------ */
/* 5. The proposal                                                     */
/* ------------------------------------------------------------------ */

export interface PartnerProposal {
  taskId: string;
  sourceName: string;
  action: "create" | "reconcile" | "needs_decision";
  /** Set when `action` is reconcile or needs_decision. */
  match: MatchCandidate | null;
  lifecycle: PartnerLifecycle;
  services: PartnerServiceType[];
  owner: string | null;
  assignedTeamName: string | null;
  saasPlan: string | null;
  health: PartnerHealth | null;
  /** Financial. Behind `partners.financials.view` once written. */
  billingStatus: BillingStatus | null;
  paymentChannel: PaymentChannel;
  mrrCents: number | null;
  legacyReportedActiveClients: number | null;
  startedOn: string | null;
  credentialMigrationRequired: boolean;
  credentialNote: string | null;
  /** The description with every credential-shaped line withheld. */
  safeNotes: string;
  warnings: string[];
}

/** Above this, a name match is proposed as a reconcile rather than a question. */
const RECONCILE_THRESHOLD = 0.8;
/** Below this a candidate is not worth showing at all. */
const CANDIDATE_FLOOR = 0.34;

export function proposePartnerImport(
  rows: ClickUpPartnerRow[],
  existing: ExistingPartner[],
): PartnerProposal[] {
  return rows.map((row) => {
    const { safeText, finding } = scrubCredentials(row.description);
    const candidates = matchCandidates(row, existing).filter((c) => c.confidence >= CANDIDATE_FLOOR);
    const best = candidates[0] ?? null;
    const warnings: string[] = [];

    const services = servicesFor(row.status, row.tags);
    const lifecycle = partnerLifecycleFor(row.status);

    if (lifecycle === "active" && services.length === 0) {
      warnings.push(
        `Status "${row.status}" says active but neither the status nor the tags name a service. Dee must say what this partner buys — nothing is guessed.`,
      );
    }
    if (!row.owner) warnings.push("No OWNER: the partner has no contact person to create.");
    if (row.mrrUsd === null && lifecycle === "active") {
      warnings.push("No MRR in ClickUp. The revenue tracker is authoritative for money and wins here, so this is expected — but it means this row carries no commercial terms.");
    }
    if (candidates.length > 1 && candidates[0].confidence - candidates[1].confidence < 0.15) {
      warnings.push(
        `Two existing partners match almost equally (${candidates[0].partnerName}, ${candidates[1].partnerName}). Dee chooses.`,
      );
    }
    if (finding.present) {
      warnings.push(
        `Plaintext credentials found in the ClickUp description${finding.platforms.length ? ` (${finding.platforms.join(", ")})` : ""}. Not copied. ${finding.strippedLines} line${finding.strippedLines === 1 ? "" : "s"} withheld.`,
      );
    }

    const action: PartnerProposal["action"] = !best
      ? "create"
      : best.confidence >= RECONCILE_THRESHOLD
        ? "reconcile"
        : "needs_decision";

    return {
      taskId: row.taskId,
      sourceName: row.name,
      action,
      match: best,
      lifecycle,
      services,
      owner: row.owner,
      assignedTeamName: assignedTeamNameFor(row.assignedTeamIndex),
      saasPlan: saasPlanFor(row.saasPlanIndex),
      health: healthFor(row.moodIndex),
      billingStatus: billingStatusFor(row.billingStatusIndex),
      paymentChannel: paymentChannelFor(row.paymentMethodIndex),
      mrrCents: row.mrrUsd === null ? null : Math.round(row.mrrUsd * 100),
      legacyReportedActiveClients: row.activeClients,
      startedOn: row.startDateMs ? new Date(row.startDateMs).toISOString().slice(0, 10) : null,
      credentialMigrationRequired: finding.present,
      credentialNote: credentialNoteFor(row, finding),
      safeNotes: safeText,
      warnings,
    };
  });
}

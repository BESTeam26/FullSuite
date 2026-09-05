/**
 * Requirement resolver — turns versioned, effective-dated requirement rules
 * into the document requests a funding file must have on a given day.
 * Deterministic and pure (no AI): the rules are rows, the answer is a list.
 *
 * A rule applies when it is active and in force on `asOf`, matches the
 * product family (and subtype when it names one), is either platform-wide
 * (no lender) or names the lender/program being prepared for, and its
 * `condition` holds for the application and party. Periodic documents expand
 * to one request per complete month in the lookback window.
 */
export interface RequirementRule {
  id: string;
  version: number;
  active: boolean;
  productFamily: string;
  productSubtype: string | null;
  lenderId: string | null;
  programId: string | null;
  partyKind: string;
  documentType: string;
  requirement: "required" | "conditional";
  /** min_amount, max_amount, states[], entity_types[], min_ownership_pct, scenario: { flag: true } */
  condition: Record<string, unknown>;
  lookbackMonths: number | null;
  effectiveFrom: string;      // yyyy-mm-dd
  effectiveUntil: string | null;
}
export interface ResolverApplication {
  productFamily: string | null;
  productSubtype?: string | null;
  requestedAmount: number | null;
  state: string | null;
  entityType: string | null;
  scenario: Record<string, unknown>;
}
export interface ResolverParty { id: string; kind: string; ownershipPct: number | null }
export interface ResolvedRequest {
  documentType: string;
  partyKind: string;
  partyId: string | null;
  period: string | null;
  requirement: "required" | "conditional";
  ruleId: string;
  ruleVersion: number;
}
export interface ResolveInput {
  rules: RequirementRule[];
  application: ResolverApplication;
  parties: ResolverParty[];
  asOf: string;               // yyyy-mm-dd
  lenderId?: string | null;
  programId?: string | null;
}

const num = (v: unknown): number | null => (typeof v === "number" && Number.isFinite(v) ? v : null);
const list = (v: unknown): string[] => (Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : []);

export function ruleInForce(rule: RequirementRule, asOf: string): boolean {
  return rule.active && rule.effectiveFrom <= asOf && (rule.effectiveUntil === null || rule.effectiveUntil > asOf);
}

/** The N complete calendar months before the month of `asOf`, newest first, as yyyy-mm. */
export function lookbackPeriods(asOf: string, months: number): string[] {
  const [y, m] = asOf.split("-").map(Number);
  const out: string[] = [];
  for (let i = 1; i <= months; i++) {
    const d = new Date(Date.UTC(y, m - 1 - i, 1));
    out.push(`${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`);
  }
  return out;
}

function conditionHolds(rule: RequirementRule, app: ResolverApplication, party: ResolverParty | null): boolean {
  const c = rule.condition;
  const minAmount = num(c.min_amount), maxAmount = num(c.max_amount);
  if (minAmount !== null && (app.requestedAmount === null || app.requestedAmount < minAmount)) return false;
  if (maxAmount !== null && (app.requestedAmount === null || app.requestedAmount > maxAmount)) return false;
  const states = list(c.states);
  if (states.length && (!app.state || !states.includes(app.state.toUpperCase()))) return false;
  const entityTypes = list(c.entity_types).map((s) => s.toLowerCase());
  if (entityTypes.length && (!app.entityType || !entityTypes.includes(app.entityType.toLowerCase()))) return false;
  const minOwnership = num(c.min_ownership_pct);
  if (minOwnership !== null && (party === null || party.ownershipPct === null || party.ownershipPct < minOwnership)) return false;
  const scenario = c.scenario;
  if (scenario && typeof scenario === "object" && !Array.isArray(scenario)) {
    for (const [flag, wanted] of Object.entries(scenario as Record<string, unknown>)) {
      if (Boolean(app.scenario[flag]) !== Boolean(wanted)) return false;
    }
  }
  return true;
}

function ruleTargetsThisPreparation(rule: RequirementRule, app: ResolverApplication, input: ResolveInput): boolean {
  if (!app.productFamily || rule.productFamily !== app.productFamily) return false;
  if (rule.productSubtype && rule.productSubtype !== (app.productSubtype ?? null)) return false;
  if (rule.lenderId && rule.lenderId !== (input.lenderId ?? null)) return false;
  if (rule.programId && rule.programId !== (input.programId ?? null)) return false;
  return true;
}

/** Everything the file must have on `asOf`. Party-scoped rules expand per matching party; file-level rules once. */
export function resolveRequirements(input: ResolveInput): ResolvedRequest[] {
  const out: ResolvedRequest[] = [];
  for (const rule of input.rules) {
    if (!ruleInForce(rule, input.asOf) || !ruleTargetsThisPreparation(rule, input.application, input)) continue;
    const targets: (ResolverParty | null)[] = rule.partyKind === "business" || rule.partyKind === "person"
      ? [input.parties.find((p) => p.kind === rule.partyKind) ?? null]     // one applicant party; a request without a party row is still valid
      : input.parties.filter((p) => p.kind === rule.partyKind);            // owners, properties, vehicles…: one request per party
    for (const party of targets) {
      if (!conditionHolds(rule, input.application, party)) continue;
      const periods = rule.lookbackMonths ? lookbackPeriods(input.asOf, rule.lookbackMonths) : [null];
      for (const period of periods) {
        out.push({ documentType: rule.documentType, partyKind: rule.partyKind, partyId: party?.id ?? null, period, requirement: rule.requirement, ruleId: rule.id, ruleVersion: rule.version });
      }
    }
  }
  return dedupe(out);
}

const keyOf = (r: { documentType: string; partyId: string | null; period: string | null }) => `${r.documentType}|${r.partyId ?? ""}|${r.period ?? ""}`;

/** Two rules asking for the same document keep one request; "required" wins over "conditional". */
function dedupe(rows: ResolvedRequest[]): ResolvedRequest[] {
  const seen = new Map<string, ResolvedRequest>();
  for (const r of rows) {
    const k = keyOf(r);
    const prev = seen.get(k);
    if (!prev || (prev.requirement === "conditional" && r.requirement === "required")) seen.set(k, r);
  }
  return [...seen.values()];
}

/** Resolved requests that no existing request already covers (same type, party and period). */
export function missingRequests(resolved: ResolvedRequest[], existing: { documentType: string; partyId: string | null; period: string | null }[]): ResolvedRequest[] {
  const have = new Set(existing.map(keyOf));
  return resolved.filter((r) => !have.has(keyOf(r)));
}

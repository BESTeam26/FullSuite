/**
 * Credit Reporting Integrity — the finding engine. Deterministic, no AI.
 * Reads canonical report items (consumer-facing display data) and earlier
 * snapshots of the same client, applies the rule catalogue and returns
 * findings whose strongest classification is "potential legal issue".
 *
 * Doctrine (M1): a difference is not yet an inaccuracy; an inaccuracy is not a
 * Metro 2 violation; a Metro 2 deviation is not an FCRA violation; an FCRA
 * issue does not entitle anyone to whole-account deletion. Establish the fact,
 * identify the duty and the party, choose the remedy the law supports.
 */
import type { RawReportItem } from "@/lib/credit-classification";
import { INTEGRITY_RULES, RULES_CATALOGUE_VERSION, ruleById, type FindingClassification, type IntegrityRule } from "./reporting-integrity-rules";

export interface SnapshotItem extends RawReportItem { accountRef: string }
export interface ReportSnapshot { reportId: string; pulledAt: string; items: SnapshotItem[] }

export interface IntegrityFinding {
  /** The stored report the finding is read against — the latest snapshot; null only when a single item is evaluated outside a stored report. */
  reportId: string | null;
  ruleId: string;
  ruleVersion: number;
  catalogueVersion: string;
  accountRef: string;
  itemName: string;
  classification: FindingClassification;
  verdict: IntegrityRule["verdict"];
  observation: string;
  /** Plain values a reviewer can check; never a conclusion. */
  evidence: Record<string, unknown>;
  fields: string[];
  route: IntegrityRule["route"];
  remedy: IntegrityRule["remedy"];
  humanReviewRequired: boolean;
  /** Always false: our source is a consumer-facing display, not the furnisher's record. */
  rawMetro2Verified: false;
}

/* ------------------------------------------------------------------ */
/* Tolerant readers for display strings                                 */
/* ------------------------------------------------------------------ */
const MONTHS = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];

/** yyyy-mm from "01/2023", "1/15/2023", "2023-01", "2023-01-15", "Jan 2023"; null when unreadable. */
export function toYearMonth(text: string | undefined | null): string | null {
  if (!text) return null;
  const s = text.trim();
  let m = s.match(/^(\d{4})-(\d{1,2})(?:-\d{1,2})?$/);
  if (m) return `${m[1]}-${m[2].padStart(2, "0")}`;
  m = s.match(/^(\d{1,2})\/(?:\d{1,2}\/)?(\d{4})$/);
  if (m) return `${m[2]}-${m[1].padStart(2, "0")}`;
  m = s.match(/^([A-Za-z]{3})[a-z]*\.?\s+(\d{4})$/);
  if (m) { const i = MONTHS.indexOf(m[1].toLowerCase()); if (i >= 0) return `${m[2]}-${String(i + 1).padStart(2, "0")}`; }
  return null;
}

/** Whole dollars from "$4,225.10" / "4225"; null when absent or unreadable. */
export function toDollars(text: string | undefined | null): number | null {
  if (!text) return null;
  const n = Number(text.replace(/[^0-9.-]/g, ""));
  return Number.isFinite(n) && text.replace(/[^0-9]/g, "") !== "" ? n : null;
}

const has = (s: string | undefined, ...words: string[]) => { const t = (s ?? "").toLowerCase(); return words.some((w) => t.includes(w)); };
const isCurrentOrPaid = (status: string) => has(status, "current", "paid", "pays as agreed", "never late") && !has(status, "charge", "collection", "late", "past due", "delinq");
const isPaid = (status: string) => has(status, "paid in full", "paid") && !has(status, "unpaid", "paid charge", "settled for less");
const isChargeOff = (status: string) => has(status, "charge");
const isCollectionLike = (item: RawReportItem) => has(item.status, "collection") || has(item.subtype, "collection");
const derogatoryRemark = (remarks: string | undefined) => has(remarks, "late", "30", "60", "90", "120", "charge", "collection", "delinq", "past due");

/* ------------------------------------------------------------------ */
/* Findings                                                             */
/* ------------------------------------------------------------------ */
function finding(rule: IntegrityRule, item: RawReportItem & { accountRef: string }, observation: string, evidence: Record<string, unknown>): IntegrityFinding {
  return {
    reportId: null,
    ruleId: rule.id, ruleVersion: rule.version, catalogueVersion: RULES_CATALOGUE_VERSION,
    accountRef: item.accountRef, itemName: item.name,
    classification: rule.classification, verdict: rule.verdict, observation, evidence, fields: rule.fields,
    route: rule.route, remedy: rule.remedy, humanReviewRequired: rule.humanReviewRequired, rawMetro2Verified: false,
  };
}

/** Rules that read one item as reported today. */
export function evaluateItem(item: SnapshotItem): IntegrityFinding[] {
  if (item.kind !== "Account") return [];
  const out: IntegrityFinding[] = [];
  const dofd = toYearMonth(item.dofd);
  const opened = toYearMonth(item.openDate);
  const balance = toDollars(item.balance);

  if (dofd && opened && dofd < opened && !isCollectionLike(item)) {
    out.push(finding(ruleById("DOFD.BEFORE_OPEN_DATE")!, item, `The delinquency date (${dofd}) is earlier than the open date (${opened}) on a non-collection account.`, { dofd, open_date: opened, status: item.status }));
  }
  if (dofd && isCurrentOrPaid(item.status) && balance === 0 && !derogatoryRemark(item.remarks)) {
    out.push(finding(ruleById("DOFD.ON_CURRENT_ZERO_BALANCE")!, item, `Reported ${item.status} with a $0 balance and no late remark, yet a delinquency date (${dofd}) is populated.`, { dofd, status: item.status, balance }));
  }
  if (isPaid(item.status) && balance !== null && balance > 0) {
    out.push(finding(ruleById("STATUS.PAID_WITH_BALANCE")!, item, `Reported ${item.status} while a balance of $${balance.toLocaleString()} is still shown.`, { status: item.status, balance }));
  }
  if (isChargeOff(item.status) && balance !== null && balance > 0) {
    out.push(finding(ruleById("STATUS.CHARGEOFF_WITH_BALANCE")!, item, `Charge-off with a $${balance.toLocaleString()} balance — not a contradiction by itself.`, { status: item.status, balance }));
  }
  if (isCurrentOrPaid(item.status) && derogatoryRemark(item.remarks)) {
    out.push(finding(ruleById("STATUS.CURRENT_WITH_HISTORY")!, item, `Current/paid today with past late-payment remarks — present condition and history are different time dimensions.`, { status: item.status, remarks: item.remarks }));
  }
  if (item.bureaus.length > 0 && item.bureaus.length < 3) {
    out.push(finding(ruleById("BUREAU.MISSING_ON_ONE")!, item, `Reported by ${item.bureaus.join(", ")} only. Absence at another bureau is not proof this bureau cannot verify it.`, { bureaus: item.bureaus }));
  }
  return out;
}

/**
 * Chronology across snapshots (oldest → newest), keyed by account_ref.
 * Never overwrites: the caller passes every stored import.
 */
export function evaluateChronology(snapshots: ReportSnapshot[]): IntegrityFinding[] {
  const ordered = [...snapshots].sort((a, b) => a.pulledAt.localeCompare(b.pulledAt));
  if (ordered.length < 2) return [];
  const out: IntegrityFinding[] = [];
  const latest = ordered[ordered.length - 1];
  const presence = new Map<string, boolean[]>();   // accountRef → present per snapshot
  const dofdHistory = new Map<string, (string | null)[]>();
  const refs = new Set(ordered.flatMap((s) => s.items.filter((i) => i.kind === "Account").map((i) => i.accountRef)));
  for (const ref of refs) {
    presence.set(ref, ordered.map((s) => s.items.some((i) => i.accountRef === ref)));
    dofdHistory.set(ref, ordered.map((s) => toYearMonth(s.items.find((i) => i.accountRef === ref)?.dofd)));
  }
  for (const ref of refs) {
    const item = latest.items.find((i) => i.accountRef === ref);
    if (!item) continue;
    const dofds = dofdHistory.get(ref)!.filter((d): d is string => d !== null);
    const earliest = dofds.length ? dofds[0] : null;
    const current = dofds.length ? dofds[dofds.length - 1] : null;
    if (earliest && current && current > earliest && !derogatoryRemark(item.remarks)) {
      out.push(finding(ruleById("DOFD.MOVED_LATER")!, item, `The delinquency date moved from ${earliest} to ${current} across imports with no new delinquency evidenced in the remarks.`, { dofd_history: dofdHistory.get(ref), pulled_at: ordered.map((s) => s.pulledAt) }));
    }
    const seen = presence.get(ref)!;
    const firstSeen = seen.indexOf(true);
    const gap = seen.slice(firstSeen).some((p, i, arr) => !p && arr.slice(i + 1).some(Boolean));
    if (gap) {
      out.push(finding(ruleById("ITEM.REAPPEARED")!, item, `This account was present, then absent, then present again across imports. Check whether the absence followed a reinvestigation deletion.`, { presence: seen, pulled_at: ordered.map((s) => s.pulledAt) }));
    }
  }
  return out;
}

/** Everything the engine can say about a client's reports today: latest snapshot item rules + chronology. */
export function evaluateReports(snapshots: ReportSnapshot[]): IntegrityFinding[] {
  if (snapshots.length === 0) return [];
  const latest = [...snapshots].sort((a, b) => a.pulledAt.localeCompare(b.pulledAt))[snapshots.length - 1];
  return [...latest.items.flatMap(evaluateItem), ...evaluateChronology(snapshots)].map((f) => ({ ...f, reportId: latest.reportId }));
}

/**
 * The rules this engine actually runs — blocked ones excluded on purpose.
 *
 * This string travels onto compliance output as the statement of what was
 * applied, so it must not advertise a rule the engine never reaches.
 */
export const RULES_IN_USE = INTEGRITY_RULES.filter((r) => !r.blockedBy).map((r) => `${r.id}@v${r.version}`);

/** Catalogued, authorities and all, and not yet evaluable. With the reason. */
export const RULES_NOT_YET_EVALUABLE = INTEGRITY_RULES.filter((r) => r.blockedBy).map((r) => ({
  id: r.id,
  title: r.title,
  blockedBy: r.blockedBy!,
}));

/**
 * How one account's reported data changed across immutable snapshots.
 *
 * FACTS ONLY. This module says "Experian's balance went from $3,031 to $2,800
 * between these two reports". It never says corrected, inaccurate, re-aged or
 * violated — those are other engines' conclusions, reached with evidence and a
 * person, and a chronology that reached them for free would be the most
 * dangerous thing in CreditOps.
 *
 * ── THE THREE REFUSALS ─────────────────────────────────────────────────────
 *
 * 1. NEVER INVENT A DATE. A field the source does not expose stays
 *    unavailable, and is never inferred from a neighbouring date. SmartCredit
 *    exposes no DOFD; that does not become Date Reported, Last Activity or
 *    Last Payment wearing a different label.
 *
 * 2. A PARTIAL SNAPSHOT PROVES NO DISAPPEARANCE. An account absent from an
 *    import that read 24 of 30 accounts is an account we did not read. It is
 *    not deleted, not removed, and not stopped. `NO_LONGER_OBSERVED` requires
 *    comparable coverage on both sides; otherwise the answer is
 *    `COMPARISON_UNAVAILABLE`, with the reason.
 *
 * 3. AN AMBIGUOUS MATCH IS NOT A MERGE. Two timelines are joined only where
 *    identity is clear. A creditor that renamed itself, or a re-issued card
 *    with a new suffix, produces `MATCH_REVIEW_REQUIRED` — never a
 *    disappearance followed by a birth.
 *
 * Statutory timers are deliberately absent. Dispute receipt, CRA notice and
 * investigation deadlines are G-11's, and mixing them in here is how a report
 * comparison starts implying a legal clock.
 */
import type { Bureau, BureauValues } from "@/lib/credit-classification";
import type { ImportQuality } from "./completeness";

/** One stored import, as chronology reads it. */
export interface ChronologySnapshot {
  reportId: string;
  /** The date the report was pulled. The only date that orders a timeline. */
  pulledAt: string;
  /** Which bureaus this import covers at all. */
  bureaus: Bureau[];
  /** From the database. Null means UNKNOWN — never complete. */
  quality: ImportQuality | null;
  /** account_ref → what each bureau said about it in this snapshot. */
  observations: Record<string, BureauValues[]>;
  /** account_ref → the item, for naming and matching. */
  items: Record<string, { name: string; accountType?: string; openDate?: string }>;
}

export type ChronologyEventKind =
  | "FIRST_OBSERVED"
  | "FIELD_CHANGED"
  | "HISTORY_MARK_CHANGED"
  | "NO_LONGER_OBSERVED"
  | "OBSERVED_AGAIN"
  | "POTENTIAL_REAPPEARANCE_EVENT"
  | "COMPARISON_UNAVAILABLE"
  | "MATCH_REVIEW_REQUIRED";

export type UnavailableReason =
  | "COVERAGE_INCOMPLETE"
  | "BUREAU_NOT_COVERED"
  | "RECONCILIATION_INSUFFICIENT"
  | "MATCH_AMBIGUOUS";

export interface ChronologyEvent {
  kind: ChronologyEventKind;
  /** The snapshot this event is dated to. */
  pulledAt: string;
  reportId: string;
  /** Absent for an account-level event that is not about one bureau. */
  bureau?: Bureau;
  /** The canonical field, for FIELD_CHANGED. */
  field?: string;
  /** Human label for the field, for the timeline sentence. */
  fieldLabel?: string;
  previous?: string;
  next?: string;
  /** For a history mark: which month it describes. */
  month?: string;
  /** Why a comparison could not be made. */
  reason?: UnavailableReason;
  /** One factual sentence. Never a conclusion. */
  detail: string;
  /** The snapshot compared against, where there is one. */
  comparedToReportId?: string;
}

export interface AccountChronology {
  accountRef: string;
  name: string;
  events: ChronologyEvent[];
  /** True where any snapshot could not be compared. Shown, never hidden. */
  hasGaps: boolean;
  /** True where identity across snapshots is unresolved. Timelines unmerged. */
  matchReviewRequired: boolean;
}

/* ── The fields a chronology tracks ──────────────────────────────────────
 *
 * Every comparable per-bureau field, because a change in any of them is a
 * fact worth having. `dofd` is here and is compared like the rest — but a
 * source that never exposes it produces no events for it, which is the correct
 * silence rather than an inferred value.
 */
const TRACKED: { key: keyof BureauValues; label: string; money?: boolean }[] = [
  { key: "status", label: "status" },
  { key: "paymentStatus", label: "payment status" },
  { key: "balance", label: "balance", money: true },
  { key: "pastDue", label: "past due", money: true },
  { key: "creditLimit", label: "credit limit", money: true },
  { key: "highBalance", label: "high balance", money: true },
  { key: "monthlyPayment", label: "monthly payment", money: true },
  { key: "termMonths", label: "terms" },
  { key: "openDate", label: "date opened" },
  { key: "dateClosed", label: "date closed" },
  { key: "dateLastPayment", label: "last payment" },
  { key: "dateLastActive", label: "last activity" },
  { key: "accountInformationDate", label: "last reported" },
  { key: "lastVerified", label: "last verified" },
  { key: "dofd", label: "date of first delinquency" },
  { key: "disputeStatus", label: "dispute status" },
  { key: "responsibilityRaw", label: "responsibility" },
  { key: "accountType", label: "account type" },
  { key: "accountRating", label: "account rating" },
  { key: "creditorType", label: "creditor type" },
  { key: "paymentFrequency", label: "payment frequency" },
  { key: "accountNumberMasked", label: "account number" },
];

const BUREAU_NAME: Record<Bureau, string> = { EQ: "Equifax", EX: "Experian", TU: "TransUnion" };

const money = (n: number) => `$${n.toLocaleString("en-US", { maximumFractionDigits: 0 })}`;

/**
 * A field's value as a string, or undefined for absent.
 *
 * ABSENT IS NEVER ZERO. A balance nobody reported is not a balance of nothing,
 * and rendering it as "$0" would manufacture both a value and a change.
 */
function readField(v: BureauValues, key: keyof BureauValues, isMoney?: boolean): string | undefined {
  const raw = v[key];
  if (raw === undefined || raw === null || raw === "") return undefined;
  if (typeof raw === "number") return isMoney ? money(raw) : String(raw);
  if (Array.isArray(raw)) return undefined;
  return String(raw).trim() || undefined;
}

/** "2026-02:30" → ["2026-02", "30"]. Dates travel with the mark (CR-2). */
function historyMap(v: BureauValues): Map<string, string> {
  const out = new Map<string, string>();
  for (const entry of v.paymentHistory ?? []) {
    const m = /^(\d{4}-\d{2}):(.*)$/.exec(String(entry ?? ""));
    /* An undated entry is skipped rather than positioned. Reconstructing a
       month from an array index is exactly what CR-2 stopped doing. */
    if (m) out.set(m[1], m[2]);
  }
  return out;
}

/**
 * Can the LATER snapshot support a statement that something is no longer
 * observed?
 *
 * Three conditions, and all of them must hold. Any one failing produces
 * `COMPARISON_UNAVAILABLE` with the reason, because "we cannot tell" and "it
 * is gone" are the two answers that must never be confused.
 */
export function comparableFor(
  later: ChronologySnapshot,
  bureau: Bureau,
): { ok: true } | { ok: false; reason: UnavailableReason } {
  /* A snapshot that did not read everything cannot prove an absence: the
     account may be one of the ones it failed to read. */
  if (later.quality !== "complete") return { ok: false, reason: "COVERAGE_INCOMPLETE" };
  if (!later.bureaus.includes(bureau)) return { ok: false, reason: "BUREAU_NOT_COVERED" };
  return { ok: true };
}

const normaliseName = (name: string) => name.trim().toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();

/**
 * Whether a later snapshot holds a DIFFERENT account that might be the same
 * one under another handle.
 *
 * A creditor that renames itself, or a card re-issued with a new suffix,
 * changes the account_ref — so the same obligation looks like one account
 * dying and another being born. That is the wrong story and it is the one a
 * naive diff tells, so a near-match blocks the disappearance and asks a person.
 */
function nearMatchIn(snapshot: ChronologySnapshot, name: string, ownRef: string): string | null {
  const target = normaliseName(name);
  const words = new Set(target.split(" ").filter((w) => w.length > 2));
  for (const [ref, item] of Object.entries(snapshot.items)) {
    if (ref === ownRef) continue;
    const other = normaliseName(item.name);
    if (other === target) return ref;
    const shared = [...words].filter((w) => other.split(" ").includes(w));
    /* Two shared significant words is a candidate, not a match. It is enough
       to withhold a disappearance and ask, which is all it is used for. */
    if (words.size > 0 && shared.length >= Math.min(2, words.size)) return ref;
  }
  return null;
}

/**
 * One account's chronology, oldest snapshot first.
 *
 * Pure and non-mutating: the snapshots handed in are immutable records, and a
 * timeline that edited them would be rewriting history to describe it.
 */
export function buildAccountChronology(
  snapshots: ChronologySnapshot[],
  accountRef: string,
): AccountChronology {
  const ordered = [...snapshots].sort((a, b) => a.pulledAt.localeCompare(b.pulledAt));
  const events: ChronologyEvent[] = [];
  let matchReviewRequired = false;
  let hasGaps = false;

  const name =
    ordered.find((s) => s.items[accountRef])?.items[accountRef]?.name ?? accountRef;

  /* Ambiguity inside a single snapshot: two items sharing one handle. Nothing
     is merged and nothing is compared until a person resolves it. */
  for (const snapshot of ordered) {
    const sameRef = Object.keys(snapshot.items).filter((r) => r === accountRef).length;
    const values = snapshot.observations[accountRef];
    if (sameRef > 0 && values && values.length !== new Set(values.map((v) => v.bureau)).size) {
      matchReviewRequired = true;
      events.push({
        kind: "MATCH_REVIEW_REQUIRED",
        pulledAt: snapshot.pulledAt,
        reportId: snapshot.reportId,
        reason: "MATCH_AMBIGUOUS",
        detail: "More than one observation for the same bureau in this snapshot. The timelines are not merged.",
      });
    }
  }

  /** Which bureaus observed this account in a given snapshot. */
  const observedIn = (s: ChronologySnapshot): Bureau[] =>
    (s.observations[accountRef] ?? []).map((v) => v.bureau);

  /* Track, per bureau, whether we have seen it and whether we have stated an
     absence — so a return is `OBSERVED_AGAIN` and a return after a *proven*
     absence is a potential reappearance. */
  const seen = new Set<Bureau>();
  const provenAbsent = new Set<Bureau>();

  ordered.forEach((snapshot, index) => {
    const previous = index > 0 ? ordered[index - 1] : null;
    const nowValues = snapshot.observations[accountRef] ?? [];
    const nowBureaus = observedIn(snapshot);

    for (const value of nowValues) {
      const bureau = value.bureau;
      const before = previous?.observations[accountRef]?.find((v) => v.bureau === bureau);

      if (!seen.has(bureau)) {
        seen.add(bureau);
        events.push({
          kind: provenAbsent.has(bureau) ? "POTENTIAL_REAPPEARANCE_EVENT" : "FIRST_OBSERVED",
          pulledAt: snapshot.pulledAt,
          reportId: snapshot.reportId,
          bureau,
          detail: provenAbsent.has(bureau)
            ? `Observed again on ${BUREAU_NAME[bureau]} after not being observed on a comparable report. What this means is a question, not a finding.`
            : `First observed on ${BUREAU_NAME[bureau]}.`,
        });
        provenAbsent.delete(bureau);
        continue;
      }

      if (provenAbsent.has(bureau)) {
        provenAbsent.delete(bureau);
        events.push({
          kind: "POTENTIAL_REAPPEARANCE_EVENT",
          pulledAt: snapshot.pulledAt,
          reportId: snapshot.reportId,
          bureau,
          comparedToReportId: previous?.reportId,
          detail: `Observed again on ${BUREAU_NAME[bureau]} after not being observed on a comparable report. What this means is a question, not a finding.`,
        });
      }

      if (!before) continue;

      /* Field changes. A field absent on either side produces NO event: we
         cannot say a value changed when one of the two values was never
         reported. */
      for (const { key, label, money: isMoney } of TRACKED) {
        const was = readField(before, key, isMoney);
        const is = readField(value, key, isMoney);
        if (was === undefined || is === undefined) continue;
        if (was === is) continue;
        events.push({
          kind: "FIELD_CHANGED",
          pulledAt: snapshot.pulledAt,
          reportId: snapshot.reportId,
          comparedToReportId: previous?.reportId,
          bureau,
          field: String(key),
          fieldLabel: label,
          previous: was,
          next: is,
          detail: `${BUREAU_NAME[bureau]} ${label} changed ${was} → ${is}.`,
        });
      }

      /* Payment-history marks, compared BY MONTH. A month present on one side
         only is a new or dropped observation, not a change. */
      const wasHistory = historyMap(before);
      const isHistory = historyMap(value);
      for (const [month, mark] of isHistory) {
        const priorMark = wasHistory.get(month);
        if (priorMark === undefined || priorMark === mark) continue;
        events.push({
          kind: "HISTORY_MARK_CHANGED",
          pulledAt: snapshot.pulledAt,
          reportId: snapshot.reportId,
          comparedToReportId: previous?.reportId,
          bureau,
          field: "payment_history",
          fieldLabel: "payment history",
          month,
          previous: priorMark,
          next: mark,
          detail: `${BUREAU_NAME[bureau]} payment history for ${month} changed ${priorMark} → ${mark}.`,
        });
      }
    }

    /* Absences. Only meaningful against a previous snapshot. */
    if (!previous) return;
    for (const bureau of observedIn(previous)) {
      if (nowBureaus.includes(bureau)) continue;

      const comparable = comparableFor(snapshot, bureau);
      if (comparable.ok !== true) {
        const reason = comparable.reason;
        hasGaps = true;
        events.push({
          kind: "COMPARISON_UNAVAILABLE",
          pulledAt: snapshot.pulledAt,
          reportId: snapshot.reportId,
          comparedToReportId: previous.reportId,
          bureau,
          reason,
          detail:
            reason === "BUREAU_NOT_COVERED"
              ? `This report does not cover ${BUREAU_NAME[bureau]}, so nothing can be said about whether the account is still reported there.`
              : `This report did not read completely, so an account missing from it is an account not read — not an account removed.`,
        });
        continue;
      }

      /* A near-match blocks the disappearance: a renamed creditor or a
         re-issued number is the same obligation under a new handle, and
         calling it a removal is the wrong story. */
      const near = nearMatchIn(snapshot, name, accountRef);
      if (near) {
        matchReviewRequired = true;
        hasGaps = true;
        events.push({
          kind: "MATCH_REVIEW_REQUIRED",
          pulledAt: snapshot.pulledAt,
          reportId: snapshot.reportId,
          comparedToReportId: previous.reportId,
          bureau,
          reason: "MATCH_AMBIGUOUS",
          detail: `Not found under this handle, but "${snapshot.items[near]?.name}" on the same report may be the same account. The timelines are not merged.`,
        });
        continue;
      }

      provenAbsent.add(bureau);
      events.push({
        kind: "NO_LONGER_OBSERVED",
        pulledAt: snapshot.pulledAt,
        reportId: snapshot.reportId,
        comparedToReportId: previous.reportId,
        bureau,
        detail: `Not observed on ${BUREAU_NAME[bureau]} on this report, which read completely and covers ${BUREAU_NAME[bureau]}.`,
      });
    }
  });

  return { accountRef, name, events, hasGaps, matchReviewRequired };
}

/** Every account any snapshot observed, oldest name first. */
export function accountRefsIn(snapshots: ChronologySnapshot[]): string[] {
  const refs = new Set<string>();
  for (const s of [...snapshots].sort((a, b) => a.pulledAt.localeCompare(b.pulledAt))) {
    for (const ref of Object.keys(s.items)) refs.add(ref);
  }
  return [...refs];
}

/** Events grouped by snapshot date, newest first — the readable timeline. */
export function groupByPeriod(events: ChronologyEvent[]): { pulledAt: string; events: ChronologyEvent[] }[] {
  const byDate = new Map<string, ChronologyEvent[]>();
  for (const e of events) byDate.set(e.pulledAt, [...(byDate.get(e.pulledAt) ?? []), e]);
  return [...byDate.entries()]
    .sort((a, b) => b[0].localeCompare(a[0]))
    .map(([pulledAt, list]) => ({ pulledAt, events: list }));
}

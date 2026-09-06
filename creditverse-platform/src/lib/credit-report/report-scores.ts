/**
 * The scores a person types (or a parser found) on an import, exactly as the
 * report states them. Shared by the CSV and PDF imports so the validation rule
 * lives once.
 */
import type { Bureau } from "@/lib/credit-classification";

export const REPORT_BUREAUS: readonly Bureau[] = ["EQ", "EX", "TU"];

export type ScoreInputs = Record<Bureau, string>;

export interface ScoreRow {
  bureau: Bureau;
  model: string;
  score: number;
}

export const EMPTY_SCORE_INPUTS: ScoreInputs = { EQ: "", EX: "", TU: "" };

/** A score must be a whole number between 250 and 900 — the range every model uses. */
export function isValidScore(text: string): boolean {
  const n = Number(text.trim());
  return Number.isInteger(n) && n >= 250 && n <= 900;
}

export function buildScoreRows(inputs: ScoreInputs, model: string): ScoreRow[] {
  return REPORT_BUREAUS.flatMap((b) => {
    const v = inputs[b].trim();
    if (!v || !isValidScore(v)) return [];
    return [{ bureau: b, model: model.trim() || "as stated on report", score: Number(v) }];
  });
}

/** True when a bureau has text that is not a usable score. */
export function hasInvalidScore(inputs: ScoreInputs): boolean {
  return REPORT_BUREAUS.some((b) => inputs[b].trim() !== "" && !isValidScore(inputs[b]));
}

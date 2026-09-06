/**
 * How a credit report gets read, cheapest first.
 *
 * Dee: "Add the free/local OCR layer before paid AI OCR… Do not silently trust
 * bad OCR. Low-confidence extraction must require review."
 *
 * Three rungs, and the first two cost nothing:
 *
 *   1. TEXT LAYER      A PDF downloaded from a bureau or a monitoring service
 *                      carries real text. Read it in the browser. Free, exact,
 *                      and the file never leaves the machine.
 *
 *   2. LOCAL OCR       A scan or a photograph has no text layer. Tesseract runs
 *                      in the browser. Free, and good enough surprisingly
 *                      often — a clean scan of a printed report reads well.
 *
 *   3. THE MODEL       Only when local extraction is not good enough. Metered,
 *                      and the only rung that costs anything.
 *
 * Most reports never reach rung three, which is the point. AI is the fallback
 * for a photograph taken at an angle in bad light, not the default path.
 *
 * ── Bad OCR is worse than no OCR ───────────────────────────────────────────
 *
 * A parser that turns "$1,847" into "$847" and reports it confidently is more
 * dangerous than one that gives up, because a wrong balance becomes a dispute
 * letter asserting a wrong fact. So every rung is scored before its output is
 * accepted, and anything short of good goes to a person. `needsReview` is not
 * a suggestion — the import screen refuses to auto-apply without it.
 */

export type ExtractionRung = "text_layer" | "local_ocr" | "assisted";

export interface QualityScore {
  /** 0 to 1. Below ACCEPT_THRESHOLD the rung is not trusted on its own. */
  score: number;
  /** Why it scored what it did, so a reviewer is not guessing. */
  reasons: string[];
}

/**
 * What a real credit report always contains. Absence is the strongest signal
 * that extraction failed, because these survive almost any legible scan.
 */
const EXPECTED_MARKERS: { pattern: RegExp; label: string; weight: number }[] = [
  { pattern: /\b(equifax|experian|transunion)\b/i, label: "a bureau name", weight: 0.2 },
  { pattern: /\b(account|acct)\b/i, label: "the word account", weight: 0.15 },
  { pattern: /\b(balance|bal)\b/i, label: "a balance label", weight: 0.15 },
  { pattern: /\$\s?[\d,]+/, label: "a dollar amount", weight: 0.2 },
  { pattern: /\b(19|20)\d{2}\b/, label: "a four-digit year", weight: 0.15 },
  { pattern: /\b(open|closed|paid|collection|charge[- ]?off|current)\b/i, label: "a status word", weight: 0.15 },
];

/** Output below this is never applied without a person looking at it. */
export const ACCEPT_THRESHOLD = 0.7;
/** Below this, local OCR is considered to have failed and the model is offered. */
export const ESCALATE_THRESHOLD = 0.45;

/**
 * Is this text a credit report, or is it noise that happens to be characters?
 *
 * Deliberately about SHAPE, not length. A page of gibberish is long; a page of
 * gibberish contains no dollar amounts, no years and no status words.
 */
export function scoreExtraction(text: string): QualityScore {
  const reasons: string[] = [];
  const trimmed = (text ?? "").trim();

  if (trimmed.length < 200) {
    return { score: 0, reasons: ["Almost nothing was extracted."] };
  }

  let score = 0;
  const missing: string[] = [];
  for (const m of EXPECTED_MARKERS) {
    if (m.pattern.test(trimmed)) score += m.weight;
    else missing.push(m.label);
  }
  if (missing.length > 0) reasons.push(`Could not find ${missing.join(", ")}.`);

  /*
   * The classic OCR failure is a page of plausible-looking characters with no
   * real words in it. A high ratio of non-alphanumeric characters, or very few
   * runs of ordinary letters, means the recognition did not land.
   */
  const alnum = (trimmed.match(/[a-z0-9]/gi) ?? []).length;
  const ratio = alnum / trimmed.length;
  if (ratio < 0.5) {
    score -= 0.3;
    reasons.push("Much of the page came back as symbols rather than words.");
  }
  const words = trimmed.match(/\b[a-z]{4,}\b/gi) ?? [];
  if (words.length < 20) {
    score -= 0.2;
    reasons.push("Very few recognisable words.");
  }

  const final = Math.max(0, Math.min(1, score));
  if (final >= ACCEPT_THRESHOLD && reasons.length === 0) reasons.push("Reads like a credit report.");
  return { score: Number(final.toFixed(2)), reasons };
}

export interface LadderResult {
  rung: ExtractionRung;
  text: string;
  quality: QualityScore;
  /** True unless the extraction scored well enough to stand on its own. */
  needsReview: boolean;
  /** Nothing local worked; the model is worth offering. */
  shouldOfferAssisted: boolean;
  /** What the person is told, in one line. */
  summary: string;
}

export function assess(rung: ExtractionRung, text: string): LadderResult {
  const quality = scoreExtraction(text);
  const good = quality.score >= ACCEPT_THRESHOLD;
  const poor = quality.score < ESCALATE_THRESHOLD;

  const summary =
    rung === "text_layer"
      ? good
        ? "Read straight from the file. Nothing left your computer and nothing was charged."
        : "This PDF has a text layer, but it does not read like a credit report."
      : rung === "local_ocr"
        ? good
          ? "Read on your own computer. Nothing was charged."
          : poor
            ? "The scan could not be read clearly enough here."
            : "Partly readable. Check the figures before applying them."
        : good
          ? "Read with assistance. Check the figures before applying them."
          : "Even assisted reading could not make this out clearly.";

  return {
    rung,
    text,
    quality,
    /* Assisted extraction ALWAYS goes to review, however well it scored. A
       model reading a photograph is data entry by inference, and inference
       gets a human before it becomes a client's balance. */
    needsReview: !good || rung === "assisted",
    shouldOfferAssisted: rung !== "assisted" && poor,
    summary,
  };
}

/**
 * The order to try, given what the file is. Returned rather than executed so
 * the caller stays in charge of when a paid rung is reached — and so the
 * decision is testable without a PDF or a network.
 */
export function ladderFor(hasTextLayer: boolean): ExtractionRung[] {
  return hasTextLayer ? ["text_layer", "local_ocr", "assisted"] : ["local_ocr", "assisted"];
}

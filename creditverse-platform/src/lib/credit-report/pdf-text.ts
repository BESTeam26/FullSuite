/**
 * Text-layer extraction from a PDF, in the browser.
 *
 * Reports saved from a monitoring service carry a text layer; this reads it
 * with pdf.js and rebuilds the visual lines (words on the same baseline become
 * one line) so the deterministic parser sees the layout a person sees. A PDF
 * without a text layer — a scan or a photo — is reported as such; nothing is
 * guessed and no OCR happens here.
 *
 * pdf.js is loaded on demand: it is a large library and only this import
 * needs it (rule 7).
 */

export interface PositionedText {
  str: string;
  /** Left edge and baseline in PDF units. */
  x: number;
  y: number;
  width: number;
}

export interface PdfTextResult {
  lines: string[];
  pageCount: number;
  /** False when no page produced any text: the file is an image-only PDF. */
  hasTextLayer: boolean;
}

/** Baselines closer than this (PDF units) belong to the same visual line. */
const LINE_TOLERANCE = 2.5;
/** A horizontal gap wider than this becomes a column separator (two spaces). */
const COLUMN_GAP = 12;

/**
 * Rebuild visual lines from positioned fragments. Pure, so the layout rules
 * are unit-tested without a PDF.
 */
export function groupIntoLines(items: PositionedText[]): string[] {
  const rows: { y: number; parts: PositionedText[] }[] = [];
  for (const item of items) {
    if (!item.str.trim()) continue;
    const row = rows.find((r) => Math.abs(r.y - item.y) <= LINE_TOLERANCE);
    if (row) row.parts.push(item);
    else rows.push({ y: item.y, parts: [item] });
  }
  rows.sort((a, b) => b.y - a.y); // PDF y grows upward; top of the page first
  return rows.map((row) => {
    row.parts.sort((a, b) => a.x - b.x);
    let text = "";
    let cursor: number | null = null;
    for (const part of row.parts) {
      if (cursor !== null) {
        const gap = part.x - cursor;
        text += gap > COLUMN_GAP ? "  " : gap > 0.5 ? " " : "";
      }
      text += part.str;
      cursor = part.x + part.width;
    }
    return text.replace(/\s+$/g, "");
  });
}

export async function extractPdfLines(file: File): Promise<PdfTextResult> {
  const [pdfjs, workerUrl] = await Promise.all([
    import("pdfjs-dist"),
    import("pdfjs-dist/build/pdf.worker.min.mjs?url").then((m) => m.default),
  ]);
  pdfjs.GlobalWorkerOptions.workerSrc = workerUrl;
  const task = pdfjs.getDocument({ data: await file.arrayBuffer() });
  const doc = await task.promise;
  const lines: string[] = [];
  let anyText = false;
  try {
    for (let pageNumber = 1; pageNumber <= doc.numPages; pageNumber++) {
      const page = await doc.getPage(pageNumber);
      const content = await page.getTextContent();
      const positioned: PositionedText[] = [];
      for (const item of content.items) {
        if (!("str" in item)) continue;
        positioned.push({ str: item.str, x: item.transform[4], y: item.transform[5], width: item.width });
      }
      const pageLines = groupIntoLines(positioned);
      if (pageLines.length) anyText = true;
      lines.push(...pageLines, "");
      page.cleanup();
    }
  } finally {
    await task.destroy();
  }
  return { lines, pageCount: doc.numPages, hasTextLayer: anyText };
}

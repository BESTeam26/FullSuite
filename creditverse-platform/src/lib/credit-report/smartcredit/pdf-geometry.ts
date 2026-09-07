/**
 * A PDF page as coordinates, not as a blob of text.
 *
 * `pdf-text.ts` already flattens a PDF into visual lines, and that is the
 * right tool for a report whose layout is a single column of prose. It is the
 * wrong tool here. A SmartCredit export is a three-column grid: a label at
 * x=47, then TransUnion, Experian and Equifax at fixed left edges. Flatten it
 * and the columns become one string, and the only way back is to count spaces
 * — which silently reassigns a value to the wrong bureau the moment a figure
 * is wide enough to close the gap.
 *
 * So this module hands the parser what the page actually says: every text
 * fragment with its page, x, y and width, and every filled rectangle. The
 * parser groups them into rows and columns itself, using the bureau headers
 * the document prints. Extraction is separated from parsing so the grid logic
 * is unit-tested against fixtures with no PDF and no pdf.js anywhere near it.
 */

export interface PdfFragment {
  /** 1-based page number. Accounts span pages, so this is never dropped. */
  page: number;
  /** Left edge, PDF units, origin at the page's left. */
  x: number;
  /** Distance from the TOP of the page. Converted here so the parser can
   *  sort ascending and read the page in the order a person does. */
  y: number;
  width: number;
  height: number;
  text: string;
}

/** A filled rectangle: the payment-history cells, among other things. */
export interface PdfRect {
  page: number;
  x: number;
  y: number;
  width: number;
  height: number;
  /** Fill colour as the page declares it, e.g. "#16a35c". */
  fill: string;
}

export interface PdfGeometry {
  pageCount: number;
  fragments: PdfFragment[];
  rects: PdfRect[];
  /** False when no page produced text: a scan, and not this adapter's job. */
  hasTextLayer: boolean;
}

/** Baselines within this many units are one row. */
export const ROW_TOLERANCE = 3;
/** A value is in a column when its left edge is within this of the column's. */
export const COLUMN_TOLERANCE = 6;

/**
 * Read a PDF's geometry with pdf.js. Loaded on demand — it is a large library
 * and only an import needs it (rule 7).
 */
export async function extractPdfGeometry(file: File): Promise<PdfGeometry> {
  const [pdfjs, workerUrl] = await Promise.all([
    import("pdfjs-dist"),
    import("pdfjs-dist/build/pdf.worker.min.mjs?url").then((m) => m.default),
  ]);
  pdfjs.GlobalWorkerOptions.workerSrc = workerUrl;
  const task = pdfjs.getDocument({ data: await file.arrayBuffer() });
  const doc = await task.promise;
  const fragments: PdfFragment[] = [];
  const rects: PdfRect[] = [];
  try {
    for (let page = 1; page <= doc.numPages; page++) {
      const pg = await doc.getPage(page);
      const viewport = pg.getViewport({ scale: 1 });
      const content = await pg.getTextContent();
      for (const item of content.items) {
        if (!("str" in item) || !item.str.trim()) continue;
        fragments.push({
          page,
          x: round(item.transform[4]),
          /* pdf.js y grows upward from the page's bottom; flip it so the
             parser reads top-down like the reader does. */
          y: round(viewport.height - item.transform[5]),
          width: round(item.width),
          height: round(item.height),
          text: item.str,
        });
      }
      rects.push(...(await filledRects(pdfjs, pg, viewport.height, page)));
      pg.cleanup();
    }
  } finally {
    await task.destroy();
  }
  return {
    pageCount: doc.numPages,
    fragments,
    rects,
    hasTextLayer: fragments.length > 0,
  };
}

const round = (n: number) => Math.round(n * 10) / 10;

/**
 * The filled rectangles on a page, from its drawing operators.
 *
 * Collected so a reviewer can be shown WHICH cell could not be read and what
 * colour it was. The colour is deliberately not translated into a payment
 * status: see `PDF_EXPORT_OMITS` in `source-fields` for why a plausible
 * colour-to-severity guess is the one thing this adapter will not do.
 */
async function filledRects(
  pdfjs: typeof import("pdfjs-dist"),
  page: Awaited<ReturnType<import("pdfjs-dist").PDFDocumentProxy["getPage"]>>,
  pageHeight: number,
  pageNumber: number,
): Promise<PdfRect[]> {
  const ops = await page.getOperatorList();
  const out: PdfRect[] = [];
  let fill = "#000000";
  let pending: { x: number; y: number; w: number; h: number } | null = null;
  for (let i = 0; i < ops.fnArray.length; i++) {
    const fn = ops.fnArray[i];
    const args = ops.argsArray[i] as unknown[];
    if (fn === pdfjs.OPS.setFillRGBColor) {
      fill = String(args[0] ?? fill);
    } else if (fn === pdfjs.OPS.constructPath) {
      pending = rectangleFrom(args);
    } else if (
      (fn === pdfjs.OPS.fill || fn === pdfjs.OPS.eoFill || fn === pdfjs.OPS.closePath) &&
      pending
    ) {
      out.push({
        page: pageNumber,
        x: round(pending.x),
        y: round(pageHeight - pending.y - pending.h),
        width: round(pending.w),
        height: round(pending.h),
        fill,
      });
      pending = null;
    }
  }
  return out;
}

/**
 * A path's bounding box, when the path is a plain rectangle.
 *
 * pdf.js hands `constructPath` an ops array and a flat coordinate array whose
 * layout differs between builds, so the box is taken from the coordinates
 * themselves rather than from an assumed operator sequence. A path that is not
 * an axis-aligned box yields nothing, which is correct: this exists to find
 * cells, not to reimplement a renderer.
 */
function rectangleFrom(args: unknown[]): { x: number; y: number; w: number; h: number } | null {
  const coords = args.find((a): a is number[] | Float32Array =>
    Array.isArray(a) ? a.every((n) => typeof n === "number") : a instanceof Float32Array,
  );
  if (!coords) return null;
  const nums = Array.from(coords as ArrayLike<number>);
  if (nums.length < 4) return null;
  const xs: number[] = [];
  const ys: number[] = [];
  for (let i = 0; i + 1 < nums.length; i += 2) {
    xs.push(nums[i]);
    ys.push(nums[i + 1]);
  }
  const x = Math.min(...xs), y = Math.min(...ys);
  const w = Math.max(...xs) - x, h = Math.max(...ys) - y;
  if (!(w > 0 && h > 0) || !Number.isFinite(w) || !Number.isFinite(h)) return null;
  return { x, y, w, h };
}

/* ── Grid primitives, pure and shared by the parser ─────────────────────── */

/**
 * Fragments grouped into visual rows, ordered as the page reads: page first,
 * then down the page. A label and its values sit a point apart in the real
 * export, so the tolerance matters.
 */
export function toRows(fragments: PdfFragment[]): PdfFragment[][] {
  const rows: { page: number; y: number; parts: PdfFragment[] }[] = [];
  for (const f of fragments) {
    const row = rows.find((r) => r.page === f.page && Math.abs(r.y - f.y) <= ROW_TOLERANCE);
    if (row) row.parts.push(f);
    else rows.push({ page: f.page, y: f.y, parts: [f] });
  }
  rows.sort((a, b) => a.page - b.page || a.y - b.y);
  return rows.map((r) => [...r.parts].sort((a, b) => a.x - b.x));
}

/**
 * The fragment belonging to a column, by left edge.
 *
 * Note what this does NOT do: it does not take the second fragment in a row
 * as the second bureau. A row where one bureau printed a dash and another
 * printed nothing at all has fewer fragments than columns, and position-based
 * reading would shift every value one bureau to the left.
 */
export function cellAt(row: PdfFragment[], columnX: number): PdfFragment[] {
  return row.filter((f) => Math.abs(f.x - columnX) <= COLUMN_TOLERANCE);
}

/** Fragments in the horizontal band `[from, to)`, joined in reading order. */
export function textInBand(row: PdfFragment[], from: number, to: number): string {
  return row
    .filter((f) => f.x >= from && f.x < to)
    .map((f) => f.text)
    .join(" ")
    .replace(/\s+/g, " ")
    .trim();
}

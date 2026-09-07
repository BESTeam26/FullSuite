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
 * Collected so a reviewer can be shown WHICH payment-history cell could not be
 * read and what colour it was rendered in. The mark IS rendered — it is a
 * filled rectangle — but it carries no machine-readable status label, and no
 * embedded key says what its colour means. So the colour is recorded as
 * provenance and never translated into a payment status; see
 * `PDF_EXPORT_UNLABELLED` in `source-fields` for why a plausible
 * colour-to-severity inference is the one thing this adapter will not make.
 *
 * Two things make this fiddlier than it looks, and both were found against a
 * real export rather than assumed:
 *
 *   The box is in `constructPath`'s THIRD argument — a min/max bounding box.
 *   The second argument is an interleaved command-and-coordinate array, and
 *   reading that as x/y pairs mixes the command codes in with the geometry
 *   and yields a box that is simply wrong.
 *
 *   The coordinates are pre-transform. A print nests `save`/`transform`, so a
 *   cell's box is stated in its own space and lands somewhere else on the
 *   page. Without tracking the matrix the rect gets attributed to the wrong
 *   month — and provenance pointing at the wrong cell is worse than none,
 *   because it invites exactly the confident misreading the module refuses.
 */
export async function filledRects(
  pdfjs: typeof import("pdfjs-dist"),
  page: Awaited<ReturnType<import("pdfjs-dist").PDFDocumentProxy["getPage"]>>,
  pageHeight: number,
  pageNumber: number,
): Promise<PdfRect[]> {
  const ops = await page.getOperatorList();
  const out: PdfRect[] = [];
  const identity: number[] = [1, 0, 0, 1, 0, 0];
  let ctm = identity;
  const stack: number[][] = [];
  let fill = "#000000";

  for (let i = 0; i < ops.fnArray.length; i++) {
    const fn = ops.fnArray[i];
    const args = ops.argsArray[i] as unknown[];
    if (fn === pdfjs.OPS.save) {
      stack.push(ctm);
    } else if (fn === pdfjs.OPS.restore) {
      ctm = stack.pop() ?? identity;
    } else if (fn === pdfjs.OPS.transform) {
      const m = (args as number[]).slice(0, 6);
      if (m.length === 6 && m.every((n) => Number.isFinite(n))) ctm = compose(m, ctm);
    } else if (fn === pdfjs.OPS.setFillRGBColor) {
      fill = String(args[0] ?? fill);
    } else if (fn === pdfjs.OPS.constructPath) {
      const box = boundingBox(args);
      if (!box) continue;
      /* Both corners through the current matrix; the box is re-derived from
         them, because a rotation or flip can swap which corner is which. */
      const [x0, y0] = apply(box[0], box[1], ctm);
      const [x1, y1] = apply(box[2], box[3], ctm);
      const left = Math.min(x0, x1);
      const width = Math.abs(x1 - x0);
      const height = Math.abs(y1 - y0);
      if (!(width > 0 && height > 0)) continue;
      out.push({
        page: pageNumber,
        x: round(left),
        /* PDF y grows upward; flip so it matches the fragments' top-down y. */
        y: round(pageHeight - Math.max(y0, y1)),
        width: round(width),
        height: round(height),
        fill,
      });
    }
  }
  return out;
}

/** m1 applied before m2, in PDF matrix order. */
function compose(m1: number[], m2: number[]): number[] {
  return [
    m1[0] * m2[0] + m1[1] * m2[2],
    m1[0] * m2[1] + m1[1] * m2[3],
    m1[2] * m2[0] + m1[3] * m2[2],
    m1[2] * m2[1] + m1[3] * m2[3],
    m1[4] * m2[0] + m1[5] * m2[2] + m2[4],
    m1[4] * m2[1] + m1[5] * m2[3] + m2[5],
  ];
}

const apply = (x: number, y: number, m: number[]): [number, number] => [
  m[0] * x + m[2] * y + m[4],
  m[1] * x + m[3] * y + m[5],
];

/**
 * A path's bounding box: `constructPath`'s min/max argument, `[minX, minY,
 * maxX, maxY]`.
 *
 * Taken from the FOUR-element numeric argument specifically. The neighbouring
 * argument is the path's interleaved commands and coordinates, and reading
 * that as a box mixes command codes in with the geometry.
 */
function boundingBox(args: unknown[]): [number, number, number, number] | null {
  for (const arg of args) {
    /* Duck-typed, not `instanceof Float32Array`. pdf.js hands back a typed
       array constructed in its OWN module realm, and `instanceof` against
       this realm's constructor is false there — so the box was silently
       skipped on every path and no rectangle was ever recorded. Checking the
       shape works whichever realm built it. */
    if (typeof arg !== "object" || arg === null) continue;
    const candidate = arg as ArrayLike<unknown>;
    if (typeof candidate.length !== "number" || candidate.length !== 4) continue;
    const nums = [candidate[0], candidate[1], candidate[2], candidate[3]];
    if (!nums.every((n): n is number => typeof n === "number" && Number.isFinite(n))) continue;
    return [nums[0], nums[1], nums[2], nums[3]];
  }
  return null;
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

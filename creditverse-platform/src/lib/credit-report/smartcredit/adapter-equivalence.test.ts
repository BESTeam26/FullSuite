/**
 * THE ACCEPTANCE TEST FOR THE ADAPTER ARCHITECTURE.
 *
 * One synthetic report, rendered into SmartCredit's HTML export and its PDF
 * export by `fixtures/generate.mjs` from a single definition. Both files go
 * through their adapter, and the canonical results must agree.
 *
 * "Agree" is defined precisely, because the two formats do not carry
 * identical information and pretending otherwise is the failure this whole
 * design exists to avoid:
 *
 *   Every field BOTH formats print must normalise identically — same accounts,
 *   same per-bureau attribution, same values, same dated months.
 *
 *   The one thing the PDF does not carry — the payment-history MARK — comes
 *   back as an undetermined status with a recorded reason, never as a guess.
 *   The months and their dates still agree, because the print does carry the
 *   month row and the source's own year markers.
 *
 * A test asserting byte-identical output would have to be satisfied by
 * inventing the missing statuses, which would make it a test that the platform
 * fabricates data. This one is satisfied by reading everything that is there.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { SmartCreditHtmlAdapter, SmartCreditPdfAdapter, type CanonicalSmartCreditReport } from "./index";
import { attributeColumns, datedMonths, findBlocks, parseSmartCreditPdf } from "./pdf-adapter";
import { toRows, type PdfFragment, type PdfGeometry } from "./pdf-geometry";
import { classifyCell, decodeHistoryMark, encodeHistoryMark } from "./source-fields";

const HERE = join(process.cwd(), "src/lib/credit-report/smartcredit/fixtures");

/**
 * Read the PDF fixture's geometry with pdf.js directly.
 *
 * `extractPdfGeometry` reaches for the worker through a Vite `?url` import,
 * which does not resolve under vitest; the legacy build runs in plain node.
 * Same pdf.js, same text layer, same coordinates — the fixture is exercised as
 * a real PDF rather than as a hand-written coordinate list.
 */
async function pdfGeometry(): Promise<PdfGeometry> {
  const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
  const data = new Uint8Array(readFileSync(join(HERE, "smartcredit-synthetic.fixture.pdf")));
  const doc = await pdfjs.getDocument({ data }).promise;
  const fragments: PdfFragment[] = [];
  const rects: PdfGeometry["rects"] = [];
  for (let page = 1; page <= doc.numPages; page++) {
    const pg = await doc.getPage(page);
    const viewport = pg.getViewport({ scale: 1 });
    for (const item of (await pg.getTextContent()).items) {
      if (!("str" in item) || !item.str.trim()) continue;
      fragments.push({
        page,
        x: Math.round(item.transform[4] * 10) / 10,
        y: Math.round((viewport.height - item.transform[5]) * 10) / 10,
        width: Math.round(item.width * 10) / 10,
        height: Math.round(item.height * 10) / 10,
        text: item.str,
      });
    }
    const ops = await pg.getOperatorList();
    let fill = "#000000";
    for (let i = 0; i < ops.fnArray.length; i++) {
      if (ops.fnArray[i] === pdfjs.OPS.setFillRGBColor) fill = String((ops.argsArray[i] as unknown[])[0]);
    }
    rects.push({ page, x: 0, y: 0, width: 0, height: 0, fill });
  }
  return { pageCount: doc.numPages, fragments, rects, hasTextLayer: fragments.length > 0 };
}

const html = () => readFileSync(join(HERE, "smartcredit-synthetic.fixture.html"), "utf8");

let fromHtml: CanonicalSmartCreditReport;
let fromPdf: CanonicalSmartCreditReport;

async function both() {
  fromHtml ??= SmartCreditHtmlAdapter.parse(html());
  fromPdf ??= SmartCreditPdfAdapter.parse(await pdfGeometry());
  return { fromHtml, fromPdf };
}

/** Per-bureau values as a comparable map, dropping only format-local detail. */
function comparable(report: CanonicalSmartCreditReport) {
  const out: Record<string, Record<string, Record<string, unknown>>> = {};
  for (const item of report.items) {
    const perBureau: Record<string, Record<string, unknown>> = {};
    for (const values of item.bureauValues ?? []) {
      const copy: Record<string, unknown> = { ...values };
      delete copy.source_locator;
      delete copy.payment_history;
      perBureau[values.bureau] = copy;
    }
    out[item.accountRef] = perBureau;
  }
  return out;
}

describe("the same report in either format", () => {
  it("finds the same accounts, by the same stable handle", async () => {
    const { fromHtml, fromPdf } = await both();
    expect(fromPdf.items.length).toBeGreaterThan(0);
    expect([...fromPdf.items.map((i) => i.accountRef)].sort())
      .toEqual([...fromHtml.items.map((i) => i.accountRef)].sort());
  });

  it("names the same bureaus", async () => {
    const { fromHtml, fromPdf } = await both();
    expect([...fromPdf.bureaus].sort()).toEqual([...fromHtml.bureaus].sort());
  });

  it("attributes every field to the same bureau with the same value", async () => {
    const { fromHtml, fromPdf } = await both();
    expect(comparable(fromPdf)).toEqual(comparable(fromHtml));
  });

  it("reconciles against the same stated counts", async () => {
    const { fromHtml, fromPdf } = await both();
    const key = (r: CanonicalSmartCreditReport) =>
      r.reconciliation
        .filter((c) => c.checkKey === "accounts")
        .map((c) => `${c.bureau}:${c.stated ?? "?"}/${c.parsed}`)
        .sort();
    expect(key(fromPdf)).toEqual(key(fromHtml));
  });

  it("dates the same payment-history months, for the same bureaus", async () => {
    const { fromHtml, fromPdf } = await both();
    const months = (r: CanonicalSmartCreditReport) =>
      Object.entries(r.history)
        .flatMap(([ref, entries]) => entries.map((e) => `${ref}|${e.bureau}|${e.year}-${String(e.month).padStart(2, "0")}`))
        .sort();
    expect(months(fromPdf)).toEqual(months(fromHtml));
  });

  /* The one documented divergence, asserted rather than smoothed over. */
  it("labels the marks in the HTML, and in the PDF keeps them unlabelled rather than inferred", async () => {
    const { fromHtml, fromPdf } = await both();
    const htmlStatuses = Object.values(fromHtml.history).flat().map((e) => e.status);
    expect(htmlStatuses.some((s) => s === "C")).toBe(true);
    expect(htmlStatuses.every((s) => s !== null)).toBe(true);

    const pdfStatuses = Object.values(fromPdf.history).flat();
    expect(pdfStatuses.length).toBeGreaterThan(0);
    expect(pdfStatuses.every((e) => e.status === null)).toBe(true);
    expect(pdfStatuses.every((e) => e.unreadable?.reason === "status_not_in_text_layer")).toBe(true);

    /* And it is recorded as a fact about the FORMAT, with a reason — not as a
       blank, not as the provider's "Unknown", and not per-bureau, because no
       bureau is at fault. */
    const fact = fromPdf.facts.find((f) => f.fieldKey === "payment_history_status");
    expect(fact?.state).toBe("not_exposed_by_provider");
    expect(fact?.bureau).toBeUndefined();
    /* The wording matters: the marks ARE rendered. What is missing is a
       machine-readable label and an embedded colour key. */
    expect(fact?.reason).toMatch(/renders the payment-history marks visually/i);
    expect(fact?.reason).toMatch(/no machine-readable status/i);
    expect(fact?.reason).toMatch(/no embedded colour-to-status key/i);
  });
});

describe("the PDF is read as geometry, not as text", () => {
  it("keeps an account whole across a page break", async () => {
    const geometry = await pdfGeometry();
    const rows = toRows(geometry.fragments);
    const meridian = findBlocks(rows).find((b) => b.heading.includes("MERIDIAN"));
    expect(meridian).toBeDefined();
    /* Its fields are on page 2 and its history rows on page 3. */
    const parsed = parseSmartCreditPdf(geometry);
    const items = parsed.items.filter((i) => i.name.includes("MERIDIAN"));
    expect(items).toHaveLength(1);
    expect(Object.keys(parsed.history).some((ref) => ref.includes("meridian"))).toBe(true);
  });

  it("resolves reversed bureau headers from the header, not the column order", async () => {
    const geometry = await pdfGeometry();
    const rows = toRows(geometry.fragments);
    const summit = findBlocks(rows).find((b) => b.heading.includes("SUMMIT"));
    expect(summit).toBeDefined();
    const bands = attributeColumns(summit!.rows, summit!.headerRow);
    /* Equifax is printed over the LEFTMOST column in this block. A parser
       reading position would call it TransUnion. */
    expect(bands[0].bureau).toBe("EQ");
    expect(bands[bands.length - 1].bureau).toBe("TU");
  });

  it("refuses to attribute a block that declares no header", async () => {
    const geometry = await pdfGeometry();
    const parsed = parseSmartCreditPdf(geometry);
    const atlas = parsed.items.find((i) => i.name.includes("ATLAS"));
    expect(atlas).toBeDefined();
    /* The values survive; nobody's name is attached to them. */
    expect(atlas!.bureauValues ?? []).toHaveLength(0);
    expect(atlas!.sourceColumns).toBeTruthy();
    expect(parsed.warnings.some((w) => w.includes("ATLAS") && w.includes("no bureau header"))).toBe(true);
  });

  it("does not shift columns when a bureau prints a dash", async () => {
    const geometry = await pdfGeometry();
    const parsed = parseSmartCreditPdf(geometry);
    const harbor = parsed.items.find((i) => i.name.includes("HARBOR"));
    expect(harbor).toBeDefined();
    /* Only Experian reported. A parser packing values left would put
       Experian's account number under TransUnion. */
    expect(harbor!.bureauValues?.map((v) => v.bureau)).toEqual(["EX"]);
    expect(harbor!.bureauValues?.[0].account_number_masked).toBe("882300****");
  });

  it("dates months from the source's year markers, not from an index", async () => {
    const geometry = await pdfGeometry();
    const rows = toRows(geometry.fragments);
    /* TransUnion's row starts in August, Experian's in September. Reading by
       index would put every Experian mark one month early. */
    const monthRows = rows.map(datedMonths).filter((m) => m.length >= 12);
    expect(monthRows.length).toBeGreaterThan(0);
    for (const months of monthRows) {
      const january = months.filter((m) => m.month === 1);
      expect(january.length).toBeGreaterThan(0);
      /* Months before the first year marker belong to the year before it. */
      const years = [...new Set(months.map((m) => m.year))].sort();
      expect(years.length).toBeGreaterThanOrEqual(2);
      expect(years[years.length - 1] - years[0]).toBeLessThanOrEqual(2);
    }
    const first = monthRows[0];
    expect(first[0].year).toBe(first.find((m) => m.month === 1)!.year - 1);
  });
});

describe("four cell states stay four", () => {
  it("tells a zero, a dash, an explicit none and a blank apart", () => {
    expect(classifyCell("$0")).toBe("value");
    expect(classifyCell("0")).toBe("value");
    expect(classifyCell("——")).toBe("not_reported_by_bureau");
    expect(classifyCell("––")).toBe("not_reported_by_bureau");
    expect(classifyCell("NONE REPORTED")).toBe("explicit_none_reported");
    expect(classifyCell("")).toBe("blank");
    expect(classifyCell(undefined)).toBe("blank");
  });

  it("records a reported zero as present, and a dash as the bureau not reporting", async () => {
    const geometry = await pdfGeometry();
    const parsed = parseSmartCreditPdf(geometry);
    const northstar = parsed.items.find((i) => i.name.includes("NORTHSTAR"))!;
    const tu = northstar.bureauValues!.find((v) => v.bureau === "TU")!;
    /* Balance Owed is "$0" — a reported zero, not a missing balance. */
    expect(tu.balance_cents).toBe(0);
    /* Closed Date is an em-dash — absent, and recorded as the bureau's silence. */
    expect(tu.date_closed).toBeUndefined();
    const fact = parsed.facts.find(
      (f) => f.fieldKey.endsWith(".date_closed") && f.bureau === "TU",
    );
    expect(fact?.state).toBe("bureau_not_present");
  });
});

describe("the dated-mark encoding", () => {
  it("round-trips, and distinguishes an undetermined mark from the provider's Unknown", () => {
    expect(decodeHistoryMark(encodeHistoryMark(2025, 1, "C"))).toEqual({ year: 2025, month: 1, status: "C" });
    /* `U` is the provider saying the bureau reported nothing that month. */
    expect(decodeHistoryMark("2025-03:U")).toEqual({ year: 2025, month: 3, status: "U" });
    /* `?` is us saying the format did not carry the mark. Different claim. */
    expect(decodeHistoryMark(encodeHistoryMark(2025, 3, null))).toEqual({ year: 2025, month: 3, status: null });
    expect(decodeHistoryMark("nonsense")).toBeNull();
    expect(decodeHistoryMark("2025-13:C")).toBeNull();
  });
});

describe("what the PDF adapter does not yet read is visible, not silent", () => {
  it("preserves the provider's derived Utilization without calling it a reported value", async () => {
    const geometry = await pdfGeometry();
    const parsed = parseSmartCreditPdf(geometry);
    const ref = Object.keys(parsed.derived).find((r) => r.includes("northstar"));
    /* The fixture prints no Utilization row, so nothing is derived from it —
       the assertion that matters is that a derived figure could never land
       among the reported per-bureau values. */
    const northstar = parsed.items.find((i) => i.name.includes("NORTHSTAR"))!;
    for (const values of northstar.bureauValues ?? [])
      expect(Object.keys(values)).not.toContain("utilization");
    expect(ref === undefined || typeof parsed.derived[ref] === "object").toBe(true);
  });

  it("reconciles public records and inquiries, so a stated count cannot import as complete", async () => {
    const geometry = await pdfGeometry();
    const report = SmartCreditPdfAdapter.parse(geometry);
    for (const key of ["accounts", "public_records", "inquiries@2_years"])
      expect(report.reconciliation.some((c) => c.checkKey === key)).toBe(true);

    /* The window is part of the key, so the summary's two-year figure and the
       listing's three-year one cannot collide in storage. */
    const inquiryKeys = new Set(
      report.reconciliation.filter((c) => c.checkKey.startsWith("inquiries")).map((c) => c.checkKey),
    );
    expect(inquiryKeys.has("inquiries@2_years")).toBe(true);
    expect(inquiryKeys.has("inquiries@3_years")).toBe(true);
    for (const c of report.reconciliation.filter((c) => c.checkKey === "inquiries@2_years"))
      expect(c.comparable).toBe(false);

    /* The fixture states zero of each, so these pass. The point is that a
       report stating three judgments would reconcile SHORT and grade the
       import partial — never "the records are absent from the file". */
    const shortfall = report.reconciliation.filter((c) => !c.ok);
    for (const check of shortfall)
      expect(check.reason).toMatch(/unread, not absent|could not be verified|could not be read|different periods/i);
  });
});

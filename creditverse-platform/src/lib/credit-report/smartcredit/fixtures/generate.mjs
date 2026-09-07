/**
 * Render the one synthetic report (see `synthetic-report.mjs`) into both of
 * SmartCredit's export formats.
 *
 * Run: node src/lib/credit-report/smartcredit/fixtures/generate.mjs
 *
 * The PDF is written by hand — an uncompressed content stream with text at the
 * coordinates the real export uses (labels at x=47.2, values at 184.1/313.5/
 * 442.9, headers centred at 219.4/355.7/489.4) and coloured rectangles where
 * the payment marks sit. It has to be a genuine PDF: the adapter's claim is
 * that it reads page geometry, and a JSON stand-in would never exercise
 * pdf.js, the y-axis flip, or the stitching of an account across a page break.
 *
 * The HTML mirrors the real export's markup: a four-column grid addressed by
 * `row-start`/`col-start`, bureau headers carried in `bg-<bureau>` classes,
 * and payment history in `class="history" data-bureau-col="N"` with the
 * provider's own `status-<code>` cells.
 */
import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { ACCOUNTS, PERSONAL, SCORES, summaryCounts } from "./synthetic-report.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const BUREAUS = ["transunion", "experian", "equifax"];
const NAMES = ["TransUnion", "Experian", "Equifax"];

const BANNER = (format) => `SYNTHETIC SmartCredit-shaped fixture — ${format}. STRUCTURE ONLY.

  Generated from synthetic-report.mjs, which is the single definition of this
  report. The HTML and PDF fixtures are two renderings of the SAME data, which
  is what makes "either format normalises to the same canonical record" a
  claim a test can check rather than an assertion.

  Every person, creditor, account number, balance, date and payment mark is
  INVENTED. No real consumer report is in this repository. Do not replace any
  value here with one from a real report — regenerate instead.`;

/* ── PDF ───────────────────────────────────────────────────────────────── */

const LABEL_X = 47.2;
const COLS = [184.1, 313.5, 442.9];
const HEADER_X = [219.4, 355.7, 489.4];
const PAGE_H = 792;
/**
 * Escape for a content stream, and map the characters WinAnsi encodes above
 * 0x7f to their byte. The em-dash is the one that matters: it is how the
 * export says "this bureau's column is empty", and a dropped glyph would
 * silently turn that into a blank cell — a different state entirely.
 */
const WINANSI = { "\u2014": "\\227", "\u2013": "\\226", "\u2019": "\\222", "\u00ae": "\\256" };
const esc = (s) =>
  String(s)
    .replace(/[\\()]/g, (c) => "\\" + c)
    .replace(/[\u2014\u2013\u2019\u00ae]/g, (c) => WINANSI[c]);

class Page {
  constructor() { this.ops = []; this.y = 60; }
  text(x, y, s, size = 8) {
    this.ops.push(`BT /F1 ${size} Tf 1 0 0 1 ${x.toFixed(2)} ${(PAGE_H - y).toFixed(2)} Tm (${esc(s)}) Tj ET`);
  }
  rect(x, y, w, h, rgb) {
    this.ops.push(`${rgb} rg ${x.toFixed(2)} ${(PAGE_H - y - h).toFixed(2)} ${w.toFixed(2)} ${h.toFixed(2)} re f`);
  }
  get stream() { return this.ops.join("\n"); }
}

function pdfHeaderRow(page, headerOrder) {
  headerOrder.forEach((slot, i) => page.text(HEADER_X[slot], page.y, NAMES[i]));
}

function pdfAccount(page, account) {
  page.text(LABEL_X, page.y, account.heading, 9);
  page.y += 5;
  if (account.header) pdfHeaderRow(page, account.headerOrder);
  page.y += 20;
  for (const [pdfLabel, , values] of account.fields) {
    page.text(LABEL_X, page.y, pdfLabel);
    values.forEach((v, i) => page.text(COLS[i], page.y + 1, v));
    page.y += 11;
  }
  page.y += 6;
}

function pdfHistory(page, rows) {
  if (!rows.length) return;
  page.text(LABEL_X, page.y, "Payment History - Last 2 Years");
  page.y += 16;
  for (const row of rows) {
    page.text(LABEL_X, page.y, row.bureau);
    if (row.noneReported) { page.text(99.7, page.y, "NONE REPORTED"); page.y += 20; continue; }
    page.y += 15;
    row.months.forEach((m, i) => {
      const x = 101 + i * 15.2;
      /* Green and grey, as the real print does — and with NO legend, because
         the real print carries none. This is the divergence the adapter has
         to be honest about rather than decode. */
      page.rect(x - 1, page.y - 8, 13, 12, row.status[i] === "U" ? "0.937 0.937 0.937" : "0.086 0.639 0.361");
      page.text(x, page.y, m, 6);
    });
    page.y += 18;
  }
  page.text(LABEL_X, page.y, "Days Late - Last 7 Years");
  page.y += 16;
  [47.2, 226].forEach((x, i) => page.text(x, page.y, NAMES[i]));
  page.y += 19;
  [[51.7, 71.3, 112.8, 132.3, 173.8, 193.4], [230.5, 251.4, 291.5, 312.5, 352.6, 372.6]].forEach((g) => {
    page.text(g[0], page.y, "30:"); page.text(g[1], page.y, "0");
    page.text(g[2], page.y, "60:"); page.text(g[3], page.y, "0");
    page.text(g[4], page.y, "90:"); page.text(g[5], page.y, "0");
  });
  page.y += 22;
}

function buildPdf() {
  const pages = [new Page(), new Page(), new Page()];
  const p1 = pages[0];

  p1.text(LABEL_X, p1.y, "Credit Scores", 11); p1.y += 19;
  pdfHeaderRow(p1, [0, 1, 2]); p1.y += 22;
  SCORES.forEach((s, i) => p1.text(COLS[i], p1.y, s)); p1.y += 26;

  p1.text(LABEL_X, p1.y, "Personal Information", 11); p1.y += 24;
  pdfHeaderRow(p1, [0, 1, 2]); p1.y += 20;
  for (const [label, vals] of PERSONAL) {
    p1.text(LABEL_X, p1.y, label);
    vals.forEach((v, i) => p1.text(COLS[i], p1.y + 1, v));
    p1.y += 11;
  }
  p1.y += 14;

  const counts = summaryCounts();
  p1.text(LABEL_X, p1.y, "Summary", 11); p1.y += 28;
  pdfHeaderRow(p1, [0, 1, 2]); p1.y += 21;
  const totals = NAMES.map((n) => String(counts[n]));
  for (const [label, vals] of [
    ["Total Accounts", totals],
    ["Open Accounts", totals],
    ["Closed Accounts", ["0", "0", "0"]],
    ["Delinquent", ["0", "0", "0"]],
    ["Derogatory", ["1", "1", "1"]],
    ["Public Records", ["0", "0", "0"]],
    ["Inquiries", ["0", "0", "0"]],
  ]) {
    p1.text(LABEL_X, p1.y, label);
    vals.forEach((v, i) => p1.text(COLS[i], p1.y + 1, v));
    p1.y += 11;
  }
  p1.y += 20;
  p1.text(LABEL_X, p1.y, "Account History", 11); p1.y += 22;

  for (const account of ACCOUNTS) {
    const page = pages[account.page - 1];
    pdfAccount(page, account);
    const here = account.history.filter((h) => !h.onNextPage);
    pdfHistory(page, here);
    const next = account.history.filter((h) => h.onNextPage);
    if (next.length) {
      /* The heading prints at the bottom of this page and the rows land on
         the next — the real export's commonest shape. */
      page.text(LABEL_X, page.y, "Payment History - Last 2 Years");
      pdfHistory(pages[account.page], next);
    }
  }

  const objects = [];
  objects[1] = "<< /Type /Catalog /Pages 2 0 R >>";
  objects[2] = `<< /Type /Pages /Kids [${pages.map((_, i) => `${4 + i * 2} 0 R`).join(" ")}] /Count ${pages.length} >>`;
  /* WinAnsiEncoding, explicitly. Helvetica's built-in StandardEncoding maps
     0x27 to a typographic right-quote and has no em-dash at all, so without
     this the fixture's dashes vanish from the text layer and its year markers
     come back as ’25. Both are exactly the states under test. */
  objects[3] = "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>";
  pages.forEach((page, i) => {
    const n = 4 + i * 2;
    objects[n] = `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 ${PAGE_H}] /Resources << /Font << /F1 3 0 R >> >> /Contents ${n + 1} 0 R >>`;
    const s = page.stream;
    objects[n + 1] = `<< /Length ${Buffer.byteLength(s)} >>\nstream\n${s}\nendstream`;
  });

  let pdf = `%PDF-1.4\n% ${BANNER("PDF").replace(/\n/g, "\n% ")}\n`;
  const offsets = [];
  for (let i = 1; i < objects.length; i++) {
    if (!objects[i]) continue;
    offsets[i] = Buffer.byteLength(pdf, "latin1");
    pdf += `${i} 0 obj\n${objects[i]}\nendobj\n`;
  }
  const xref = Buffer.byteLength(pdf, "latin1");
  pdf += `xref\n0 ${objects.length}\n0000000000 65535 f \n`;
  for (let i = 1; i < objects.length; i++)
    pdf += `${String(offsets[i] ?? 0).padStart(10, "0")} 00000 ${offsets[i] ? "n" : "f"} \n`;
  pdf += `trailer\n<< /Size ${objects.length} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return pdf;
}

/* ── HTML ──────────────────────────────────────────────────────────────── */

const headerCells = (headerOrder) =>
  headerOrder
    .map((slot, i) => `      <dt class="bg-${BUREAUS[i]} col-start-${slot + 2}">${BUREAUS[i]}<sup>&reg;</sup></dt>`)
    .join("\n");

function htmlGrid(rows, headerOrder, header = true) {
  const out = [`    <dl class="grid">`, `      <dt class="grid-cell col-start-1">&nbsp;</dt>`];
  if (header) out.push(headerCells(headerOrder));
  rows.forEach(([label, values], i) => {
    const r = i + 2;
    out.push(`\n      <p class="grid-cell row-start-${r} col-start-1 fw-bold">${label}:</p>`);
    values.forEach((v, c) => out.push(`      <p class="grid-cell row-start-${r} col-start-${c + 2}">${v}</p>`));
  });
  out.push(`    </dl>`);
  return out.join("\n");
}

function htmlHistory(row) {
  if (row.noneReported)
    return `    <div class="history" data-bureau-col="${row.col}"><p class="text-${row.bureau.toLowerCase()} payment-history-heading">${row.bureau}</p><p>NONE REPORTED</p></div>`;
  const cells = row.months.map((m, i) => {
    const code = row.status[i];
    const badge = { U: "", C: "OK", 1: "30", 2: "60", 3: "90", 4: "120", 5: "150", 7: "PP", 8: "RF", 9: "CO" }[code] ?? "";
    /* The year travels with the month, exactly as the export prints it: a
       year marker stands in for January. */
    const isMarker = /^'/.test(m);
    const year = yearFor(row.months, i);
    const monthLabel = isMarker ? "Jan" : m;
    return `      <div class="status-${code}"><p class="month-badge">${badge}</p><p class="month-label text-center">${monthLabel}</p><p class="month-label text-center">'${String(year).slice(2)}</p></div>`;
  });
  return [
    `    <div class="history" data-bureau-col="${row.col}">`,
    `      <p class="text-${row.bureau.toLowerCase()} fw-bold payment-history-heading mb-1 text-capitalize">${row.bureau}</p>`,
    ...cells,
    `    </div>`,
  ].join("\n");
}

/** The year a month belongs to, from the row's own markers. */
function yearFor(months, index) {
  const markerAt = (i) => (/^'\d{2}$/.test(months[i]) ? 2000 + Number(months[i].slice(1)) : null);
  for (let i = index; i >= 0; i--) { const y = markerAt(i); if (y) return y; }
  for (let i = 0; i < months.length; i++) { const y = markerAt(i); if (y) return y - 1; }
  return 2000;
}

function buildHtml() {
  const counts = summaryCounts();
  const totals = NAMES.map((n) => String(counts[n]));
  const parts = [`<!--\n  ${BANNER("HTML").replace(/\n/g, "\n  ")}\n-->`];

  parts.push(`<section id="credit-scores">\n  <h5>Credit Scores</h5>\n${htmlGrid([["Score", SCORES]], [0, 1, 2])}\n</section>`);
  parts.push(`<section id="personal-information">\n  <h5>Personal Information</h5>\n${htmlGrid(PERSONAL, [0, 1, 2])}\n</section>`);
  parts.push(`<section id="summary">\n  <h5>Summary</h5>\n${htmlGrid([
    ["Total Accounts", totals], ["Open Accounts", totals], ["Closed Accounts", ["0", "0", "0"]],
    ["Delinquent", ["0", "0", "0"]], ["Derogatory", ["1", "1", "1"]],
    ["Public Records", ["0", "0", "0"]], ["Inquiries (2 years)", ["0", "0", "0"]],
  ], [0, 1, 2])}\n</section>`);

  const legend = Object.entries({
    U: ["", "Unknown"], C: ["OK", "Current"], 1: ["30", "30 Days Late"], 2: ["60", "60 Days Late"],
    3: ["90", "90 Days Late"], 4: ["120", "120 Days Late"], 5: ["150", "150+ Days Late"],
    7: ["PP", "Payment Plan"], 8: ["RF", "Repossession Foreclosure"], 9: ["CO", "Collection Chargeoff"],
  }).map(([code, [badge, label]]) =>
    `    <div class="status-${code} flex-grow-1"><p class="month-badge"> ${badge} </p><p class="month-label"> ${label} </p></div>`).join("\n");
  parts.push(`<section id="payment-history-key">\n  <p><strong>Your payment history</strong></p>\n  <div class="d-flex flex-wrap payment-history-legend justify-content-start w-full">\n${legend}\n  </div>\n</section>`);

  const blocks = ACCOUNTS.map((account) => {
    const rows = account.fields.map(([, htmlLabel, values]) => [htmlLabel, values]);
    return [
      `  <div class="account" data-fixture-case="${account.case}">`,
      `    <p class="fw-bold">${account.heading}</p>`,
      htmlGrid(rows, account.headerOrder, account.header),
      ...account.history.map(htmlHistory),
      `  </div>`,
    ].join("\n");
  });
  parts.push(`<section id="account-history">\n  <h5>Account History</h5>\n${blocks.join("\n\n")}\n</section>`);
  parts.push(`<section id="public-records">\n  <h5>Public Records</h5>\n  <p>NONE REPORTED</p>\n</section>`);
  parts.push(`<section id="inquiries">\n  <h5>Inquiries</h5>\n  <p>NONE REPORTED</p>\n</section>`);
  return parts.join("\n\n") + "\n";
}

writeFileSync(join(HERE, "smartcredit-synthetic.fixture.pdf"), buildPdf(), "latin1");
writeFileSync(join(HERE, "smartcredit-synthetic.fixture.html"), buildHtml(), "utf8");
console.log("wrote both fixtures from one definition");

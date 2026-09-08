/**
 * Extracts BES_GHL_Full_Infrastructure_Build_Tracker.xlsx to one CSV per sheet.
 *
 * WHY BY HAND AND NOT WITH A LIBRARY. An .xlsx is a zip of XML, and adding a
 * spreadsheet parser to this repository's dependencies to read one file that
 * changes a few times a year is a dependency nobody would remember why we
 * took. Node ships zlib; the rest is fifty lines.
 *
 * THE XLSX DETAIL THAT MATTERS. Cell values are usually indexes into a shared
 * string table (`t="s"`), not text. A parser that reads `<v>` as the value
 * turns every label in the workbook into a number — silently, and the output
 * still looks like a spreadsheet. Inline strings (`t="inlineStr"`) and
 * booleans need their own handling too.
 *
 *   node docs/bes-crm/scripts/extract-tracker.mjs
 *
 * Run from `creditverse-platform`. The .xlsx is the source of truth; the CSVs
 * are derived, so regenerate them rather than editing them.
 */
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { inflateRawSync } from "node:zlib";

const XLSX = "docs/bes-crm/BES_GHL_Full_Infrastructure_Build_Tracker.xlsx";
const OUT = "docs/bes-crm/sheets";

/* ── A minimal zip reader: central directory, then each local entry. ───── */
function readZip(buf) {
  const files = new Map();
  /* End of central directory: scan back for the signature. */
  let eocd = -1;
  for (let i = buf.length - 22; i >= 0 && i > buf.length - 66_000; i -= 1) {
    if (buf.readUInt32LE(i) === 0x06054b50) { eocd = i; break; }
  }
  if (eocd < 0) throw new Error("not a zip: no end-of-central-directory record");
  const count = buf.readUInt16LE(eocd + 10);
  let p = buf.readUInt32LE(eocd + 16);
  for (let n = 0; n < count; n += 1) {
    if (buf.readUInt32LE(p) !== 0x02014b50) throw new Error("central directory out of step");
    const method = buf.readUInt16LE(p + 10);
    const compSize = buf.readUInt32LE(p + 20);
    const nameLen = buf.readUInt16LE(p + 28);
    const extraLen = buf.readUInt16LE(p + 30);
    const commentLen = buf.readUInt16LE(p + 32);
    const localAt = buf.readUInt32LE(p + 42);
    const name = buf.toString("utf8", p + 46, p + 46 + nameLen);
    /* The local header repeats the name and extra fields, with its OWN
       lengths — using the central directory's would land mid-data. */
    const lNameLen = buf.readUInt16LE(localAt + 26);
    const lExtraLen = buf.readUInt16LE(localAt + 28);
    const dataAt = localAt + 30 + lNameLen + lExtraLen;
    const raw = buf.subarray(dataAt, dataAt + compSize);
    files.set(name, method === 0 ? raw : inflateRawSync(raw));
    p += 46 + nameLen + extraLen + commentLen;
  }
  return files;
}

const decodeEntities = (s) =>
  s.replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(Number(d)))
   .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(parseInt(h, 16)))
   .replace(/&lt;/g, "<").replace(/&gt;/g, ">")
   .replace(/&quot;/g, '"').replace(/&apos;/g, "'")
   .replace(/&amp;/g, "&");

/** All the <t> runs of one element, joined — a cell may be several runs. */
const textOf = (xml) =>
  [...xml.matchAll(/<t[^>]*>([\s\S]*?)<\/t>/g)].map((m) => decodeEntities(m[1])).join("");

function sharedStrings(files) {
  const xml = files.get("xl/sharedStrings.xml");
  if (!xml) return [];
  return [...xml.toString("utf8").matchAll(/<si[^>]*>([\s\S]*?)<\/si>/g)].map((m) => textOf(m[1]));
}

/** "BC12" → 54. Column letters are base-26 with no zero. */
function colIndex(ref) {
  const letters = /^([A-Z]+)/.exec(ref)?.[1] ?? "A";
  let n = 0;
  for (const ch of letters) n = n * 26 + (ch.charCodeAt(0) - 64);
  return n - 1;
}

function sheetRows(xml, strings) {
  const rows = [];
  for (const rm of xml.matchAll(/<row[^>]*>([\s\S]*?)<\/row>/g)) {
    const cells = [];
    for (const cm of rm[1].matchAll(/<c\s([^>]*)>([\s\S]*?)<\/c>|<c\s([^>]*)\/>/g)) {
      const attrs = cm[1] ?? cm[3] ?? "";
      const body = cm[2] ?? "";
      const ref = /r="([A-Z]+\d+)"/.exec(attrs)?.[1] ?? "A1";
      const type = /t="([^"]+)"/.exec(attrs)?.[1] ?? "n";
      let value = "";
      if (type === "s") {
        const i = Number(/<v>([\s\S]*?)<\/v>/.exec(body)?.[1] ?? "-1");
        value = strings[i] ?? "";
      } else if (type === "inlineStr") {
        value = textOf(body);
      } else if (type === "str") {
        value = decodeEntities(/<v>([\s\S]*?)<\/v>/.exec(body)?.[1] ?? "");
      } else if (type === "b") {
        value = /<v>1<\/v>/.test(body) ? "TRUE" : "FALSE";
      } else {
        value = decodeEntities(/<v>([\s\S]*?)<\/v>/.exec(body)?.[1] ?? "");
      }
      const at = colIndex(ref);
      while (cells.length < at) cells.push("");
      cells[at] = value;
    }
    rows.push(cells);
  }
  return rows;
}

const csvCell = (v) => (/[",\n\r]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v);
const toCsv = (rows) => rows.map((r) => r.map(csvCell).join(",")).join("\n") + "\n";
const slug = (s) => s.replace(/[^A-Za-z0-9]+/g, "-").replace(/^-|-$/g, "").toLowerCase();

const files = readZip(readFileSync(XLSX));
const strings = sharedStrings(files);
const wb = files.get("xl/workbook.xml").toString("utf8");
const rels = files.get("xl/_rels/workbook.xml.rels").toString("utf8");
const relTarget = new Map(
  [...rels.matchAll(/<Relationship[^>]*Id="([^"]+)"[^>]*Target="([^"]+)"/g)].map((m) => [m[1], m[2]]),
);

mkdirSync(OUT, { recursive: true });
let total = 0;
const index = [];
for (const m of wb.matchAll(/<sheet[^>]*name="([^"]+)"[^>]*r:id="([^"]+)"/g)) {
  const name = decodeEntities(m[1]);
  let target = relTarget.get(m[2]) ?? "";
  if (target.startsWith("/")) target = target.slice(1);
  else if (!target.startsWith("xl/")) target = `xl/${target}`;
  const xml = files.get(target);
  if (!xml) { console.warn(`  ! no data for sheet ${name}`); continue; }
  const rows = sheetRows(xml.toString("utf8"), strings);
  const file = `${OUT}/${slug(name)}.csv`;
  writeFileSync(file, toCsv(rows));
  const nonEmpty = rows.filter((r) => r.some((c) => c.trim() !== "")).length;
  index.push({ name, file, rows: nonEmpty });
  total += nonEmpty;
  console.log(`  ${name.padEnd(34)} ${String(nonEmpty).padStart(4)} rows → ${file}`);
}
console.log(`\n${index.length} sheets, ${total} non-empty rows.`);

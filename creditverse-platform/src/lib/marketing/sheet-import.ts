/**
 * Turning a planning spreadsheet into marketing work.
 *
 * Dee, 2026-09-13: "we use to generate campaign via GPT, manually uploading
 * this info here is chaotic and waste of time, let's have an automatic import
 * or update of calendar and campaign details from a google spreadsheet."
 *
 * ── WHAT THIS FILE IS, AND IS NOT ───────────────────────────────────────────
 *
 * It is pure: text in, a PLAN out. It touches no database and decides nothing
 * about authorization. Everything that can go wrong with an import — a
 * duplicated month of content, a column nobody mapped quietly becoming the
 * caption, a date read as 5 October in one row and 10 May in the next — goes
 * wrong here, in logic that can be tested without a browser (rule 5).
 *
 * Nothing is written until somebody has seen the plan. The importer proposes;
 * the person confirms.
 *
 * ── THE RULES THAT MATTER ───────────────────────────────────────────────────
 *
 * ONE ROW IS ONE `work_item`. Not a content record, not a calendar entry — the
 * same canonical task the board and the calendar already show, because one
 * record seen three ways is the whole design (Dee, 2026-09-12).
 *
 * RE-IMPORTING UPDATES. The sheet's own id column is the identity; without one
 * the normalized title is, and the preview says so plainly, because renaming a
 * post in the sheet then arrives as a new task and somebody has to know that
 * before they press the button.
 *
 * A ROW REMOVED FROM THE SHEET DELETES NOTHING. Work in progress is not the
 * spreadsheet's to revoke (rule 11).
 *
 * AN UNMAPPED COLUMN IS REPORTED, NEVER GUESSED.
 */

/* ------------------------------------------------------------------ */
/* Parsing                                                             */
/* ------------------------------------------------------------------ */

/**
 * Tab or comma, decided by the content rather than by asking.
 *
 * Pasting straight out of Google Sheets gives TAB-separated text; saving the
 * same sheet as a file gives commas. People do both, and being asked "is this
 * a CSV?" about text they just copied is a question with no good answer.
 *
 * The first line decides: whichever character appears more often outside
 * quotes wins, and a line with neither is a single column.
 */
export function detectDelimiter(text: string): "\t" | "," {
  const firstLine = text.split(/\r?\n/, 1)[0] ?? "";
  let tabs = 0;
  let commas = 0;
  let inQuotes = false;
  for (const ch of firstLine) {
    if (ch === '"') inQuotes = !inQuotes;
    else if (!inQuotes && ch === "\t") tabs += 1;
    else if (!inQuotes && ch === ",") commas += 1;
  }
  return tabs > commas ? "\t" : ",";
}

/**
 * Delimited text into a grid, honouring quotes.
 *
 * A caption is exactly the kind of cell that contains a comma and a newline,
 * so a naive `split(",")` shreds real content into extra columns and silently
 * shifts every field after it.
 */
export function parseDelimited(text: string, delimiter = detectDelimiter(text)): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let inQuotes = false;

  for (let i = 0; i < text.length; i += 1) {
    const ch = text[i];
    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') { cell += '"'; i += 1; }   // an escaped quote
        else inQuotes = false;
      } else cell += ch;
      continue;
    }
    if (ch === '"') { inQuotes = true; continue; }
    if (ch === delimiter) { row.push(cell); cell = ""; continue; }
    if (ch === "\n") { row.push(cell); rows.push(row); row = []; cell = ""; continue; }
    if (ch === "\r") continue;
    cell += ch;
  }
  row.push(cell);
  rows.push(row);

  /* A trailing newline is not an empty post. */
  return rows.filter((r) => r.some((c) => c.trim() !== ""));
}

/* ------------------------------------------------------------------ */
/* Columns                                                             */
/* ------------------------------------------------------------------ */

export type ImportField =
  | "externalRef" | "title" | "publishOn" | "channel" | "contentType"
  | "caption" | "campaign" | "assignee" | "status" | "dueOn" | "notes";

/**
 * What a heading is allowed to be called.
 *
 * Everybody's tracker names these differently, and rejecting "Post" because
 * the code wanted "Title" is the kind of friction that sends people back to
 * typing. Matching is case- and punctuation-insensitive.
 */
const ALIASES: Record<ImportField, string[]> = {
  externalRef: ["id", "ref", "rowid", "postid", "uid", "key"],
  title: ["title", "post", "task", "name", "content", "topic", "subject", "deliverable"],
  publishOn: ["publishdate", "publish", "postdate", "scheduled", "scheduleddate", "date", "godate", "golive"],
  channel: ["channel", "platform", "network", "socialplatform"],
  contentType: ["contenttype", "type", "format", "posttype"],
  caption: ["caption", "copy", "body", "text", "description", "captioncopy"],
  campaign: ["campaign", "campaignname", "initiative", "launch"],
  assignee: ["assignee", "assignedto", "owner", "responsible", "who"],
  status: ["status", "stage", "state", "progress"],
  dueOn: ["duedate", "due", "deadline", "draftdue"],
  notes: ["notes", "note", "comments", "remarks", "instructions"],
};

const normalizeHeader = (h: string): string => h.toLowerCase().replace(/[^a-z0-9]/g, "");

export interface ColumnMapping {
  /** Field → column index. */
  byField: Partial<Record<ImportField, number>>;
  /** Headings nobody claimed, reported so a person decides rather than the code. */
  unmapped: string[];
}

export function mapColumns(headers: string[]): ColumnMapping {
  const byField: Partial<Record<ImportField, number>> = {};
  const unmapped: string[] = [];

  headers.forEach((raw, index) => {
    const key = normalizeHeader(raw);
    if (!key) return;
    const field = (Object.keys(ALIASES) as ImportField[])
      .find((f) => ALIASES[f].includes(key) && byField[f] === undefined);
    if (field) byField[field] = index;
    else unmapped.push(raw.trim());
  });

  return { byField, unmapped };
}

/* ------------------------------------------------------------------ */
/* Dates                                                               */
/* ------------------------------------------------------------------ */

const MONTHS = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];

/**
 * A cell into `YYYY-MM-DD`, or null when it is not a date at all.
 *
 * `03/04/2026` is genuinely ambiguous and is read as MM/DD — US format,
 * because that is the convention everywhere else in this platform. Anything
 * that cannot be read is returned as null and reported, never silently
 * dropped and never guessed into a plausible-looking wrong day.
 */
export function parseSheetDate(value: string): string | null {
  const raw = value.trim();
  if (!raw) return null;

  const iso = raw.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (iso) return ymd(+iso[1], +iso[2], +iso[3]);

  const slashed = raw.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{2,4})$/);
  if (slashed) {
    const year = +slashed[3] < 100 ? 2000 + +slashed[3] : +slashed[3];
    return ymd(year, +slashed[1], +slashed[2]);
  }

  const named = raw.match(/^([A-Za-z]{3,})\.?\s+(\d{1,2})(?:st|nd|rd|th)?,?\s*(\d{4})?$/);
  if (named) {
    const month = MONTHS.indexOf(named[1].slice(0, 3).toLowerCase());
    if (month >= 0) return ymd(named[3] ? +named[3] : new Date().getFullYear(), month + 1, +named[2]);
  }
  return null;
}

/** Rejects the 31st of February rather than rolling it into March. */
function ymd(year: number, month: number, day: number): string | null {
  if (month < 1 || month > 12 || day < 1 || day > 31) return null;
  const d = new Date(Date.UTC(year, month - 1, day));
  if (d.getUTCMonth() !== month - 1 || d.getUTCDate() !== day) return null;
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

/* ------------------------------------------------------------------ */
/* The plan                                                            */
/* ------------------------------------------------------------------ */

export interface PlannedRow {
  /** 1-based row number in the pasted sheet, for pointing at a problem. */
  line: number;
  externalRef: string;
  title: string;
  publishOn: string | null;
  channel: string | null;
  contentType: string | null;
  caption: string | null;
  campaign: string | null;
  assignee: string | null;
  status: string | null;
  dueOn: string | null;
  notes: string | null;
  /** The existing work item this row updates, when there is one. */
  existingId: string | null;
}

export interface RowProblem {
  line: number;
  reason: string;
}

export interface ImportPlan {
  creates: PlannedRow[];
  updates: PlannedRow[];
  skipped: RowProblem[];
  /** Campaign names in the sheet that do not exist in this workspace yet. */
  newCampaigns: string[];
  unmappedColumns: string[];
  /** True when identity came from the title rather than an id column. */
  matchedOnTitle: boolean;
}

/** Existing work, as the plan needs to see it. */
export interface ExistingItem {
  id: string;
  title: string;
  externalRef: string | null;
}

const titleKey = (title: string): string =>
  `title:${title.trim().toLowerCase().replace(/\s+/g, " ")}`;

export interface PlanInput {
  rows: string[][];
  existing: ExistingItem[];
  /** Campaign names already in this workspace. */
  campaigns: string[];
}

/**
 * What this paste would do, in full, before anything is written.
 *
 * The first row is the heading. A row with no title cannot become a task and
 * is skipped with the reason attached — the count of skipped rows is part of
 * the answer, not a footnote.
 */
export function planImport({ rows, existing, campaigns }: PlanInput): ImportPlan {
  const [headers = [], ...body] = rows;
  const { byField, unmapped } = mapColumns(headers);
  const matchedOnTitle = byField.externalRef === undefined;

  const byRef = new Map<string, ExistingItem>();
  for (const item of existing) {
    if (item.externalRef) byRef.set(item.externalRef, item);
    byRef.set(titleKey(item.title), item);
  }

  const cell = (row: string[], field: ImportField): string => {
    const index = byField[field];
    return index === undefined ? "" : (row[index] ?? "").trim();
  };
  const orNull = (v: string): string | null => v || null;

  const creates: PlannedRow[] = [];
  const updates: PlannedRow[] = [];
  const skipped: RowProblem[] = [];
  const campaignsSeen = new Set<string>();
  const knownCampaigns = new Set(campaigns.map((c) => c.trim().toLowerCase()));
  const refsInThisSheet = new Set<string>();

  body.forEach((row, i) => {
    const line = i + 2; // 1-based, and the heading is line 1
    const title = cell(row, "title");
    if (!title) {
      skipped.push({ line, reason: "No title — there is nothing to call this task" });
      return;
    }

    const sheetRef = cell(row, "externalRef");
    const externalRef = sheetRef || titleKey(title);

    if (refsInThisSheet.has(externalRef)) {
      skipped.push({
        line,
        reason: sheetRef
          ? `Row ${line} repeats id "${sheetRef}", which is already used above`
          : `Row ${line} repeats the title "${title}", and there is no id column to tell them apart`,
      });
      return;
    }
    refsInThisSheet.add(externalRef);

    const publishRaw = cell(row, "publishOn");
    const publishOn = publishRaw ? parseSheetDate(publishRaw) : null;
    if (publishRaw && !publishOn) {
      skipped.push({ line, reason: `"${publishRaw}" is not a date this can read` });
      return;
    }

    const dueRaw = cell(row, "dueOn");
    const dueOn = dueRaw ? parseSheetDate(dueRaw) : null;
    if (dueRaw && !dueOn) {
      skipped.push({ line, reason: `Due date "${dueRaw}" is not a date this can read` });
      return;
    }

    const campaign = orNull(cell(row, "campaign"));
    if (campaign && !knownCampaigns.has(campaign.toLowerCase())) campaignsSeen.add(campaign);

    const existingItem = byRef.get(externalRef) ?? null;
    const planned: PlannedRow = {
      line,
      externalRef,
      title,
      publishOn,
      channel: orNull(cell(row, "channel")),
      contentType: orNull(cell(row, "contentType")),
      caption: orNull(cell(row, "caption")),
      campaign,
      assignee: orNull(cell(row, "assignee")),
      status: orNull(cell(row, "status")),
      dueOn,
      notes: orNull(cell(row, "notes")),
      existingId: existingItem?.id ?? null,
    };

    if (existingItem) updates.push(planned);
    else creates.push(planned);
  });

  return {
    creates,
    updates,
    skipped,
    newCampaigns: [...campaignsSeen].sort((a, b) => a.localeCompare(b)),
    unmappedColumns: unmapped,
    matchedOnTitle,
  };
}

/** Nothing to do — used to keep the button honest rather than posting an empty write. */
export const planIsEmpty = (plan: ImportPlan): boolean =>
  plan.creates.length === 0 && plan.updates.length === 0;

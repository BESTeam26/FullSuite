import { describe, expect, it } from "vitest";
import {
  detectDelimiter, mapColumns, parseDelimited, parseSheetDate, planImport,
  type ExistingItem,
} from "./sheet-import";

const plan = (rows: string[][], existing: ExistingItem[] = [], campaigns: string[] = []) =>
  planImport({ rows, existing, campaigns });

describe("reading what was pasted", () => {
  it("reads a paste straight out of Google Sheets, which is tab-separated", () => {
    /* Nobody exports a file to paste. They select the range and hit copy, and
       that arrives as TSV — asking "is this a CSV?" about text somebody just
       copied is a question with no good answer. */
    expect(detectDelimiter("Title\tPublish Date\tChannel")).toBe("\t");
    expect(detectDelimiter("Title,Publish Date,Channel")).toBe(",");
  });

  it("keeps a caption that contains a comma in one cell", () => {
    /* The failure this guards against is silent: a naive split shreds the
       caption into extra columns and shifts every field after it, so the
       channel ends up in the campaign and nobody notices until later. */
    const rows = parseDelimited('Title,Caption\nOctober post,"Big news, at last"');
    expect(rows[1]).toEqual(["October post", "Big news, at last"]);
  });

  it("keeps a caption that contains a newline in one cell", () => {
    const rows = parseDelimited('Title,Caption\nPost,"Line one\nLine two"');
    expect(rows).toHaveLength(2);
    expect(rows[1][1]).toBe("Line one\nLine two");
  });

  it("reads an escaped quote as a quote", () => {
    const rows = parseDelimited('Title\n"She said ""yes"""');
    expect(rows[1][0]).toBe('She said "yes"');
  });

  it("ignores a trailing blank line rather than importing an empty post", () => {
    expect(parseDelimited("Title\nPost one\n\n")).toHaveLength(2);
  });
});

describe("matching the columns people actually use", () => {
  it("accepts the names different trackers give the same thing", () => {
    const m = mapColumns(["Post", "Scheduled Date", "Platform", "Copy", "Owner"]);
    expect(m.byField.title).toBe(0);
    expect(m.byField.publishOn).toBe(1);
    expect(m.byField.channel).toBe(2);
    expect(m.byField.caption).toBe(3);
    expect(m.byField.assignee).toBe(4);
    expect(m.unmapped).toEqual([]);
  });

  it("ignores case, spaces and punctuation in a heading", () => {
    expect(mapColumns(["  Publish Date  "]).byField.publishOn).toBe(0);
    expect(mapColumns(["content_type"]).byField.contentType).toBe(0);
  });

  it("reports a column nobody claimed instead of guessing at it", () => {
    /* A guessed column is how "Approved by" quietly becomes the caption. */
    const m = mapColumns(["Title", "Approved by", "Budget"]);
    expect(m.unmapped).toEqual(["Approved by", "Budget"]);
    expect(m.byField.caption).toBeUndefined();
  });

  it("does not let a second column steal a field the first one filled", () => {
    const m = mapColumns(["Title", "Name"]);
    expect(m.byField.title).toBe(0);
    expect(m.unmapped).toEqual(["Name"]);
  });
});

describe("reading a date", () => {
  it("reads the formats a planning sheet actually contains", () => {
    expect(parseSheetDate("2026-10-05")).toBe("2026-10-05");
    expect(parseSheetDate("10/5/2026")).toBe("2026-10-05");
    expect(parseSheetDate("10-05-26")).toBe("2026-10-05");
    expect(parseSheetDate("Oct 5, 2026")).toBe("2026-10-05");
    expect(parseSheetDate("October 5th 2026")).toBe("2026-10-05");
  });

  it("refuses a day that does not exist rather than rolling it forward", () => {
    /* `new Date(2026, 1, 31)` is 3 March, and a post silently scheduled four
       days late is worse than a row somebody has to look at. */
    expect(parseSheetDate("2026-02-31")).toBeNull();
    expect(parseSheetDate("13/01/2026")).toBeNull();
  });

  it("returns null for anything it cannot read, and never a plausible guess", () => {
    expect(parseSheetDate("next Tuesday")).toBeNull();
    expect(parseSheetDate("TBD")).toBeNull();
    expect(parseSheetDate("")).toBeNull();
  });
});

describe("what the paste would do", () => {
  const HEAD = ["ID", "Title", "Publish Date", "Channel", "Campaign"];

  it("creates a task per row", () => {
    const p = plan([HEAD, ["1", "October carousel", "2026-10-05", "Instagram", "Q4 Launch"]]);
    expect(p.creates).toHaveLength(1);
    expect(p.updates).toHaveLength(0);
    expect(p.creates[0]).toMatchObject({
      externalRef: "1", title: "October carousel",
      publishOn: "2026-10-05", channel: "Instagram", campaign: "Q4 Launch",
    });
  });

  it("updates rather than duplicating when the same sheet is pasted again", () => {
    /* The whole reason `external_ref` exists. Without it the second paste
       creates thirty more tasks beside the thirty already there, and somebody
       has to work out which thirty are real. */
    const existing: ExistingItem[] = [{ id: "w1", title: "October carousel", externalRef: "1" }];
    const p = plan([HEAD, ["1", "October carousel (v2)", "2026-10-06", "Instagram", ""]], existing);
    expect(p.creates).toHaveLength(0);
    expect(p.updates).toHaveLength(1);
    expect(p.updates[0].existingId).toBe("w1");
    expect(p.updates[0].title).toBe("October carousel (v2)");
  });

  it("falls back to the title when the sheet has no id column, and says so", () => {
    const existing: ExistingItem[] = [{ id: "w1", title: "October carousel", externalRef: null }];
    const p = plan([["Title", "Publish Date"], ["  october CAROUSEL ", "2026-10-05"]], existing);
    expect(p.matchedOnTitle).toBe(true);
    expect(p.updates[0].existingId).toBe("w1");
  });

  it("skips a row with no title rather than inventing one", () => {
    const p = plan([HEAD, ["7", "", "2026-10-05", "Instagram", ""]]);
    expect(p.creates).toHaveLength(0);
    expect(p.skipped).toEqual([{ line: 2, reason: "No title — there is nothing to call this task" }]);
  });

  it("skips a date it cannot read instead of scheduling the wrong day", () => {
    const p = plan([HEAD, ["7", "A post", "sometime next week", "Instagram", ""]]);
    expect(p.creates).toHaveLength(0);
    expect(p.skipped[0].reason).toContain("not a date this can read");
  });

  it("catches the same row twice inside one paste", () => {
    const p = plan([HEAD,
      ["1", "October carousel", "2026-10-05", "Instagram", ""],
      ["1", "Something else", "2026-10-06", "Facebook", ""],
    ]);
    expect(p.creates).toHaveLength(1);
    expect(p.skipped[0].reason).toContain('repeats id "1"');
  });

  it("lists campaigns the workspace does not have yet, once each", () => {
    const p = plan([HEAD,
      ["1", "Post one", "2026-10-05", "Instagram", "Q4 Launch"],
      ["2", "Post two", "2026-10-06", "Instagram", "Q4 Launch"],
      ["3", "Post three", "2026-10-07", "Instagram", "Always On"],
    ], [], ["always on"]);
    expect(p.newCampaigns).toEqual(["Q4 Launch"]);
  });

  it("carries the unmapped columns through to the preview", () => {
    const p = plan([["Title", "Budget"], ["A post", "500"]]);
    expect(p.unmappedColumns).toEqual(["Budget"]);
  });

  it("never plans a deletion for work missing from the sheet", () => {
    /* Dee's rule and the platform's: work in progress is not the
       spreadsheet's to revoke. */
    const existing: ExistingItem[] = [
      { id: "w1", title: "Still running", externalRef: "99" },
    ];
    const p = plan([HEAD, ["1", "A new post", "2026-10-05", "Instagram", ""]], existing);
    expect(p.creates).toHaveLength(1);
    expect(p.updates).toHaveLength(0);
    expect(Object.keys(p)).not.toContain("deletes");
  });

  it("handles a sheet that is only a heading", () => {
    const p = plan([HEAD]);
    expect(p.creates).toEqual([]);
    expect(p.skipped).toEqual([]);
  });
});

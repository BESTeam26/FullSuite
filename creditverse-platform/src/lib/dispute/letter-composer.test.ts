/**
 * The composer's job is refusing to produce a letter that would embarrass the
 * sender: an unverified address, a full account number, a placeholder nobody
 * filled, or an accusation resting on something merely apparent.
 */
import { describe, expect, it } from "vitest";
import { ITEM_TABLE_HEADERS, composeLetter, itemRows, type ComposeInput } from "./letter-composer";
import { getRound } from "./escalation-ladder";
import type { Finding } from "./condition-detector";

const confirmed: Finding = {
  condition: "dates_inconsistent", confidence: "confirmed",
  observation: "The date of last activity differs between the bureaus reporting this account.",
};
const apparent: Finding = {
  condition: "single_bureau_only", confidence: "apparent",
  observation: "Only TransUnion is reporting this account.",
  needs: "whether the furnisher reports to this bureau alone by choice",
};

const input = (over: Partial<ComposeInput> = {}): ComposeInput => ({
  consumer: { fullName: "Jordan Reyes", street: "14 Mill Lane", cityStateZip: "Austin, TX 78701", phone: "(555) 010-0100" },
  recipient: { name: "TransUnion", disputeAddress: "P.O. Box 2000", cityStateZip: "Chester, PA 19016" },
  round: getRound(1)!,
  reportName: "TransUnion", reportDate: "3 September 2026", letterDate: "6 September 2026",
  items: [{
    label: "Account with ABC Bank ending in 1234",
    reportedAs: "Last activity March 2019",
    recordsShow: "Account opened June 2019",
    evidence: "Opening statement dated 12 June 2019",
    requestedAction: "Correct the date of last activity",
    findings: [confirmed],
  }],
  enclosures: ["Copy of the report page showing the item"],
  ...over,
});

describe("composeLetter", () => {
  it("produces a letter that is ready when everything is present", () => {
    const out = composeLetter(input());
    expect(out.ready).toBe(true);
    expect(out.unresolved).toEqual([]);
    expect(out.subject).toContain("Factual dispute to the bureau");
    expect(out.blocks.join("\n")).toContain("Jordan Reyes");
    expect(out.blocks.join("\n")).toContain("TransUnion");
  });

  it("REFUSES to invent a dispute address", () => {
    const out = composeLetter(input({
      recipient: { name: "Experian", disputeAddress: null, cityStateZip: null },
    }));
    expect(out.ready).toBe(false);
    expect(out.unresolved.join(" ")).toContain("current dispute address for Experian");
    expect(out.blocks.join("\n")).toContain("VERIFY BEFORE MAILING");
  });

  it("catches a full account number before it is mailed", () => {
    const out = composeLetter(input({
      items: [{ ...input().items[0], label: "Account 4147202033445566" }],
    }));
    expect(out.unresolved.join(" ")).toContain("full account number");
  });

  it("catches an unfilled placeholder", () => {
    const out = composeLetter(input({ enclosures: ["[LIST EACH SUPPORTING DOCUMENT]"] }));
    expect(out.ready).toBe(false);
    expect(out.unresolved.join(" ")).toContain("Unfilled placeholder");
  });

  it("will not let an apparent finding be asserted", () => {
    const out = composeLetter(input({
      items: [{ ...input().items[0], findings: [apparent] }],
    }));
    expect(out.ready).toBe(false);
    expect(out.unresolved.join(" ")).toContain("nothing is confirmed");
    /* It is not discarded — it becomes a question instead. */
    expect(out.questions[0]).toContain("Only TransUnion is reporting");
    expect(out.questions[0]).toContain("Please explain");
  });

  it("keeps questions out of the assertions", () => {
    const out = composeLetter(input({
      items: [{ ...input().items[0], findings: [confirmed, apparent] }],
    }));
    expect(out.ready).toBe(true);
    expect(out.questions).toHaveLength(1);
  });

  it("refuses a letter that disputes nothing", () => {
    const out = composeLetter(input({ items: [] }));
    expect(out.ready).toBe(false);
    expect(out.unresolved.join(" ")).toContain("disputes nothing");
  });

  it("asks for what the round asks for, and cites its statute", () => {
    const out = composeLetter(input({ round: getRound(2)! }));
    const text = out.blocks.join("\n");
    expect(text).toContain("1681i(a)(6)(B)(iii)");
    expect(text).toContain("description of the procedure");
  });

  it("carries the standing blocks the library puts on every letter", () => {
    const out = composeLetter(input({ standingBlocks: ["Pursuant to 16 CFR 682.3, do not retain the enclosed identification."] }));
    expect(out.blocks.join("\n")).toContain("16 CFR 682.3");
  });
});

describe("the item table", () => {
  it("has the five columns that force a letter to be specific", () => {
    expect(ITEM_TABLE_HEADERS).toEqual([
      "Item disputed", "Currently reported as", "My records show", "Enclosed evidence", "Requested action",
    ]);
  });

  it("says so plainly when the consumer has no record and no document", () => {
    const rows = itemRows([{
      label: "Collection with XYZ ending in 9012", reportedAs: "Balance $412",
      requestedAction: "Delete", findings: [],
    }]);
    expect(rows[0]).toEqual([
      "Collection with XYZ ending in 9012", "Balance $412", "Not stated", "None enclosed", "Delete",
    ]);
  });
});

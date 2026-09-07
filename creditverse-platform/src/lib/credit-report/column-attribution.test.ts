/**
 * CR-2. The one rule these tests exist to hold:
 *
 *     COLUMN ORDER IS NOT BUREAU ORDER.
 *
 * A wrongly attributed column produces the sentence "Equifax says $1,400" out
 * of a layout guess, and that sentence would go into a letter. So attribution
 * happens only where the source's own header proves it, and everything else is
 * preserved with nobody's name attached.
 */
import { describe, expect, it } from "vitest";
import { attributeColumns, type FieldColumns } from "./column-attribution";
import { bureausInOrder } from "./pdf-report-parser";

const cols = (...columns: string[]): FieldColumns => ({
  value: columns[0] ?? "",
  differs: new Set(columns.map((c) => c.toLowerCase())).size > 1,
  columns,
});

describe("bureausInOrder reads the header's own order", () => {
  it("keeps the order the text names them, not a fixed list", () => {
    expect(bureausInOrder("TransUnion    Experian    Equifax")).toEqual(["TU", "EX", "EQ"]);
    expect(bureausInOrder("Equifax  TransUnion  Experian")).toEqual(["EQ", "TU", "EX"]);
  });

  it("reads two, and one", () => {
    expect(bureausInOrder("Experian   Equifax")).toEqual(["EX", "EQ"]);
    expect(bureausInOrder("Reported by: TransUnion")).toEqual(["TU"]);
  });

  it("finds none where none is named", () => {
    expect(bureausInOrder("Balance   $500   $520")).toEqual([]);
  });

  it("tolerates the spellings reports actually use", () => {
    expect(bureausInOrder("TRANS UNION | EXPERIAN | EQUIFAX")).toEqual(["TU", "EX", "EQ"]);
  });
});

describe("three named bureaus and three columns → attributed", () => {
  const fields = { balance: cols("$500", "$500", "$520"), status: cols("Open", "Open", "Closed") };

  it("attributes each column to the bureau the header put in that position", () => {
    const a = attributeColumns(fields, ["TU", "EX", "EQ"]);
    expect(a.reason).toBe("attributed");
    expect(a.attributed.get("TU")).toEqual({ balance: "$500", status: "Open" });
    expect(a.attributed.get("EX")).toEqual({ balance: "$500", status: "Open" });
    expect(a.attributed.get("EQ")).toEqual({ balance: "$520", status: "Closed" });
    expect(a.unattributed).toEqual({});
  });

  /* The test that would catch a fixed-list regression: reverse the header and
     the values must follow it. */
  it("follows the header when the header order changes", () => {
    const a = attributeColumns(fields, ["EQ", "EX", "TU"]);
    expect(a.attributed.get("EQ")).toMatchObject({ balance: "$500" });
    expect(a.attributed.get("TU")).toMatchObject({ balance: "$520" });
  });

  it("produces at most three rows", () => {
    expect(attributeColumns(fields, ["EQ", "EX", "TU"]).attributed.size).toBeLessThanOrEqual(3);
  });
});

describe("no trustworthy header → values preserved, unattributed", () => {
  const fields = { balance: cols("$500", "$500", "$520") };

  it("preserves the raw values rather than reducing them to 'columns differ'", () => {
    const a = attributeColumns(fields, []);
    expect(a.reason).toBe("no_header");
    expect(a.attributed.size).toBe(0);
    expect(a.unattributed).toEqual({ balance: ["$500", "$500", "$520"] });
  });

  it("refuses when only one bureau is named for three columns", () => {
    const a = attributeColumns(fields, ["EQ"]);
    expect(a.reason).toBe("one_bureau_named");
    expect(a.attributed.size).toBe(0);
    expect(a.unattributed.balance).toHaveLength(3);
  });

  it("refuses a header that names the same bureau twice", () => {
    const a = attributeColumns(fields, ["EQ", "EQ", "TU"]);
    expect(a.reason).toBe("duplicate_bureau");
    expect(a.attributed.size).toBe(0);
    expect(a.unattributed.balance).toHaveLength(3);
  });
});

describe("bureau count ≠ column count → unattributed", () => {
  it("refuses four columns under a three-bureau header", () => {
    const a = attributeColumns({ balance: cols("$1", "$2", "$3", "$4") }, ["EQ", "EX", "TU"]);
    expect(a.attributed.size).toBe(0);
    expect(a.unattributed.balance).toEqual(["$1", "$2", "$3", "$4"]);
  });

  it("refuses two columns under a three-bureau header", () => {
    const a = attributeColumns({ balance: cols("$1", "$2") }, ["EQ", "EX", "TU"]);
    expect(a.attributed.size).toBe(0);
    expect(a.unattributed.balance).toEqual(["$1", "$2"]);
  });

  /* Per FIELD, not per block: a row where all bureaus agree often prints one
     column while its neighbour prints three. */
  it("decides field by field, attributing what matches and preserving what does not", () => {
    const a = attributeColumns(
      { balance: cols("$1", "$2", "$3"), status: cols("Open", "Closed") },
      ["EQ", "EX", "TU"],
    );
    expect(a.attributed.get("EQ")).toEqual({ balance: "$1" });
    expect(a.attributed.get("TU")).toEqual({ balance: "$3" });
    expect(a.unattributed).toEqual({ status: ["Open", "Closed"] });
  });
});

describe("a single column changes nothing", () => {
  it("is neither attributed nor treated as ambiguous", () => {
    const a = attributeColumns({ balance: cols("$500") }, ["EQ", "EX", "TU"]);
    expect(a.reason).toBe("nothing_multi_column");
    expect(a.attributed.size).toBe(0);
    expect(a.unattributed).toEqual({});
  });

  /* A lone value is NOT evidence that all three bureaus said it — the account
     may be reported by one of them. Attributing it to all three would invent
     two facts. */
  it("does not spread one value across the named bureaus", () => {
    const a = attributeColumns({ balance: cols("$500") }, ["EQ", "EX", "TU"]);
    expect(a.attributed.get("EQ")).toBeUndefined();
    expect(a.attributed.get("EX")).toBeUndefined();
  });

  it("handles an empty field set", () => {
    expect(attributeColumns({}, ["EQ", "EX", "TU"]).attributed.size).toBe(0);
  });
});

describe("bureau identity is never inferred from position", () => {
  it("attributes nothing without a header, on any column count", () => {
    for (const n of [2, 3, 4, 5]) {
      const columns = Array.from({ length: n }, (_, i) => `$${i}`);
      const a = attributeColumns({ balance: cols(...columns) }, []);
      expect(a.attributed.size).toBe(0);
      expect(a.unattributed.balance).toEqual(columns);
    }
  });

  it("loses no value in any refusal path", () => {
    const columns = ["$500", "$500", "$520"];
    for (const header of [[], ["EQ"], ["EQ", "EQ", "TU"], ["EQ", "EX"]] as const) {
      const a = attributeColumns({ balance: cols(...columns) }, [...header]);
      const kept = a.unattributed.balance ?? [...(a.attributed.values())].map((f) => f.balance);
      expect(kept).toEqual(columns);
    }
  });
});

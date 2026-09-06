/**
 * The grid's value is that it can be checked in five seconds. These cover the
 * two ways it loses that: marking a difference that has an innocent
 * explanation, and describing a row in language that specifies nothing.
 */
import { describe, expect, it } from "vitest";
import { buildComparisonGrid, describeRow, markedFields } from "./metro2-field-codes";

const rec = (bureau: "EQ" | "EX" | "TU", values: Record<string, string | null>) => ({ bureau, values });

describe("buildComparisonGrid", () => {
  it("marks a date the bureaus genuinely disagree about", () => {
    const rows = buildComparisonGrid({ records: [
      rec("EQ", { openDate: "05/01/2022" }), rec("EX", { openDate: "05/01/2022" }), rec("TU", { openDate: "05/14/2022" }),
    ]});
    const opened = rows.find((r) => r.code === "BS-10")!;
    expect(opened.marked).toBe(true);
    expect(describeRow(opened)).toBe("Date Opened (BS-10): EQ 05/01/2022, EX 05/01/2022, TU 05/14/2022.");
  });

  it("leaves a field alone when all three agree", () => {
    const rows = buildComparisonGrid({ records: [
      rec("EQ", { balance: "$609.00" }), rec("EX", { balance: "$609.00" }), rec("TU", { balance: "$609.00" }),
    ]});
    expect(rows.find((r) => r.code === "BS-21")!.marked).toBe(false);
  });

  it("does NOT mark differently-masked account numbers", () => {
    const rows = buildComparisonGrid({ records: [
      rec("EQ", { accountNumberMasked: "****6004" }), rec("EX", { accountNumberMasked: "5178058*****" }),
    ]});
    const acct = rows.find((r) => r.code === "BS-7")!;
    expect(acct.marked).toBe(false);
    expect(acct.note).toContain("does not mean a different underlying number");
  });

  it("does NOT mark a zero high credit the bureau's own comment explains", () => {
    /* Straight from a real report: Equifax shows $0.00 high credit and says in
       its comments that the column carries the credit limit. Marking it is how
       a letter picks a fight it has already lost. */
    const rows = buildComparisonGrid({ records: [
      rec("EQ", { highBalance: "$0.00", remarks: "Credit card, Amount in H/C column is credit limit" }),
      rec("EX", { highBalance: "$681.00", remarks: null }),
      rec("TU", { highBalance: "$681.00", remarks: null }),
    ]});
    const hc = rows.find((r) => r.code === "BS-12")!;
    expect(hc.marked).toBe(false);
    expect(hc.note).toContain("Explained, not a defect");
  });

  it("…but does mark it when nothing explains the zero", () => {
    const rows = buildComparisonGrid({ records: [
      rec("EQ", { highBalance: "$0.00", remarks: null }),
      rec("EX", { highBalance: "$681.00", remarks: null }),
    ]});
    expect(rows.find((r) => r.code === "BS-12")!.marked).toBe(true);
  });

  it("names which bureau does not report a field at all", () => {
    const rows = buildComparisonGrid({ records: [
      rec("EQ", { paymentStatus: "Late 120 Days" }),
      rec("EX", { paymentStatus: "Late 150 Days" }),
      rec("TU", { paymentStatus: null }),
    ]});
    expect(describeRow(rows.find((r) => r.code === "BS-17B")!))
      .toBe("Payment Status (BS-17B): EQ Late 120 Days, EX Late 150 Days; not reported by TU.");
  });

  it("does not mistake a blank or a dash for a difference", () => {
    const rows = buildComparisonGrid({ records: [
      rec("EQ", { creditLimit: "$500.00" }), rec("EX", { creditLimit: "-" }), rec("TU", { creditLimit: "" }),
    ]});
    expect(rows.find((r) => r.code === "BS-11")!.marked).toBe(false);
  });

  it("returns only the rows worth writing about", () => {
    const rows = buildComparisonGrid({ records: [
      rec("EQ", { balance: "$609.00", paymentStatus: "Late 120 Days" }),
      rec("EX", { balance: "$609.00", paymentStatus: "Late 150 Days" }),
    ]});
    expect(markedFields(rows).map((r) => r.code)).toEqual(["BS-17B"]);
  });

  it("says nothing about a row it did not mark", () => {
    const rows = buildComparisonGrid({ records: [rec("EQ", { balance: "$1" }), rec("EX", { balance: "$1" })] });
    expect(describeRow(rows.find((r) => r.code === "BS-21")!)).toBeNull();
  });
});

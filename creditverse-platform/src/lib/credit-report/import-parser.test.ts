import { describe, expect, it } from "vitest";
import { parseBalanceCents, parseCreditReportCsv, splitCsvLine } from "./import-parser";

const HEADER = "name,kind,subtype,balance,status,bureaus,dofd,open_date,linked_creditor,remarks";

describe("credit report CSV import", () => {
  it("parses a valid export into items with stable account refs", () => {
    const r = parseCreditReportCsv(`${HEADER}\n"Capital One, N.A.",Account,Revolving,"$1,240",Open,EQ;EX;TU,,03/2021,,\nSYNCB/Amazon,Inquiry,,,Inquiry,EX,,,Amazon,`);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.items).toHaveLength(2);
    expect(r.items[0].name).toBe("Capital One, N.A.");
    expect(r.items[0].bureaus).toEqual(["EQ", "EX", "TU"]);
    expect(r.items[0].balanceCents).toBe(124000);
    expect(r.items[0].accountRef).toBe("capital one n a revolving");
    expect(r.items[1].linkedCreditor).toBe("Amazon");
  });

  it("refuses instead of guessing: unknown kind, bad bureau, non-numeric balance, by line", () => {
    const r = parseCreditReportCsv(`${HEADER}\nX,Loan,,abc,Open,ZZ,,,,`);
    expect(r.ok).toBe(false);
    const failures = "failures" in r ? r.failures : [];
    expect(failures.map((f) => f.line)).toEqual([2, 2, 2]);
    expect(failures.some((f) => /kind/.test(f.problem))).toBe(true);
    expect(failures.some((f) => /bureaus/.test(f.problem))).toBe(true);
    expect(failures.some((f) => /balance/.test(f.problem))).toBe(true);
  });

  it("requires the header columns", () => {
    const r = parseCreditReportCsv("name,status\nA,Open");
    expect(r.ok).toBe(false);
    const problems = "failures" in r ? r.failures.map((f) => f.problem).join(" ") : "";
    expect(problems).toMatch(/kind.*bureaus|bureaus.*kind/s);
  });

  it("helpers", () => {
    expect(splitCsvLine('a,"b,c","d""e",f')).toEqual(["a", "b,c", 'd"e', "f"]);
    expect(parseBalanceCents("$2,000.50")).toBe(200050);
    expect(parseBalanceCents("")).toBeNull();
    expect(parseBalanceCents("n/a")).toBeNaN();
  });
});

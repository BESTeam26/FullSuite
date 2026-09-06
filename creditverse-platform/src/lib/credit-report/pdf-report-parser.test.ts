import { describe, expect, it } from "vitest";
import { findScores, normalizeStatus, parseCreditReportPdfText } from "./pdf-report-parser";
import { groupIntoLines } from "./pdf-text";

const SAMPLE = `
Credit Report for Sample Consumer
Report date: 08/30/2026

Personal Information
Name: SAMPLE CONSUMER
Address: 12 Oak Street, Austin TX 78701
Previous Address: 5 Pine Ave, Dallas TX 75201
Employer: ACME LOGISTICS
SSN: XXX-XX-1234

Credit Scores
Equifax 655  Experian 671  TransUnion 648
VantageScore 3.0

Accounts
CAPITAL ONE BANK USA
Account #: 517805******1234
Account Type: Revolving
Date Opened: 04/12/2019
Balance: $1,240.50
Credit Limit: $3,000
Payment Status: Current
Comments: Pays as agreed

SANTANDER CONSUMER USA
Account Type: Auto Loan
Date Opened: 06/2021
Balance: $8,900  $8,900  $9,100
Payment Status: 60 days past due
Date of First Delinquency: 03/2025

Collections
MIDLAND CREDIT MANAGEMENT
Original Creditor: SYNCHRONY BANK
Balance: $612
Status: Collection account
Date Opened: 01/2024

Inquiries
CHASE CARD SERVICES   02/03/2026   Experian
ALLY FINANCIAL   11/20/2025   TransUnion

Public Records
Bankruptcy
Type: Chapter 7
Date Filed: 05/14/2022
Status: Discharged
Court: US Bankruptcy Court Western TX
`.split("\n");

describe("parseCreditReportPdfText", () => {
  const result = parseCreditReportPdfText(SAMPLE);
  const byKind = (kind: string) => result.candidates.filter((c) => c.kind === kind);

  it("recognises every section and the bureaus named in the document", () => {
    expect(result.sections).toEqual(["Personal Information", "Credit Scores", "Accounts", "Collections", "Inquiries", "Public Records"]);
    expect(result.bureaus).toEqual(["EQ", "EX", "TU"]);
  });

  it("reads accounts with normalised status, balance and dates", () => {
    const accounts = byKind("Account");
    expect(accounts.map((a) => a.name)).toEqual(["Capital One Bank Usa", "Santander Consumer Usa", "Midland Credit Management"]);
    const cap = accounts[0];
    expect(cap.status).toBe("Open");
    expect(cap.subtype).toBe("Revolving");
    expect(cap.balanceCents).toBe(124050);
    expect(cap.openDate).toBe("04/12/2019");
    expect(cap.confidence).toBe("high");
    expect(cap.accountRef).toMatch(/1234$/);
  });

  it("flags per-bureau columns that differ and keeps the first value", () => {
    const santander = byKind("Account")[1];
    expect(santander.status).toBe("Late Payment");
    expect(santander.balance).toBe("$8,900");
    expect(santander.dofd).toBe("03/2025");
    expect(santander.confidence).toBe("review");
    expect(santander.remarks).toContain("Bureau columns differ");
  });

  it("treats the collections section as collection accounts", () => {
    const midland = byKind("Account")[2];
    expect(midland.subtype).toBe("Collection");
    expect(midland.status).toBe("Collection");
    expect(midland.balanceCents).toBe(61200);
  });

  it("reads one-line inquiries with their date and bureau", () => {
    const inquiries = byKind("Inquiry");
    expect(inquiries).toHaveLength(2);
    expect(inquiries[0]).toMatchObject({ name: "Chase Card Services", openDate: "02/03/2026", bureaus: ["EX"], confidence: "high" });
    expect(inquiries[1].bureaus).toEqual(["TU"]);
  });

  it("reads public records for review, never as high confidence", () => {
    const records = byKind("Public Record");
    expect(records).toHaveLength(1);
    expect(records[0]).toMatchObject({ subtype: "Chapter 7", openDate: "05/14/2022", confidence: "review" });
    expect(records[0].remarks).toContain("Court");
  });

  it("extracts personal items but never identifiers", () => {
    const personal = byKind("Personal");
    expect(personal.map((p) => p.subtype)).toEqual(["Name", "Address", "Previous address", "Employer"]);
    expect(JSON.stringify(result.candidates)).not.toContain("1234-");
    expect(result.candidates.some((c) => /SSN|XXX-XX/.test(c.name))).toBe(false);
  });

  it("reads scores next to the bureau names with the model found", () => {
    expect(result.scores).toEqual([
      { bureau: "EQ", model: "VantageScore 3.0", score: 655 },
      { bureau: "EX", model: "VantageScore 3.0", score: 671 },
      { bureau: "TU", model: "VantageScore 3.0", score: 648 },
    ]);
  });

  it("counts what it consumed against the whole document", () => {
    expect(result.consumedLines).toBeGreaterThan(20);
    expect(result.consumedLines).toBeLessThanOrEqual(result.totalLines);
  });

  it("reads a flat export without section headers as review-only accounts", () => {
    const flat = ["DISCOVER BANK", "Balance: $200", "Status: Open", "Date Opened: 01/01/2020"];
    const r = parseCreditReportPdfText(flat);
    expect(r.candidates).toHaveLength(1);
    expect(r.candidates[0].confidence).toBe("review");
    expect(r.bureaus).toEqual([]);
  });

  it("returns nothing for text that is not a report", () => {
    expect(parseCreditReportPdfText(["Invoice", "Total due: $40"]).candidates).toEqual([]);
  });
});

describe("normalizeStatus", () => {
  it("maps report wording onto the classifier vocabulary", () => {
    expect(normalizeStatus("Charged off as bad debt")).toBe("Charge-Off");
    expect(normalizeStatus("Pays account as agreed")).toBe("Open");
    expect(normalizeStatus("Paid, Closed")).toBe("Paid / Closed");
    expect(normalizeStatus("30 days late")).toBe("Late Payment");
    expect(normalizeStatus("Account transferred")).toBe("Closed");
    expect(normalizeStatus("Something unusual")).toBeNull();
  });
});

describe("findScores", () => {
  it("ignores dates, reads a number before the bureau, and skips a bureau with no number", () => {
    expect(findScores(["Experian 05/01/2026 702", "648 TransUnion", "Equifax as of 2026"], "FICO 8")).toEqual([
      { bureau: "EX", model: "FICO 8", score: 702 },
      { bureau: "TU", model: "FICO 8", score: 648 },
    ]);
  });
});

describe("groupIntoLines", () => {
  it("joins fragments on one baseline, top of page first, wide gaps as columns", () => {
    const lines = groupIntoLines([
      { str: "Balance:", x: 10, y: 700, width: 40 },
      { str: "$500", x: 52, y: 700.8, width: 20 },
      { str: "$520", x: 120, y: 699.6, width: 20 },
      { str: "CAPITAL ONE", x: 10, y: 720, width: 60 },
      { str: " ", x: 0, y: 500, width: 2 },
    ]);
    expect(lines).toEqual(["CAPITAL ONE", "Balance: $500  $520"]);
  });
});

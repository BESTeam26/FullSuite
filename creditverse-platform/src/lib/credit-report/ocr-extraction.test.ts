import { describe, expect, it } from "vitest";
import { OCR_PROMPT, OCR_SYSTEM_PROMPT, ocrFileProblem, parseOcrAnswer } from "./ocr-extraction";

const answer = (body: unknown) => JSON.stringify(body);

describe("parseOcrAnswer", () => {
  it("reads items into review candidates with the classifier's status vocabulary", () => {
    const r = parseOcrAnswer(answer({
      items: [
        { name: "CAPITAL ONE", kind: "Account", subtype: "Revolving", status: "Pays as agreed", balance: "$1,240.50", bureaus: ["EQ", "eq", "XX", "TU"], openDate: "04/12/2019", accountRef: "1234" },
        { name: "CHASE", kind: "Inquiry", bureaus: ["EX"] },
      ],
      scores: [{ bureau: "EQ", model: "FICO 8", score: 655 }],
    }));
    expect(r.candidates).toHaveLength(2);
    expect(r.candidates[0]).toMatchObject({ name: "CAPITAL ONE", status: "Open", balanceCents: 124050, confidence: "review" });
    expect(r.candidates[0].bureaus).toEqual(["EQ", "EQ", "TU"]);
    expect(r.candidates[0].accountRef).toMatch(/1234$/);
    expect(r.candidates[1].status).toBe("Inquiry");
    expect(r.scores).toEqual([{ bureau: "EQ", model: "FICO 8", score: 655 }]);
  });

  it("keeps the printed status when the wording is not recognised", () => {
    const r = parseOcrAnswer(answer({ items: [{ name: "ACME", kind: "Account", status: "Something unusual" }] }));
    expect(r.candidates[0].status).toBe("Something unusual");
  });

  it("marks every candidate for review, whatever the model says", () => {
    const r = parseOcrAnswer(answer({ items: [{ name: "ACME", kind: "Account", status: "Open", confidence: "high" }] }));
    expect(r.candidates[0].confidence).toBe("review");
  });

  it("skips rows it cannot use and says why", () => {
    const r = parseOcrAnswer(answer({ items: [{ kind: "Account" }, { name: "ACME", kind: "Tradeline" }] }));
    expect(r.candidates).toEqual([]);
    expect(r.skipped).toHaveLength(2);
    expect(r.skipped[1]).toContain("not recognised");
  });

  it("drops anything that looks like a personal identifier", () => {
    const r = parseOcrAnswer(answer({ items: [{ name: "123-45-6789", kind: "Personal" }, { name: "(512) 555-0134", kind: "Personal" }] }));
    expect(r.candidates).toEqual([]);
    expect(r.skipped.every((s) => s.includes("identifier"))).toBe(true);
  });

  it("ignores scores outside the usable range and unknown bureaus", () => {
    const r = parseOcrAnswer(answer({ items: [], scores: [{ bureau: "EQ", score: 12 }, { bureau: "ZZ", score: 700 }, { bureau: "TU", score: 700 }] }));
    expect(r.scores).toEqual([{ bureau: "TU", model: "as stated on report", score: 700 }]);
  });

  it("refuses an answer that is not JSON", () => {
    expect(parseOcrAnswer("I could not read that file.").candidates).toEqual([]);
    expect(parseOcrAnswer("I could not read that file.").skipped[0]).toMatch(/could not use/);
  });

  it("reads JSON even when the model wraps it in prose", () => {
    const r = parseOcrAnswer('Here you go:\n```json\n{"items":[{"name":"ACME","kind":"Account","status":"Open"}]}\n```');
    expect(r.candidates).toHaveLength(1);
  });

  it("says so when the file held no report items", () => {
    expect(parseOcrAnswer(answer({ items: [] })).skipped[0]).toMatch(/No credit report items/);
  });
});

describe("the instructions given to the model", () => {
  it("forbid inference and identifiers, and ask for JSON only", () => {
    expect(OCR_SYSTEM_PROMPT).toMatch(/never infer/i);
    expect(OCR_SYSTEM_PROMPT).toMatch(/Social Security/i);
    expect(OCR_SYSTEM_PROMPT).toMatch(/JSON only/i);
    expect(OCR_PROMPT).toMatch(/Skip Social Security numbers/);
  });
});

describe("ocrFileProblem", () => {
  const file = (type: string, size: number) => ({ type, size }) as File;
  it("accepts a PDF or a photo under the cap", () => {
    expect(ocrFileProblem(file("application/pdf", 1_000_000))).toBeNull();
    expect(ocrFileProblem(file("image/jpeg", 1_000_000))).toBeNull();
    expect(ocrFileProblem(file("text/csv", 1000))).toMatch(/PDF or a photo/);
    expect(ocrFileProblem(file("application/pdf", 9_000_000))).toMatch(/7 MB/);
  });
});

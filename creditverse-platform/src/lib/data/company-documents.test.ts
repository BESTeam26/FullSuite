import { describe, expect, it } from "vitest";
import { MAX_DOCUMENT_BYTES, documentProblem } from "./company-documents";

const file = (size: number) => ({ size, name: "handbook.pdf", type: "application/pdf" }) as File;

describe("documentProblem", () => {
  it("accepts an ordinary document", () => {
    expect(documentProblem(file(500_000))).toBeNull();
  });

  it("refuses an empty file and one over the cap", () => {
    expect(documentProblem(file(0))).toMatch(/empty/);
    expect(documentProblem(file(MAX_DOCUMENT_BYTES + 1))).toMatch(/25 MB/);
    expect(documentProblem(file(MAX_DOCUMENT_BYTES))).toBeNull();
  });
});

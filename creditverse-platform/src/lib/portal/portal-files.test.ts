import { describe, expect, it } from "vitest";
import { groupPartnerFiles, isReport, partnerUploadPath, type PartnerPortalFile } from "./portal-files";

const f = (id: string, name: string, fromPartner = false): PartnerPortalFile => ({
  id, name, path: `agency/partner/g1/${id}`, mimeType: null, sizeBytes: null, createdAt: "2026-10-01T00:00:00Z", sharedAt: null, fromPartner,
});

describe("the partner's files, grouped", () => {
  it("keeps the partner's own uploads apart from what BES shared", () => {
    const g = groupPartnerFiles([f("a", "Logo.png", true), f("b", "Onboarding guide.pdf"), f("c", "Progress Report - August.pdf")]);
    expect(g.uploads.map((x) => x.id)).toEqual(["a"]);
    expect(g.documents.map((x) => x.id)).toEqual(["b"]);
    expect(g.reports.map((x) => x.id)).toEqual(["c"]);
  });
  it("calls something a report only when it is named one", () => {
    expect(isReport("Monthly reports Sept.pdf")).toBe(true);
    expect(isReport("reporting-logins.txt")).toBe(false);
  });
});

describe("where a partner upload goes", () => {
  it("is the partner's own uploads folder, with a fresh name and the original extension", () => {
    expect(partnerUploadPath("g1", "My File.PDF", "u1")).toBe("agency/partner/g1/uploads/u1.PDF");
    expect(partnerUploadPath("g1", "noext", "u2")).toBe("agency/partner/g1/uploads/u2");
  });
});

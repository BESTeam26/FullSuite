import { describe, it, expect } from "vitest";
import {
  detectReinsertions,
  getActiveCRAAddress,
  buildIdentityTheftChecklist,
  type ReportSnapshot,
} from "./cra-addresses-and-workflows";

const snap = (date: string, accountIds: string[]): ReportSnapshot => ({ date, accountIds });

describe("detectReinsertions", () => {
  it("flags an account that disappears and later reappears", () => {
    const findings = detectReinsertions([
      snap("2026-06-01", ["A", "B"]),
      snap("2026-07-01", ["A"]),
      snap("2026-08-01", ["A", "B"]),
    ]);
    expect(findings).toHaveLength(1);
    expect(findings[0]).toMatchObject({
      accountId: "B",
      wasDeleted: true,
      reappeared: true,
      deletionDate: "2026-07-01",
      reappearanceDate: "2026-08-01",
      consumerNotifiedWithin5BusinessDays: false,
      furnisherCertified: false,
    });
    expect(findings[0].alert).toMatch(/§1681i\(a\)\(5\)\(B\)-\(C\)/);
  });

  it("returns nothing for a plain deletion or a stable report", () => {
    expect(
      detectReinsertions([snap("d1", ["A", "B"]), snap("d2", ["A"])]),
    ).toEqual([]);
    expect(
      detectReinsertions([snap("d1", ["A", "B"]), snap("d2", ["A", "B"])]),
    ).toEqual([]);
  });

  it("does not treat a brand-new account as a reinsertion", () => {
    expect(detectReinsertions([snap("d1", ["A"]), snap("d2", ["A", "C"])])).toEqual([]);
  });

  it("records the most recent deletion even when snapshots are skipped", () => {
    const findings = detectReinsertions([
      snap("d1", ["A"]),
      snap("d2", []),
      snap("d3", []),
      snap("d4", ["A"]),
    ]);
    expect(findings).toHaveLength(1);
    expect(findings[0].deletionDate).toBe("d2");
    expect(findings[0].reappearanceDate).toBe("d4");
  });

  it("reports each delete/reappear cycle separately", () => {
    const findings = detectReinsertions([
      snap("d1", ["A"]),
      snap("d2", []),
      snap("d3", ["A"]),
      snap("d4", []),
      snap("d5", ["A"]),
    ]);
    expect(findings.map((f) => [f.deletionDate, f.reappearanceDate])).toEqual([
      ["d2", "d3"],
      ["d4", "d5"],
    ]);
  });
});

describe("getActiveCRAAddress", () => {
  it("returns Experian as upload-only and unknown bureaus as null", () => {
    expect(getActiveCRAAddress("Experian")?.handling).toBe("upload-only");
    expect(getActiveCRAAddress("Equifax")?.handling).toBe("mail");
    expect(getActiveCRAAddress("Innovis")).toBeNull();
  });
});

describe("buildIdentityTheftChecklist", () => {
  it("is ready only when all four §1681c-2 prerequisites are met", () => {
    expect(buildIdentityTheftChecklist().ready).toBe(false);
    expect(buildIdentityTheftChecklist().blockingDeadlineBusinessDays).toBe(4);
    const partial = buildIdentityTheftChecklist({
      proofOfIdentity: true,
      identityTheftReport: true,
      disputedInfoIdentified: true,
    });
    expect(partial.ready).toBe(false);
    const full = buildIdentityTheftChecklist({
      proofOfIdentity: true,
      identityTheftReport: true,
      disputedInfoIdentified: true,
      consumerStatementProvided: true,
      ready: false, // caller cannot force readiness
    });
    expect(full.ready).toBe(true);
  });
});

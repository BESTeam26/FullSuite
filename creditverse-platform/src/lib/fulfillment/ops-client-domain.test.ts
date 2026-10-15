/**
 * ONE EMAIL = ONE FILE PER PARTNER, checked against the clients already
 * loaded. Dee, 2026-10-15: "FIX THE ADD CLIENT HERE. IT's not working!" —
 * the check threw on a neighbour with no email (498 imported clients have
 * none) and the click died before any request was made.
 */
import { describe, expect, it } from "vitest";
import { checkClientConflict, normalizeEmail, type OpsClient } from "./ops-client-domain";

const client = (id: string, email: string | null, outsourcingGroupId: string): OpsClient =>
  ({ id, name: id, email, mode: "outsourcing_only", outsourcingGroupId, outsourcingGroupName: outsourcingGroupId, status: "x" } as unknown as OpsClient);

describe("normalizeEmail", () => {
  it("trims and lower-cases, and treats a missing email as empty", () => {
    expect(normalizeEmail("  Jane@Example.com ")).toBe("jane@example.com");
    expect(normalizeEmail(null)).toBe("");
    expect(normalizeEmail(undefined)).toBe("");
  });
});

describe("checkClientConflict", () => {
  const nainoa = "grp-nainoa", vanquish = "grp-vanquish";
  const loaded = [
    client("no-email-1", null, nainoa),
    client("no-email-2", "", nainoa),
    client("aaron", "aaron@example.com", nainoa),
    client("aaron-elsewhere", "AARON@example.com", vanquish),
  ];

  it("does not throw on neighbours without an email, and never matches them", () => {
    const r = checkClientConflict("leslie@example.com", nainoa, loaded);
    expect(r.sameScopeDuplicate).toBeUndefined();
    expect(r.crossScopeMatches).toEqual([]);
  });

  it("hard-blocks the same email on the same partner, case-insensitively", () => {
    const r = checkClientConflict(" Aaron@Example.com", nainoa, loaded);
    expect(r.sameScopeDuplicate?.id).toBe("aaron");
    expect(r.crossScopeMatches.map((c) => c.id)).toEqual(["aaron-elsewhere"]);
  });

  it("an empty candidate email matches nothing, not even the clients without one", () => {
    expect(checkClientConflict("", nainoa, loaded)).toEqual({ crossScopeMatches: [] });
  });
});

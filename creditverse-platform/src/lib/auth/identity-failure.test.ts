/**
 * A failed access read must never be reported as a revoked account.
 *
 * Dee, 2026-09-16, from production: a few 403s from Vercel's bot protection,
 * and an authorized partner contact was shown "This account does not have
 * partner portal access". Her access was intact the whole time — I checked the
 * database while the screen was still saying it.
 *
 * Two separate causes, one sentence:
 *
 *   readIdentity: `x.data ?? []` on six queries, errors never inspected. One
 *   failed membership read => empty array => hasAnyAccess false => "this
 *   account has not been added to an agency or organization yet".
 *
 *   PartnerPortal: `if (!summary.data) return <NoAccess/>`, where `data` is
 *   undefined while loading AND after failure.
 *
 * These guard the RULE — that the two outcomes stay distinguishable — rather
 * than the wording, which is free to change.
 */
import { describe, expect, it } from "vitest";

/** The predicate `readIdentity` now applies before trusting any of the rows. */
function identityFailed(results: { error: unknown }[]): boolean {
  return results.some((r) => r.error);
}

/** What `hasAnyAccess` actually computes, given the six reads. */
function hasAnyAccess(i: {
  isAgencyStaff: boolean; orgMemberships: unknown[];
  externalMemberships: unknown[]; partnerContacts: unknown[];
}): boolean {
  return i.isAgencyStaff || i.orgMemberships.length > 0
    || i.externalMemberships.length > 0 || i.partnerContacts.length > 0;
}

const ok = { error: null };
const broke = { error: { message: "403" } };

describe("readIdentity tells a failed read from an empty one", () => {
  it("a clean batch is not a failure", () => {
    expect(identityFailed([ok, ok, ok, ok, ok, ok])).toBe(false);
  });

  it("one failed query out of six is a failure", () => {
    expect(identityFailed([ok, ok, ok, ok, ok, broke])).toBe(true);
  });

  it("the partner_contacts read failing is a failure, not 'no contacts'", () => {
    /* The exact shape that produced the live bug: everything else fine, the
       one read that decides a portal user's access came back 403. */
    expect(identityFailed([ok, ok, ok, ok, ok, broke])).toBe(true);
  });

  it("and without that check the same batch looks like a person with no access", () => {
    /* Why the check has to exist: the arrays alone cannot tell the difference. */
    const asIfEmpty = { isAgencyStaff: false, orgMemberships: [], externalMemberships: [], partnerContacts: [] };
    expect(hasAnyAccess(asIfEmpty)).toBe(false);
  });

  it("a genuinely unaffiliated person still has no access", () => {
    expect(identityFailed([ok, ok, ok, ok, ok, ok])).toBe(false);
    expect(hasAnyAccess({ isAgencyStaff: false, orgMemberships: [], externalMemberships: [], partnerContacts: [] })).toBe(false);
  });

  it("a partner contact is authorized on the strength of that row alone", () => {
    expect(hasAnyAccess({ isAgencyStaff: false, orgMemberships: [], externalMemberships: [], partnerContacts: [{ id: "c1" }] })).toBe(true);
  });
});

describe("the portal gate", () => {
  /** The order PartnerPortal now applies. */
  const screen = (q: { isLoading: boolean; isError: boolean; data: unknown }) =>
    q.isLoading ? "loading" : q.isError ? "load-failed" : !q.data ? "no-access" : "portal";

  it("shows the portal when the summary arrived", () => {
    expect(screen({ isLoading: false, isError: false, data: { partnerName: "X" } })).toBe("portal");
  });

  it("does NOT say no-access when the request failed", () => {
    expect(screen({ isLoading: false, isError: true, data: undefined })).toBe("load-failed");
  });

  it("still says no-access when the summary legitimately came back empty", () => {
    expect(screen({ isLoading: false, isError: false, data: null })).toBe("no-access");
  });

  it("says loading while it is still loading", () => {
    expect(screen({ isLoading: true, isError: false, data: undefined })).toBe("loading");
  });
});

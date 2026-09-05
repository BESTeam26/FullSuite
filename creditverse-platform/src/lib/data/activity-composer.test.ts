/**
 * What each author may publish, and what the composer offers.
 *
 * These cover the rule the picker relies on. The database enforces the same
 * thing in the `activity_events` insert policy — verified against the live
 * project — so a mismatch here means a user is offered an option that would be
 * refused, not that the data is exposed.
 */
import { describe, expect, it } from "vitest";
import {
  allowedVisibilities,
  DEFAULT_VISIBILITY,
  mayPostAs,
  VISIBILITY_LABEL,
  ORG_FACING_VISIBILITY_LABEL,
  type ActivityVisibility,
} from "@/lib/data/activity";

const ALL: ActivityVisibility[] = [
  "bes_internal",
  "organization_internal",
  "shared_with_partner",
  "client_visible",
];

describe("the default", () => {
  it("is BES Internal — never auto-publish", () => {
    expect(DEFAULT_VISIBILITY).toBe("bes_internal");
  });

  it("is the first option a BES author sees, so the safe choice is preselected", () => {
    expect(allowedVisibilities("bes", true)[0]).toBe("bes_internal");
  });
});

describe("BES authors", () => {
  it("may post internal, shared and client-visible when engaged", () => {
    expect(allowedVisibilities("bes", true)).toEqual([
      "bes_internal",
      "shared_with_partner",
      "client_visible",
    ]);
  });

  it("may NEVER post as the organization's internal voice", () => {
    expect(allowedVisibilities("bes", true)).not.toContain(
      "organization_internal",
    );
    expect(mayPostAs("bes", true, "organization_internal")).toBe(false);
  });

  it("loses 'shared with partner' without a live engagement", () => {
    // There is no partner to share with, so the option is not offered.
    expect(allowedVisibilities("bes", false)).toEqual([
      "bes_internal",
      "client_visible",
    ]);
    expect(mayPostAs("bes", false, "shared_with_partner")).toBe(false);
  });
});

describe("organization authors", () => {
  it("may post their own internal notes, shared and client-visible", () => {
    expect(allowedVisibilities("organization", true)).toEqual([
      "organization_internal",
      "shared_with_partner",
      "client_visible",
    ]);
  });

  it("may NEVER post a BES internal note", () => {
    expect(allowedVisibilities("organization", true)).not.toContain(
      "bes_internal",
    );
    expect(mayPostAs("organization", true, "bes_internal")).toBe(false);
  });

  it("loses 'shared with partner' without a live engagement", () => {
    expect(allowedVisibilities("organization", false)).toEqual([
      "organization_internal",
      "client_visible",
    ]);
  });
});

describe("client visibility", () => {
  it("is offered to both authors but is never the default", () => {
    expect(allowedVisibilities("bes", true)).toContain("client_visible");
    expect(allowedVisibilities("organization", true)).toContain("client_visible");
    expect(DEFAULT_VISIBILITY).not.toBe("client_visible");
  });

  it("requires explicit selection — it is never first in the list", () => {
    for (const author of ["bes", "organization"] as const) {
      for (const engaged of [true, false]) {
        expect(allowedVisibilities(author, engaged)[0]).not.toBe(
          "client_visible",
        );
      }
    }
  });
});

describe("unauthorized levels are rejected", () => {
  it.each([
    ["bes", "organization_internal"],
    ["organization", "bes_internal"],
  ] as const)("%s cannot post %s", (author, level) => {
    expect(mayPostAs(author, true, level)).toBe(false);
  });

  it("rejects every level an author is not offered", () => {
    for (const author of ["bes", "organization"] as const) {
      for (const engaged of [true, false]) {
        const offered = allowedVisibilities(author, engaged);
        for (const level of ALL) {
          expect(mayPostAs(author, engaged, level)).toBe(
            offered.includes(level),
          );
        }
      }
    }
  });
});

describe("labels", () => {
  it("names every level, so no picker option renders blank", () => {
    for (const level of ALL) {
      expect(VISIBILITY_LABEL[level]).toBeTruthy();
      expect(ORG_FACING_VISIBILITY_LABEL[level]).toBeTruthy();
      expect(ORG_FACING_VISIBILITY_LABEL[level]).not.toMatch(/BES Internal|Shared \(BES/);
    }
  });
});

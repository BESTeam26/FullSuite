/**
 * The partner highlighted while a client is open comes from the record.
 *
 * Dee, 2026-09-29: "if Aaron Rubio belongs to Credit by Nainoa, Credit by
 * Nainoa should remain selected/highlighted while Aaron's workspace is open."
 */
import { describe, expect, it } from "vitest";
import { partnerForClient } from "./creditops-case-selection";

const partners = [
  { id: "p-nainoa", scopeId: "g-nainoa" },
  { id: "p-vanquish", scopeId: "g-vanquish" },
];
/* `mode` decides the scope (`clientGroupKey`): a `saas_pulled` file belongs
   to its organization, an outsourcing file to its group. The provenance
   vocabulary from rule 2 — the same words the store carries. */
const clients = [
  { id: "aaron", mode: "outsourcing_only" as const, organizationId: null, outsourcingGroupId: "g-nainoa" },
  { id: "bea", mode: "outsourcing_only" as const, organizationId: null, outsourcingGroupId: "g-vanquish" },
  /* An organization-owned file: its scope is the organization, not a group. */
  { id: "org-client", mode: "saas_pulled" as const, organizationId: "g-vanquish", outsourcingGroupId: null },
];

describe("partnerForClient", () => {
  it("highlights the partner the open client belongs to", () => {
    expect(partnerForClient(clients, partners, "aaron"))
      .toEqual({ kind: "partner", partnerId: "p-nainoa" });
    expect(partnerForClient(clients, partners, "bea"))
      .toEqual({ kind: "partner", partnerId: "p-vanquish" });
  });

  it("resolves an organization-owned file through its organization scope", () => {
    expect(partnerForClient(clients, partners, "org-client"))
      .toEqual({ kind: "partner", partnerId: "p-vanquish" });
  });

  it("returns null rather than a wrong highlight when the client is not in the store yet", () => {
    /* The caller falls back to the URL selection, so the tree never goes
       empty while the store fills. A guess here would flash the wrong
       partner. */
    expect(partnerForClient(clients, partners, "not-loaded")).toBeNull();
    expect(partnerForClient([], partners, "aaron")).toBeNull();
  });

  it("returns null when there is no open client", () => {
    expect(partnerForClient(clients, partners, null)).toBeNull();
    expect(partnerForClient(clients, partners, undefined)).toBeNull();
  });

  it("returns null when the client's partner is not one the viewer has", () => {
    /* RLS may show a client whose partner folder the viewer cannot see.
       Highlighting nothing is honest; inventing a folder is not. */
    expect(partnerForClient(clients, [partners[0]], "bea")).toBeNull();
  });
});

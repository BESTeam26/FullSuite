import { describe, expect, it } from "vitest";
import { actionKindLabel, actionLinkLabel, sortByKindThenDate } from "./action-kinds";

describe("what a partner is asked for", () => {
  it("names each of the eight kinds in the partner's words", () => {
    expect(actionKindLabel("document_required")).toBe("Missing document");
    expect(actionKindLabel("client_confirmation")).toBe("Client confirmation needed");
    expect(actionKindLabel("content_approval")).toBe("Approval needed");
    expect(actionKindLabel("monitoring_login")).toBe("Monitoring login needed");
    expect(actionKindLabel("billing")).toBe("Billing action");
    expect(actionKindLabel("signature")).toBe("Agreement to sign");
    expect(actionKindLabel("project_approval")).toBe("Project approval");
    expect(actionKindLabel("information_request")).toBe("Information request");
    expect(actionKindLabel("whatever")).toBe("Action needed");
  });
  it("puts money and signatures first, newest first within a kind", () => {
    const rows = [
      { kind: "question", requestedAt: "2026-10-01" }, { kind: "billing", requestedAt: "2026-09-01" },
      { kind: "signature", requestedAt: "2026-09-15" }, { kind: "billing", requestedAt: "2026-09-20" },
    ];
    expect(sortByKindThenDate(rows).map((r) => `${r.kind}:${r.requestedAt}`)).toEqual([
      "billing:2026-09-20", "billing:2026-09-01", "signature:2026-09-15", "question:2026-10-01",
    ]);
    expect(actionLinkLabel("signature")).toBe("Review and sign");
  });
});

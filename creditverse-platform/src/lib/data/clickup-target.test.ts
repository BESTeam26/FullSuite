/**
 * What a partner's stored ClickUp link means.
 *
 * Getting this wrong does not fail loudly — it imports the wrong partner's
 * clients, or refuses a link that is perfectly good. Both have happened:
 * "Approve with Tiff" had the CreditOps SPACE id stored as its list, and a
 * partner linked by VIEW had an import button that could never run because
 * only the list form was accepted.
 */
import { describe, expect, it } from "vitest";
import { importTargetFromSourceRef } from "./clickup-import";

describe("the stored ClickUp reference", () => {
  it("reads a list", () => {
    expect(importTargetFromSourceRef("clickup:list:901821115879"))
      .toEqual({ kind: "list", id: "901821115879" });
  });

  it("reads a view, which is what a pasted URL usually produces", () => {
    /* `/v/l/rk9kb-22578` is the tab somebody was looking at; only `/v/li/…`
       carries a list id. Refusing this shape left two of Dee's partners with
       a button that did nothing. */
    expect(importTargetFromSourceRef("clickup:view:rk9kb-22578"))
      .toEqual({ kind: "view", id: "rk9kb-22578" });
  });

  it("is nothing when the partner has no link", () => {
    expect(importTargetFromSourceRef(null)).toBeNull();
    expect(importTargetFromSourceRef("")).toBeNull();
  });

  it("refuses a shape it does not recognise rather than guessing", () => {
    /* A bare number could be a list, a folder or a space, and importing a
       whole folder into one partner is the failure this file exists to stop. */
    expect(importTargetFromSourceRef("901821115879")).toBeNull();
    expect(importTargetFromSourceRef("clickup:space:90180566841")).toBeNull();
    expect(importTargetFromSourceRef("https://app.clickup.com/25798251/v/l/rk9kb-22578")).toBeNull();
  });
});

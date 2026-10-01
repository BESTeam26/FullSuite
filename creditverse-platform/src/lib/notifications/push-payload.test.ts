import { describe, expect, it } from "vitest";
import { pushPayloadFor } from "./push-payload";

describe("a push message", () => {
  it("carries the title, the detail and the page that opens the subject", () => {
    expect(pushPayloadFor({ id: 7, kind: "reminder", title: "Submit your End of Day", detail: "Due by 7:00 PM ET.", entity_type: "eod_day", entity_id: "2026-10-01:eod" }))
      .toEqual({ title: "Submit your End of Day", body: "Due by 7:00 PM ET.", url: "/app/eod", tag: "fullsuite-7", notificationId: 7 });
    expect(pushPayloadFor({ id: 8, kind: "dm", title: "Daniel sent you a direct message", detail: null, entity_type: "channel", entity_id: "abc" }).url).toBe("/app/channels?channel=abc");
  });
  it("falls back to the Notifications page when nothing opens the subject", () => {
    expect(pushPayloadFor({ id: 9, kind: "unassigned", title: "x", detail: null, entity_type: "work_item", entity_id: "w" }).url).toBe("/app/notifications");
  });
});

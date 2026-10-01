import { describe, expect, it } from "vitest";
import { summarisePushEvents, type PushDeliveryEvent } from "./push-delivery";

const at = (hoursAgo: number, kind: PushDeliveryEvent["kind"], id: number): PushDeliveryEvent =>
  ({ id, kind, detail: null, createdAt: new Date(Date.UTC(2026, 9, 1, 12 - hoursAgo)).toISOString(), notificationId: null, userId: null });

describe("push delivery health", () => {
  it("counts each kind for the last day and the last week, newest first for the list", () => {
    const now = new Date(Date.UTC(2026, 9, 1, 12));
    const s = summarisePushEvents([at(1, "failed_send", 3), at(30, "failed_send", 2), at(2, "device_gone", 1), at(100, "unauthorized", 0)], now);
    expect(s.last24h).toEqual({ failed_send: 1, device_gone: 1, unauthorized: 0, function_error: 0, dispatch_error: 0 });
    expect(s.last7d).toEqual({ failed_send: 2, device_gone: 1, unauthorized: 1, function_error: 0, dispatch_error: 0 });
    expect(s.recent.map((e) => e.id)).toEqual([3, 2, 1, 0]);
  });
});

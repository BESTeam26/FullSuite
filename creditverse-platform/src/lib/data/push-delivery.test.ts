import { describe, expect, it } from "vitest";
import { describeDevice, summarisePushEvents, type PushDeliveryEvent } from "./push-delivery";

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

describe("naming a device from its browser string", () => {
  it("says the browser and the system in plain words", () => {
    expect(describeDevice("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/129.0 Safari/537.36")).toBe("Chrome on Windows");
    expect(describeDevice("Mozilla/5.0 (Windows NT 10.0) Chrome/129.0 Safari/537.36 Edg/129.0")).toBe("Edge on Windows");
    expect(describeDevice("Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605 Version/17.0 Mobile/15E148 Safari/604.1")).toBe("Safari on iPhone");
    expect(describeDevice("Mozilla/5.0 (Macintosh; Intel Mac OS X 14_0) AppleWebKit/605 Version/17.0 Safari/605")).toBe("Safari on Mac");
    expect(describeDevice("Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 Chrome/129.0 Mobile Safari/537.36")).toBe("Chrome on Android");
    expect(describeDevice(null)).toBe("Unknown device");
  });
});


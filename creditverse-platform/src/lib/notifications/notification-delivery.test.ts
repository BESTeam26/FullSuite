import { describe, expect, it } from "vitest";
import { badgedTitle, describeForAlert, nativePermission, shouldNotifyNatively, soundEnabled } from "./notification-delivery";

describe("delivering a notification to an open app", () => {
  it("raises a desktop notification only when the person is not looking, and only with permission", () => {
    expect(shouldNotifyNatively("granted", true, false)).toBe(true);
    expect(shouldNotifyNatively("granted", false, false)).toBe(true);
    expect(shouldNotifyNatively("granted", false, true)).toBe(false);
    expect(shouldNotifyNatively("default", true, false)).toBe(false);
    expect(shouldNotifyNatively("denied", true, false)).toBe(false);
  });
  it("badges the tab title with the unread count, once", () => {
    expect(badgedTitle("FullSuite · My Work", 3)).toBe("(3) FullSuite · My Work");
    expect(badgedTitle("(3) FullSuite · My Work", 5)).toBe("(5) FullSuite · My Work");
    expect(badgedTitle("(5) FullSuite · My Work", 0)).toBe("FullSuite · My Work");
    expect(badgedTitle("FullSuite", 150)).toBe("(99+) FullSuite");
  });
  it("treats reminders, mentions and direct messages as the ones that chime", () => {
    expect(describeForAlert({ kind: "reminder", title: "Submit your End of Day", detail: "Due by 7:00 PM ET." })).toEqual({ title: "Submit your End of Day", body: "Due by 7:00 PM ET.", urgent: true });
    expect(describeForAlert({ kind: "status", title: "Moved", detail: null }).urgent).toBe(false);
  });
  it("reads the browser's permission, or says the browser cannot", () => {
    expect(nativePermission(undefined)).toBe("unsupported");
    expect(nativePermission({ Notification: { permission: "granted" } })).toBe("granted");
  });
  it("sound is on until someone turns it off", () => {
    expect(soundEnabled({ getItem: () => null })).toBe(true);
    expect(soundEnabled({ getItem: () => "off" })).toBe(false);
  });
});

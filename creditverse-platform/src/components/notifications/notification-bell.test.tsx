/**
 * Dee, 2026-09-30: "clicking the bell should show the most recent unread
 * notification and the link to view all notifications." The sidebar entry
 * is gone; this is the one way in, so it is pinned.
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";

/* A bell mount is slow in jsdom (popover + portal): 17–34 s per device case
   on a loaded machine (2026-10-01, load average 6). The allowance covers it;
   the cost itself is a PRODUCTION_BACKLOG item — a mount should not take
   seconds. */
vi.setConfig({ testTimeout: 90_000 });
afterEach(cleanup);
import { MemoryRouter } from "react-router-dom";
import { NotificationBell } from "./NotificationBell";
import type { Notification } from "@/lib/data/notifications";

const state = vi.hoisted(() => ({ unread: 0, items: [] as Notification[] }));
vi.mock("@/lib/auth/auth-context", () => ({ useAuth: () => ({ user: { id: "u1" }, agencyId: "a1", mode: "live", status: "signed-in" }) }));
vi.mock("@/lib/supabase/client", () => ({ requireSupabase: () => ({}) }));
const device = vi.hoisted(() => ({ state: "can_enable" as string }));
vi.mock("@/lib/notifications/push-subscription", () => ({
  ensurePushSubscription: async () => "subscribed",
  currentDeviceState: async () => device.state,
  blockedInstructions: () => "In Chrome: click the lock icon left of the address bar → Site settings → Notifications → Allow, then reload.",
}));
vi.mock("@/lib/data/use-notifications", () => ({
  useUnreadNotificationCount: () => state.unread,
  useRecentUnreadNotifications: (open: boolean) => ({ items: open ? state.items : [], isLoading: false, error: null, live: true }),
  useMarkNotificationRead: () => ({ mutate: vi.fn() }),
  useMarkAllNotificationsRead: () => ({ mutate: vi.fn(), isPending: false }),
}));

const note = (id: number, title: string): Notification => ({
  id, kind: "assigned", title, detail: null, entityType: "work_item", entityId: `w${id}`, entityLabel: null,
  createdAt: new Date().toISOString(), readAt: null,
} as unknown as Notification);

const mount = () => render(<MemoryRouter><NotificationBell /></MemoryRouter>);

describe("the notification bell", () => {
  it("shows the unread count on the bell, and the recent unread plus a View all link when clicked", () => {
    state.unread = 2; state.items = [note(2, "Handoff: Aaron Hills"), note(1, "You were assigned Abigail Carrillo")];
    mount();
    const bell = screen.getByRole("button", { name: "Notifications, 2 unread" });
    expect(bell.textContent).toContain("2");
    fireEvent.click(bell);
    expect(screen.getByText("Handoff: Aaron Hills")).toBeTruthy();
    expect(screen.getByText("You were assigned Abigail Carrillo")).toBeTruthy();
    expect(screen.getByRole("link", { name: /view all notifications/i }).getAttribute("href")).toBe("/app/notifications");
  });

  it("says so when there is nothing unread, and still offers the full list", () => {
    state.unread = 0; state.items = [];
    mount();
    fireEvent.click(screen.getByRole("button", { name: "Notifications" }));
    expect(screen.getByText("You are all caught up.")).toBeTruthy();
    expect(screen.getByRole("link", { name: /view all notifications/i })).toBeTruthy();
  });
});

/* Dee, 2026-10-01: the bell offers Turn on notifications only when a click
   can change something; a subscribed device is never asked again; a
   blocked browser is told how to unblock. */
describe("the bell and this device", () => {
  it("offers Turn on notifications when the device can be enabled", async () => {
    device.state = "can_enable"; state.unread = 0; state.items = [];
    mount();
    fireEvent.click(screen.getByRole("button", { name: "Notifications" }));
    await waitFor(() => expect(screen.getByRole("button", { name: /turn on notifications/i })).toBeTruthy());
  });
  it("does not ask again once the device is subscribed", async () => {
    device.state = "subscribed"; state.unread = 0; state.items = [];
    mount();
    fireEvent.click(screen.getByRole("button", { name: "Notifications" }));
    await waitFor(() => expect(screen.getByText(/Notifications are on for this device/)).toBeTruthy());
    expect(screen.queryByRole("button", { name: /turn on notifications/i })).toBeNull();
  });
  it("explains how to unblock when the browser blocked it, and the Home Screen step on iPhone", async () => {
    device.state = "blocked"; state.unread = 0; state.items = [];
    mount();
    fireEvent.click(screen.getByRole("button", { name: "Notifications" }));
    await waitFor(() => expect(screen.getByText(/blocked for FullSuite/)).toBeTruthy());
    expect(screen.getByText(/lock icon/)).toBeTruthy();
    cleanup();
    device.state = "needs_install";
    mount();
    fireEvent.click(screen.getByRole("button", { name: "Notifications" }));
    await waitFor(() => expect(screen.getByText(/Home Screen first/)).toBeTruthy());
  });
});


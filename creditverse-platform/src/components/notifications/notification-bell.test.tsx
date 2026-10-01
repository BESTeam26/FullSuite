/**
 * Dee, 2026-09-30: "clicking the bell should show the most recent unread
 * notification and the link to view all notifications." The sidebar entry
 * is gone; this is the one way in, so it is pinned.
 */
import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { NotificationBell } from "./NotificationBell";
import type { Notification } from "@/lib/data/notifications";

const state = vi.hoisted(() => ({ unread: 0, items: [] as Notification[] }));
vi.mock("@/lib/auth/auth-context", () => ({ useAuth: () => ({ user: { id: "u1" }, agencyId: "a1", mode: "live", status: "signed-in" }) }));
vi.mock("@/lib/supabase/client", () => ({ requireSupabase: () => ({}) }));
vi.mock("@/lib/notifications/push-subscription", () => ({ ensurePushSubscription: async () => "subscribed", isIosWithoutInstall: () => false }));
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

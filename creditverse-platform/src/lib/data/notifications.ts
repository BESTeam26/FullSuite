/**
 * Notifications — data access.
 *
 * One table, written only by the database (`notify_from_activity`), read
 * under `recipient_id = auth.uid()` plus a live re-check of the underlying
 * record's visibility. The frontend never decides who is notified.
 */
import { supabase } from "@/lib/supabase/client";
import type { Database } from "@/lib/supabase/database.types";

export type NotificationRow =
  Database["public"]["Tables"]["notifications"]["Row"];

export type NotificationKind =
  | "assigned"
  | "unassigned"
  | "note"
  | "status"
  | "reminder"
  /* Written by triggers on `messages` (0218): a mention in any conversation,
     and a direct message that carried no mention. */
  | "mention"
  | "dm"
  /* A client handed to another department, and a record moved INTO Attention —
     the one status change whose meaning is "somebody has to act". */
  | "handoff"
  | "attention"
  | "announcement"
  /* The clock: an auto-stopped timer, a requested or decided adjustment
     (0236). Routed to the agent and their lead. */
  | "timer"
  /* Time off: a submitted request (to the leads) and its decision (to the
     requester), 0251. */
  | "leave"
  /* The payroll pipeline (0255): hours ready to verify, the lock reminder,
     ready-to-release, and the released payslip. */
  | "payroll"
  /* The clock on the work itself (0293): due within a day, and past due —
     to the assignee, with the team's leads on the overdue one. A CRM go-live
     date uses the same two kinds against the project. */
  | "due_soon"
  | "overdue"
  /* End of Day: a submission due, late, or reviewed (0916). */
  | "eod";

export interface Notification {
  id: number;
  kind: NotificationKind;
  title: string;
  detail: string | null;
  entityType: string;
  entityId: string;
  entityLabel: string | null;
  actorId: string | null;
  createdAt: string;
  readAt: string | null;
}

export const mapNotification = (row: NotificationRow): Notification => ({
  id: row.id,
  kind: row.kind as NotificationKind,
  title: row.title,
  detail: row.detail,
  entityType: row.entity_type,
  entityId: row.entity_id,
  entityLabel: row.entity_label,
  actorId: row.actor_id,
  createdAt: row.created_at,
  readAt: row.read_at,
});

export const NOTIFICATIONS_PAGE_SIZE = 50;
export const RECENT_UNREAD_LIMIT = 5;

export async function fetchNotifications(
  limit = NOTIFICATIONS_PAGE_SIZE,
): Promise<Notification[]> {
  const { data, error } = await supabase
    .from("notifications")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) throw new Error(error.message);
  return (data ?? []).map(mapNotification);
}

/** The bell's popover: the newest unread only, a handful (Dee, 2026-09-30). */
export async function fetchRecentUnreadNotifications(limit = RECENT_UNREAD_LIMIT): Promise<Notification[]> {
  const { data, error } = await supabase
    .from("notifications")
    .select("*")
    .is("read_at", null)
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) throw new Error(error.message);
  return (data ?? []).map(mapNotification);
}

/** Unread count — same table, same RLS predicate as the list. */
export async function fetchUnreadCount(): Promise<number> {
  const { count, error } = await supabase
    .from("notifications")
    .select("id", { count: "exact", head: true })
    .is("read_at", null);
  if (error) throw new Error(error.message);
  return count ?? 0;
}

export async function markNotificationRead(id: number): Promise<void> {
  const { error } = await supabase
    .from("notifications")
    .update({ read_at: new Date().toISOString() })
    .eq("id", id)
    .is("read_at", null);
  if (error) throw new Error(error.message);
}

export async function markAllNotificationsRead(): Promise<void> {
  const { error } = await supabase
    .from("notifications")
    .update({ read_at: new Date().toISOString() })
    .is("read_at", null);
  if (error) throw new Error(error.message);
}

export { hrefForEntity } from "@/lib/notifications/notification-href";

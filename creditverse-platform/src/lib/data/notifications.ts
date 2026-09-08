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
  /* Written by triggers on `messages` (0218): a mention in any conversation,
     and a direct message that carried no mention. */
  | "mention"
  | "dm"
  /* A client handed to another department, and a record moved INTO Attention —
     the one status change whose meaning is "somebody has to act". */
  | "handoff"
  | "attention"
  | "announcement";

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

/**
 * Where a notification leads. Only surfaces that can open a canonical record
 * from the URL are addressable; anything else returns null and the UI says so
 * rather than linking to a page that ignores the id.
 */
export function hrefForEntity(
  entityType: string,
  entityId: string,
): string | null {
  const id = encodeURIComponent(entityId);
  switch (entityType) {
    case "work_item":
      return `/app/my-work?item=${id}`;
    case "fulfillment_client":
      return `/app/creditops?client=${id}`;
    case "funding_client":
      return `/app/fundingops?client=${id}`;
    /* A mention or a direct message opens the conversation it happened in —
       the same `?channel=` a partner record uses. */
    case "channel":
      return `/app/channels?channel=${id}`;
    /* The board highlights the one that was announced. */
    case "announcement":
      return `/app/announcements?announcement=${id}`;
    default:
      return null;
  }
}

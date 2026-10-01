/**
 * What a push message carries (Dee, 2026-10-01: notifications when the app
 * is closed or the phone is locked, like Slack and Teams).
 *
 * Shared by the push-notify Edge Function and the service worker's tests.
 * Relative imports only, so Deno can resolve it.
 */
import { hrefForEntity } from "./notification-href.ts";

export interface PushPayload {
  title: string;
  body: string;
  /** Absolute or app-relative; the service worker opens it on click. */
  url: string;
  /** Collapses repeats of the same event on the device. */
  tag: string;
  notificationId: number;
}

export function pushPayloadFor(n: {
  id: number; kind: string; title: string; detail: string | null; entity_type: string; entity_id: string;
}): PushPayload {
  const href = n.kind === "unassigned" ? null : hrefForEntity(n.entity_type, n.entity_id);
  return {
    title: n.title,
    body: n.detail ?? "",
    url: href ?? "/app/notifications",
    tag: `fullsuite-${n.id}`,
    notificationId: n.id,
  };
}

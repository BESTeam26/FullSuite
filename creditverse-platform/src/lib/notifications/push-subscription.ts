/**
 * Subscribing this device to push (Dee, 2026-10-01).
 *
 * The browser hands us an endpoint and keys for this device; they are stored
 * under the person's own row (RLS: `user_id = auth.uid()`), and the
 * push-notify function sends to them. Re-run on every signed-in load with
 * permission granted, because a browser may rotate the endpoint; the upsert
 * is by endpoint, so a device is stored once.
 *
 * iPhones deliver push only to a web app installed on the Home Screen; the
 * bell says so instead of pretending.
 */
import type { SupabaseClient } from "@supabase/supabase-js";

export type PushState = "subscribed" | "unsupported" | "no_key" | "denied" | "needs_install" | "failed";

const PUBLIC_KEY_CACHE: { key: string | null } = { key: null };

export function isIosWithoutInstall(nav: Navigator = navigator): boolean {
  const ios = /iPhone|iPad|iPod/.test(nav.userAgent);
  const installed = (nav as Navigator & { standalone?: boolean }).standalone === true
    || (typeof matchMedia !== "undefined" && matchMedia("(display-mode: standalone)").matches);
  return ios && !installed;
}

export function pushSupported(w: Window = window): boolean {
  return "serviceWorker" in w.navigator && "PushManager" in w && "Notification" in w;
}

function urlBase64ToUint8Array(base64: string): Uint8Array<ArrayBuffer> {
  const padding = "=".repeat((4 - (base64.length % 4)) % 4);
  const raw = atob((base64 + padding).replace(/-/g, "+").replace(/_/g, "/"));
  const bytes = new Uint8Array(new ArrayBuffer(raw.length));
  for (let i = 0; i < raw.length; i += 1) bytes[i] = raw.charCodeAt(i);
  return bytes;
}

export async function fetchPushPublicKey(sb: SupabaseClient, agencyId: string): Promise<string | null> {
  if (PUBLIC_KEY_CACHE.key) return PUBLIC_KEY_CACHE.key;
  const { data } = await sb.from("agencies").select("push_public_key").eq("id", agencyId).maybeSingle();
  PUBLIC_KEY_CACHE.key = (data?.push_public_key as string | null) ?? null;
  return PUBLIC_KEY_CACHE.key;
}

/** Register the worker and store this device's subscription. Safe to call repeatedly. */
export async function ensurePushSubscription(sb: SupabaseClient, userId: string, agencyId: string): Promise<PushState> {
  if (!pushSupported()) return isIosWithoutInstall() ? "needs_install" : "unsupported";
  if (Notification.permission !== "granted") return "denied";
  const key = await fetchPushPublicKey(sb, agencyId);
  if (!key) return "no_key";
  try {
    const registration = await navigator.serviceWorker.register("/sw.js", { scope: "/" });
    await navigator.serviceWorker.ready;
    const subscription = await registration.pushManager.getSubscription()
      ?? await registration.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: urlBase64ToUint8Array(key) });
    const j = subscription.toJSON();
    if (!j.endpoint || !j.keys?.p256dh || !j.keys?.auth) return "failed";
    const { error } = await sb.from("push_subscriptions").upsert({
      agency_id: agencyId, user_id: userId, endpoint: j.endpoint, p256dh: j.keys.p256dh, auth: j.keys.auth,
      user_agent: navigator.userAgent.slice(0, 200), last_seen_at: new Date().toISOString(), failed_at: null,
    } as never, { onConflict: "endpoint" });
    if (error) return "failed";
    return "subscribed";
  } catch {
    return "failed";
  }
}

/**
 * What this device is, read-only — never prompts, never subscribes. The
 * bell shows one line from it and offers the button only when a click can
 * change something (Dee: "if already subscribed, do not keep asking").
 */
export type DeviceState = "subscribed" | "can_enable" | "needs_registration" | "blocked" | "needs_install" | "unsupported";

export async function currentDeviceState(): Promise<DeviceState> {
  if (typeof window === "undefined") return "unsupported";
  if (isIosWithoutInstall()) return "needs_install";
  if (!pushSupported()) return "unsupported";
  if (Notification.permission === "denied") return "blocked";
  if (Notification.permission === "default") return "can_enable";
  try {
    const registration = await navigator.serviceWorker.getRegistration("/");
    const subscription = await registration?.pushManager.getSubscription();
    return subscription ? "subscribed" : "needs_registration";
  } catch {
    return "needs_registration";
  }
}

/** How to unblock notifications for this site, in the words of the browser being used. */
export function blockedInstructions(userAgent: string = navigator.userAgent): string {
  const ua = userAgent;
  if (/iPhone|iPad|iPod/.test(ua)) return "On iPhone: Settings → Notifications → FullSuite → Allow Notifications.";
  if (/Edg\//.test(ua)) return "In Edge: click the lock icon left of the address bar → Permissions for this site → Notifications → Allow, then reload.";
  if (/Firefox\//.test(ua)) return "In Firefox: click the icon left of the address bar → Permissions → Notifications → Allow, then reload.";
  if (/Safari\//.test(ua) && !/Chrome\//.test(ua)) return "In Safari: Safari menu → Settings → Websites → Notifications → set app.bescrm.net to Allow, then reload.";
  return "In Chrome: click the lock icon left of the address bar → Site settings → Notifications → Allow, then reload.";
}

/** Forget this device: the browser's subscription and our row. */
export async function removePushSubscription(sb: SupabaseClient): Promise<void> {
  if (!pushSupported()) return;
  try {
    const registration = await navigator.serviceWorker.getRegistration("/");
    const subscription = await registration?.pushManager.getSubscription();
    if (!subscription) return;
    await sb.from("push_subscriptions").delete().eq("endpoint", subscription.endpoint);
    await subscription.unsubscribe();
  } catch { /* nothing to undo */ }
}

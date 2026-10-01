/* FullSuite service worker: push only.
 *
 * Deliberately no caching. Every deploy replaces the hashed assets, and a
 * worker that cached them would serve a stale build after a deploy — the
 * blank-page failure RouteErrorBoundary exists to recover from. This file
 * does one job: show a push message and open its page when tapped. A
 * message is not shown while a FullSuite window is focused; the app's own
 * toast has it. */
self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (event) => event.waitUntil(self.clients.claim()));

self.addEventListener("push", (event) => {
  let data = { title: "FullSuite", body: "", url: "/app/notifications", tag: "fullsuite" };
  try { data = { ...data, ...event.data.json() }; } catch { /* a bare text push */ }
  event.waitUntil((async () => {
    const windows = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
    if (windows.some((w) => w.focused)) return;
    await self.registration.showNotification(data.title, {
      body: data.body, tag: data.tag, icon: "/bes-logo.png", badge: "/bes-logo.png",
      data: { url: data.url }, renotify: false,
    });
  })());
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = new URL(event.notification.data?.url || "/app/notifications", self.location.origin).href;
  event.waitUntil((async () => {
    const windows = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
    const existing = windows.find((w) => w.url.startsWith(self.location.origin));
    if (existing) { await existing.focus(); if ("navigate" in existing) await existing.navigate(url); return; }
    await self.clients.openWindow(url);
  })());
});

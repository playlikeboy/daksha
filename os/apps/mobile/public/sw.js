// Daksha's service worker. It does one job: show a reminder that arrives as a web push, and
// open Daksha when the person taps it. It is registered only when the person turns on
// "Send me reminders in this browser".
//
// It has no fetch handler and caches nothing, so the app loads exactly as it does without it.
// A push carries only a short title (for example "Good morning"), never journal text.
self.addEventListener("install", () => {
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener("push", (event) => {
  let title = "A reminder from Daksha";
  try {
    const data = event.data ? event.data.json() : null;
    if (data && typeof data.title === "string" && data.title.trim()) title = data.title.trim().slice(0, 120);
  } catch {
    // Not the shape Daksha sends: show the plain title.
  }
  event.waitUntil(
    self.registration.showNotification(title, {
      body: "Open Daksha to see it.",
      icon: "/icons/icon-192.png",
      badge: "/icons/icon-192.png",
      tag: title,
    }),
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  event.waitUntil(
    (async () => {
      const open = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
      const app = open.find((client) => new URL(client.url).origin === self.location.origin);
      if (app) {
        await app.focus();
        return;
      }
      await self.clients.openWindow("/chat");
    })(),
  );
});

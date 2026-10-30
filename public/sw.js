// MARTEO service worker: only Web Push notifications, no offline caching.
self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", event => event.waitUntil(self.clients.claim()));

self.addEventListener("push", event => {
    let data = {};
    try { data = event.data ? event.data.json() : {}; } catch { data = { body: event.data ? event.data.text() : "" }; }
    const url = typeof data.url === "string" && data.url.startsWith("/") ? data.url : "/dashboard";
    event.waitUntil(self.registration.showNotification(data.title || "MARTEO", {
        body: data.body || "ახალი შეტყობინება",
        icon: "/icons/marteo-192.png",
        badge: "/icons/marteo-192.png",
        tag: data.tag,
        // A repeated tag replaces the old notification; renotify makes it alert (and sound) again.
        renotify: Boolean(data.tag),
        silent: false,
        data: { url },
    }));
});

self.addEventListener("notificationclick", event => {
    event.notification.close();
    const url = new URL(event.notification.data?.url || "/dashboard", self.location.origin).href;
    event.waitUntil((async () => {
        const windows = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
        for (const client of windows) {
            if (client.url === url && "focus" in client) return client.focus();
        }
        const existing = windows.find(client => "navigate" in client);
        if (existing) { await existing.navigate(url); return existing.focus(); }
        return self.clients.openWindow(url);
    })());
});

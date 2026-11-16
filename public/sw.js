// MARTEO service worker: only Web Push notifications, no offline caching.
// The phone shows these even when MARTEO is closed or swiped away from recent apps.
self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", event => event.waitUntil(self.clients.claim()));

self.addEventListener("push", event => {
    let data = {};
    try { data = event.data ? event.data.json() : {}; } catch { data = { body: event.data ? event.data.text() : "" }; }
    const url = typeof data.url === "string" && data.url.startsWith("/") && !data.url.startsWith("//") ? data.url : "/dashboard";
    const businessId = typeof data.businessId === "string" ? data.businessId : null;
    // iPhone stops delivering pushes to an app that receives one without showing it, so every push is shown.
    event.waitUntil(self.registration.showNotification(data.title || "MARTEO", {
        body: data.body || "ახალი შეტყობინება",
        icon: "/icons/marteo-192.png",
        badge: "/icons/marteo-192.png",
        tag: data.tag,
        // A repeated tag replaces the old notification; renotify makes it alert (and sound) again.
        renotify: Boolean(data.tag),
        requireInteraction: data.requireInteraction === true,
        silent: false,
        data: { url, businessId },
    }));
});

// A notification for another business first makes that business active, then opens the page.
async function switchBusiness(businessId) {
    try {
        await fetch("/api/business/switch", {
            method: "POST",
            credentials: "same-origin",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ businessId }),
        });
    } catch { /* The page still opens in the active business. */ }
}

self.addEventListener("notificationclick", event => {
    event.notification.close();
    const { url: path, businessId } = event.notification.data || {};
    const url = new URL(path || "/dashboard", self.location.origin).href;
    event.waitUntil((async () => {
        if (businessId) await switchBusiness(businessId);
        const windows = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
        if (!businessId) {
            for (const client of windows) {
                if (client.url === url && "focus" in client) return client.focus();
            }
        }
        const existing = windows.find(client => "navigate" in client);
        if (existing) {
            const navigated = await existing.navigate(url).catch(() => null);
            if (navigated) return navigated.focus();
        }
        return self.clients.openWindow(url);
    })());
});

// The browser can renew a subscription on its own; tell the server the new address so pushes keep arriving.
self.addEventListener("pushsubscriptionchange", event => {
    event.waitUntil((async () => {
        const options = event.oldSubscription?.options;
        const subscription = event.newSubscription
            ?? (options?.applicationServerKey
                ? await self.registration.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: options.applicationServerKey })
                : null);
        if (!subscription) return;
        await fetch("/api/push/subscription", {
            method: "PUT",
            credentials: "same-origin",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(subscription.toJSON()),
        });
    })().catch(() => undefined));
});

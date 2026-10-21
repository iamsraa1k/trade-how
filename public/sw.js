// TradeHow service worker. It exists so the app can be installed; it caches nothing, so your
// journal is always loaded fresh. When a page can't load because you're offline, it shows a short notice.

const OFFLINE_PAGE = `<!doctype html><html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1"><title>TradeHow</title>
<style>body{margin:0;min-height:100vh;display:flex;align-items:center;justify-content:center;
font-family:system-ui,sans-serif;background:#09090b;color:#e4e4e7;text-align:center;padding:24px}
p{color:#a1a1aa}</style></head><body><div><h1>You're offline</h1>
<p>TradeHow needs a connection to load your journal. It will work again once you're back online.</p></div></body></html>`;

self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (event) => event.waitUntil(self.clients.claim()));

self.addEventListener("fetch", (event) => {
    if (event.request.mode !== "navigate") return;
    event.respondWith(
        fetch(event.request).catch(
            () => new Response(OFFLINE_PAGE, { headers: { "Content-Type": "text/html; charset=utf-8" } })
        )
    );
});

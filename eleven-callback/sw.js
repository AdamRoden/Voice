/* Serves http://localhost:8484/callback after ElevenLabs Authorize, then closes that tab.
   The installer replaces the empty CLOSE_HTML with eleven-callback/close.html. */
const CLOSE_HTML = "";

self.addEventListener("install", () => {
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener("fetch", (event) => {
  const path = new URL(event.request.url).pathname;
  if (path !== "/callback" && path !== "/callback/") return;
  event.respondWith(new Response(CLOSE_HTML, {
    headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" }
  }));
});

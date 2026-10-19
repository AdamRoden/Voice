/* Serves http://localhost:8484/callback after ElevenLabs Authorize, then closes that tab.
   Register it once with tools/eleven-callback-install.js. It keeps working after that host exits. */
const CLOSE_HTML = "<!doctype html><meta charset=\"utf-8\"><title>ElevenLabs</title><script>window.close()</script><p>You're signed in. You can close this tab.</p>";

self.addEventListener("install", () => {
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener("fetch", (event) => {
  const path = new URL(event.request.url).pathname;
  if (path !== "/callback") return;
  event.respondWith(new Response(CLOSE_HTML, {
    headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" }
  }));
});

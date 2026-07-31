/* AAC Workspace service worker — offline shell + app assets */
const CACHE_NAME = "aac-workspace-v39";
const PRECACHE = [
  "./",
  "./index.html",
  "./css/app.css",
  "./js/app.js",
  "./js/audio-fx.js",
  "./js/keyboard.js",
  "./js/eleven.js",
  "./js/eleven-key.js",
  "./js/piper.js",
  "./js/speech-engines.js",
  "./js/speech-playback.js",
  "./js/voices.js",
  "./js/topics-edit.js",
  "./js/topics.js",
  "./js/workspace.js",
  "./js/compose.js",
  "./js/history-ui.js",
  "./js/shell-ui.js",
  "./js/icon-studio.js",
  "./js/board-io.js",
  "./js/predict-data.js",
  "./js/predict-type.js",
  "./js/predict.js",
  "./js/osk.js",
  "./manifest.webmanifest",
  "./icon.svg"
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => cache.addAll(PRECACHE))
      .then(() => self.skipWaiting())
      .catch(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.map((key) => (key === CACHE_NAME ? null : caches.delete(key))))
    ).then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;

  const url = new URL(req.url);
  // Only handle same-origin app shell; let CDN/API (fonts, ElevenLabs) hit the network
  if (url.origin !== self.location.origin) return;

  // SPA navigations: always prefer the app shell (hash routes live client-side)
  const isNavigate = req.mode === "navigate" ||
    (req.destination === "document") ||
    (req.headers.get("accept") || "").includes("text/html");

  if (isNavigate) {
    event.respondWith(
      fetch(req)
        .then((res) => {
          if (res && res.ok) {
            const copy = res.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put("./index.html", copy)).catch(() => {});
          }
          return res;
        })
        .catch(() => caches.match("./index.html"))
    );
    return;
  }

  event.respondWith(
    caches.match(req).then((cached) => {
      const network = fetch(req)
        .then((res) => {
          if (
            res &&
            res.ok &&
            (url.pathname.endsWith(".html") ||
              url.pathname.endsWith(".js") ||
              url.pathname.endsWith(".css") ||
              url.pathname.endsWith(".webmanifest") ||
              url.pathname.endsWith(".svg"))
          ) {
            const copy = res.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(req, copy)).catch(() => {});
          }
          return res;
        })
        .catch(() => cached || caches.match("./index.html"));
      return cached || network;
    })
  );
});

// Beard Log Service Worker — オフラインでも記録・閲覧ができるようアプリ本体をキャッシュする
// 写真や記録データはIndexedDBに保存されており、このキャッシュには含まれない
const CACHE_VERSION = "beardlog-v3";

const PRECACHE_URLS = [
  "./",
  "./index.html",
  "./manifest.json",
  "./css/style.css",
  "./js/app.js",
  "./js/router.js",
  "./js/db.js",
  "./js/camera.js",
  "./js/charts.js",
  "./js/constants.js",
  "./js/services/sessionService.js",
  "./js/services/backupService.js",
  "./js/utils/format.js",
  "./js/utils/image.js",
  "./js/utils/ui.js",
  "./js/views/home.js",
  "./js/views/record.js",
  "./js/views/progress.js",
  "./js/views/compare.js",
  "./js/views/history.js",
  "./js/views/settings.js",
  "./icons/icon-72.png",
  "./icons/icon-96.png",
  "./icons/icon-128.png",
  "./icons/icon-144.png",
  "./icons/icon-152.png",
  "./icons/icon-180.png",
  "./icons/icon-192.png",
  "./icons/icon-512.png",
  "./icons/maskable-192.png",
  "./icons/maskable-512.png",
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(CACHE_VERSION)
      .then((cache) =>
        // HTTPキャッシュを必ずバイパスして、更新のたびに本当に新しいファイルを取得する
        // （ここを素のcache.addAll()にすると、ホスティング側のキャッシュ次第で
        // 更新後も古いJS/CSSがService Workerに取り込まれ続けることがある）
        Promise.all(PRECACHE_URLS.map((url) => fetch(new Request(url, { cache: "reload" })).then((res) => cache.put(url, res))))
      )
      .then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE_VERSION).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;

  event.respondWith(
    caches.match(req).then((cached) => {
      const network = fetch(req)
        .then((res) => {
          if (res && res.status === 200) {
            const clone = res.clone();
            caches.open(CACHE_VERSION).then((cache) => cache.put(req, clone));
          }
          return res;
        })
        .catch(() => cached || caches.match("./index.html"));
      return cached || network;
    })
  );
});

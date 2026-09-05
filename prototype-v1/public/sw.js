// PWA：Chrome 的安裝條件要一個有 fetch handler 的 service worker。
// ponytail: 手寫、沒有 precache manifest —— Vite 產出的檔名帶 hash，這裡只在第一次取用時才收進快取。
// 升級路徑：需要 build 時就預先快取全部資產（真正的離線首開）時，換成 vite-plugin-pwa。
const VERSION = "ail-v1";
const SHELL = ["/", "/index.html", "/manifest.webmanifest", "/icon.svg", "/apple-touch-icon.png"];

self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(VERSION).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches.keys()
      .then((ks) => Promise.all(ks.filter((k) => k !== VERSION).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

const put = (req, res) => {
  const copy = res.clone();
  caches.open(VERSION).then((c) => c.put(req, copy));
  return res;
};

self.addEventListener("fetch", (e) => {
  const req = e.request;
  const url = new URL(req.url);
  // /api/* 一律不快取：價格、名額與資料狀態會過期，拿舊的比沒有更糟。
  if (req.method !== "GET" || url.origin !== self.location.origin || url.pathname.startsWith("/api/")) return;

  // 導覽 network-first，離線時退回快取的 app shell。
  if (req.mode === "navigate") {
    e.respondWith(
      fetch(req).then((res) => (res.ok ? put("/index.html", res) : res))   // 錯誤頁不能變成離線 app shell
        .catch(() => caches.match("/index.html").then((hit) => hit ?? Response.error())),
    );
    return;
  }

  // 同源靜態資源 cache-first：檔名帶 hash，改版就是新網址，不會拿到舊的。
  e.respondWith(
    caches.match(req).then((hit) => hit ?? fetch(req).then((res) => (res.ok ? put(req, res) : res))),
  );
});

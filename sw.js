/* 铁馆计划 service worker：离线缓存
   策略：同源 GET 一律 network-first（3s 超时回退缓存）。
   好处是改了线上文件不用手动改版本号，用户下次打开就是新的；
   CACHE 只用于 activate 时清理旧缓存，以及离线时兜底。 */
var CACHE = "gym4-v20";
var ASSETS = [
  "./",
  "./index.html",
  "./style.css",
  "./data.js",
  "./js/core.js",
  "./js/plan.js",
  "./js/log.js",
  "./js/progress.js",
  "./app.js",
  "./manifest.json",
  "./fonts/barlow-condensed-600.woff2",
  "./fonts/barlow-condensed-700.woff2",
  "./icons/icon-192.png",
  "./icons/icon-512.png",
  "./icons/icon-512-maskable.png",
  "./icons/apple-touch-icon.png",
  "./icons/app-icon.svg"
];

var TIMEOUT = 3000;

self.addEventListener("install", function (e) {
  e.waitUntil(
    caches.open(CACHE).then(function (c) {
      return c.addAll(ASSETS);
    }).then(function () { return self.skipWaiting(); })
  );
});

self.addEventListener("activate", function (e) {
  e.waitUntil(
    caches.keys().then(function (keys) {
      return Promise.all(keys.filter(function (k) { return k !== CACHE; }).map(function (k) { return caches.delete(k); }));
    }).then(function () { return self.clients.claim(); })
  );
});

// 带上超时：弱网时不必干等，超时直接用缓存
function fetchWithTimeout(request, ms) {
  return new Promise(function (resolve, reject) {
    var timer = setTimeout(function () { reject(new Error("timeout")); }, ms);
    fetch(request).then(function (res) {
      clearTimeout(timer);
      resolve(res);
    }, function (err) {
      clearTimeout(timer);
      reject(err);
    });
  });
}

self.addEventListener("fetch", function (e) {
  if (e.request.method !== "GET") return;
  var url;
  try { url = new URL(e.request.url); } catch (err) { return; }
  if (url.origin !== self.location.origin) return;   // 跨域请求不接管

  e.respondWith(
    fetchWithTimeout(e.request, TIMEOUT).then(function (res) {
      if (res && (res.ok || res.type === "opaque")) {
        var copy = res.clone();
        caches.open(CACHE).then(function (c) { c.put(e.request, copy); });
      }
      return res;
    }).catch(function () {
      // 离线或超时：回缓存
      return caches.match(e.request).then(function (hit) {
        if (hit) return hit;
        if (e.request.mode === "navigate") return caches.match("./index.html");
        return new Response("", { status: 504, statusText: "Offline" });
      });
    })
  );
});

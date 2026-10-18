/* 铁馆计划 service worker：离线缓存 */
var CACHE = "gym4-v5";
var ASSETS = [
  "./",
  "./index.html",
  "./style.css",
  "./data.js",
  "./app.js",
  "./manifest.json",
  "./fonts/barlow-condensed-600.woff2",
  "./fonts/barlow-condensed-700.woff2",
  "./icons/icon-192.png",
  "./icons/icon-512.png",
  "./img/chest_press.jpg",
  "./img/incline_press.jpg",
  "./img/pec_deck.jpg",
  "./img/chest_fly.jpg",
  "./img/lat_pulldown.jpg",
  "./img/lat_pulldown_alt.jpg",
  "./img/seated_row.jpg",
  "./img/shoulder_press.jpg",
  "./img/leg_press.jpg",
  "./img/leg_press_alt.jpg",
  "./img/smith_machine.jpg",
  "./img/hack_squat.jpg",
  "./img/leg_extension.jpg",
  "./img/leg_curl.jpg",
  "./img/calf_raise.jpg"
];

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

self.addEventListener("fetch", function (e) {
  if (e.request.method !== "GET") return;
  e.respondWith(
    caches.match(e.request).then(function (hit) {
      if (hit) return hit;
      return fetch(e.request).then(function (res) {
        var copy = res.clone();
        caches.open(CACHE).then(function (c) { c.put(e.request, copy); });
        return res;
      }).catch(function () {
        return caches.match("./index.html");
      });
    })
  );
});

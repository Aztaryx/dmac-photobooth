const C = "dc-v3",
  A = [
    "./",
    "index.html",
    "form.html",
    "cashier.html",
    "camera.html",
    "editor.html",
    "layout.html",
    "js/bg.js",
    "js/vendor/bgstack-runtime.js",
    "css/layout.css",
    "auditor.html",
    "css/global.css",
    "css/motion.css",
    "css/screens.css",
    "js/ui.js",
    "fonts/splatink-regular.otf",
    "fonts/the-seasons-regular.ttf",
    "fonts/the-seasons-italic.ttf",
    "js/supabase.js",
    "js/auth.js",
    "js/outbox.js",
    "js/vendor/supabase.js",
    "img/dmac-logo-orange-purple-bright.png",
    "fonts/chakra-petch-latin-500-normal.woff2",
    "fonts/chakra-petch-latin-700-normal.woff2",
    "fonts/rajdhani-latin-600-normal.woff2",
    "fonts/rajdhani-latin-700-normal.woff2",
  ];
addEventListener("install", (e) => e.waitUntil(caches.open(C).then((c) => c.addAll(A))));
addEventListener("fetch", (e) => {
  if (new URL(e.request.url).origin !== location.origin) return;
  e.respondWith(
    fetch(e.request)
      .then((r) => {
        const k = r.clone();
        caches.open(C).then((c) => c.put(e.request, k));
        return r;
      })
      .catch(() => caches.match(e.request)),
  );
});

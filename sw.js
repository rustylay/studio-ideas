// Minimal offline cache so the installed app opens without signal.
// CACHE names the store; changing it discards the old one on activate. Bumping
// it is no longer how a new build reaches the phone — see the fetch handler.
const CACHE = 'studio-ideas-v3';
const FILES = ['./', './index.html', './app.js', './lib.js', './store.js', './sw.js'];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(FILES)));
  self.skipWaiting();
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

// Stale-while-revalidate for same-origin GETs: answer instantly from the cache
// so the app still opens with no signal at all, but always fetch in the
// background and put the fresh copy in the cache for next time. Cache-first
// alone meant a deployed fix never reached the installed phone app until
// someone remembered to hand-edit CACHE above.
//
// Deliberately no forced reload when the new copy lands: it would discard a
// half-typed idea, which is worse than running yesterday's code for one session.
self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET' || new URL(req.url).origin !== self.location.origin) return;
  e.respondWith(
    caches.open(CACHE).then(cache =>
      cache.match(req).then(cached => {
        const fresh = fetch(req).then(res => {
          if (res && res.ok && res.type === 'basic') cache.put(req, res.clone());
          return res;
        }).catch(() => cached);
        // Keep the worker alive until the background refresh finishes, or it
        // can be killed before the fresh copy is ever written.
        e.waitUntil(fresh.catch(() => {}));
        // Offline with nothing cached is the only case that has to wait.
        return cached || fresh;
      })
    )
  );
});

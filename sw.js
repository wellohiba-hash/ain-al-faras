/* Ain Al-Faras app shell cache: lets the installed app open with no connection.
   Data sync is handled by Firestore itself; this file never touches API calls. */
const V = 'af-shell-1';
const SHELL = ['./', 'manifest.webmanifest', 'icon-192.png', 'icon-512.png', 'apple-touch-icon.png'];

self.addEventListener('install', e => {
  self.skipWaiting();
  e.waitUntil(caches.open(V).then(c => c.addAll(SHELL)).catch(() => {}));
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys()
      .then(ks => Promise.all(ks.filter(k => k !== V).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

const keep = (req, resp) => {
  if (resp && (resp.ok || resp.type === 'opaque')) {
    const copy = resp.clone();
    caches.open(V).then(c => c.put(req, copy)).catch(() => {});
  }
  return resp;
};

self.addEventListener('fetch', e => {
  const r = e.request;
  if (r.method !== 'GET') return;
  const u = new URL(r.url);
  const same = u.origin === location.origin;
  const lib = u.hostname === 'www.gstatic.com' && u.pathname.startsWith('/firebasejs/');
  const font = u.hostname === 'fonts.googleapis.com' || u.hostname === 'fonts.gstatic.com';
  if (!same && !lib && !font) return;

  // The page itself: newest copy from the network, saved copy when offline or the network is too slow.
  if (same && (r.mode === 'navigate' || u.pathname.endsWith('/') || u.pathname.endsWith('/index.html'))) {
    e.respondWith(new Promise(resolve => {
      let done = false;
      const saved = caches.match('./');
      const useSaved = () => saved.then(c => { if (!done) { done = true; resolve(c || Response.error()); } });
      const timer = setTimeout(() => saved.then(c => { if (c && !done) { done = true; resolve(c); } }), 3500);
      fetch(r).then(resp => {
        clearTimeout(timer);
        if (resp.ok) keep('./', resp);
        if (!done) { done = true; resolve(resp); }
      }).catch(() => { clearTimeout(timer); useSaved(); });
    }));
    return;
  }

  // Icons, fonts and the versioned Firebase library: saved copy first, refreshed in the background.
  e.respondWith(caches.match(r).then(hit => {
    const net = fetch(r).then(resp => keep(r, resp));
    if (hit) { net.catch(() => {}); return hit; }
    return net;
  }));
});

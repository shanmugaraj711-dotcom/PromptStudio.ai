/* sw.js — lets the site open even when the network is blocked or very slow
   (office proxies such as Zscaler, flaky mobile data). After a first visit the
   free lessons and simulations are kept on the device.
   Strategy: network first (so updates arrive), but give up after 3 seconds and
   use the saved copy. Sign-in, payment and /api calls are never touched. */
const VERSION = 'dk-v2';
const CORE = ['/', '/about.html', '/assets/style.css', '/assets/genz.css', '/assets/boot.js', '/assets/i18n.js', '/assets/fun.js', '/assets/hero.js',
  '/assets/sim.js', '/assets/sim-chrome.js', '/assets/lesson.js', '/assets/fonts/space-grotesk-latin.woff2',
  '/i18n/hi.json', '/i18n/te.json', '/i18n/ta.json',
  '/roadmap.html', '/sims/linux-server-demo.html', '/assets/lx.css', '/assets/lx-core.js', '/assets/lx-cmds.js', '/assets/lx-data.js', '/assets/lx-server.js', '/assets/lx-missions.js', '/assets/lx-catalog.js', '/assets/lx-ui.js',
  '/lessons/lesson-0.html', '/sims/lesson-0.html', '/lessons/linux-basics.html', '/sims/linux-basics.html',
  '/lessons/git-basics.html', '/sims/git-basics.html', '/lessons/error-decoder.html', '/sims/error-decoder.html', '/sims/kafka.html'];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(VERSION).then((c) => Promise.all(CORE.map((u) => c.add(u).catch(() => {})))).then(() => self.skipWaiting()));
});
self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then((ks) => Promise.all(ks.filter((k) => k !== VERSION).map((k) => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', (e) => {
  const req = e.request, url = new URL(req.url);
  if (req.method !== 'GET' || url.origin !== location.origin || url.pathname.startsWith('/api/') || url.pathname === '/sw.js') return;
  e.respondWith((async () => {
    const cache = await caches.open(VERSION);
    const fromNet = fetch(req).then((res) => { if (res && res.ok) cache.put(req, res.clone()); return res; });
    const timeout = new Promise((_, rej) => setTimeout(() => rej(new Error('slow')), 3000));
    try { return await Promise.race([fromNet, timeout]); }
    catch (err) {
      const hit = await cache.match(req, { ignoreSearch: true });
      if (hit) return hit;
      if (req.mode === 'navigate') { const home = await cache.match('/'); if (home) return home; }
      return fromNet; // nothing saved: wait for the network after all
    }
  })());
});

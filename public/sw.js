// Keeps a copy of the site, so a sign still opens with no signal at the venue
// and the installed app starts offline. The network comes first, so a deploy
// shows up on the next load; the copy is for when the network fails or stalls.
// ponytail: files aren't versioned, so a page served from the copy after a
// stall can meet a newer script from the network; add a version per deploy if
// a change ever needs both halves at once.
const CACHE = 'scrolling-light';
const FILES = [
  '/',
  '/app.js',
  '/marquee.js',
  '/state.js',
  '/style.css',
  '/favicon.svg',
  '/manifest.webmanifest',
  '/icon-192.png',
  '/icon-512.png',
  '/icon-maskable-512.png',
  '/apple-touch-icon.png',
];
// How long a request waits for the network before the copy is used.
const NETWORK_TIMEOUT = 3000;

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(CACHE)
      .then((cache) => cache.addAll(FILES.map((url) => new Request(url, { cache: 'no-cache' }))))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener('activate', (event) => event.waitUntil(self.clients.claim()));

self.addEventListener('fetch', (event) => {
  const req = event.request;
  const url = new URL(req.url);
  if (req.method !== 'GET' || url.origin !== self.location.origin) return;
  // Every page is the same app, which routes on the client.
  event.respondWith(networkFirst(event, req.mode === 'navigate' ? '/' : url.pathname));
});

async function networkFirst(event, key) {
  const cache = await caches.open(CACHE);
  const network = fetch(event.request).then(async (res) => {
    // A redirected response can't answer a page request later, so it isn't kept.
    if (res.ok && res.type === 'basic' && !res.redirected) await cache.put(key, res.clone());
    return res;
  });
  event.waitUntil(network.catch(() => {}));
  const copy = () => cache.match(key, { ignoreSearch: true });
  const offline = network.catch(async () => (await copy()) ?? Response.error());
  const stalled = new Promise((resolve) => setTimeout(resolve, NETWORK_TIMEOUT)).then(async () => (await copy()) ?? offline);
  return Promise.race([offline, stalled]);
}

// CG Tennis OS — resilient offline support for the web app.
// The cache is versioned so browsers discard the pre-fix worker and assets.

const CACHE_NAME = 'cg-tennis-os-v2';
const RUNTIME_CACHE = 'cg-tennis-os-runtime-v2';
const VOICE_CAPTURE_DB = 'cg-tennis-voice-captures';
const API_PREFIXES = ['/api', '/tournaments', '/players', '/business-metrics', '/weather', '/alerts'];

self.addEventListener('install', (event) => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE_NAME);
    await cache.addAll(['/', '/index.html']);

    // Pre-cache the actual hashed Vite assets referenced by the current HTML.
    // Never assume a source filename such as /assets/vite.svg exists in production.
    try {
      const html = await fetch('/index.html', { cache: 'no-store' });
      const source = await html.text();
      const assets = [...source.matchAll(/(?:src|href)=["'](\/assets\/[^"']+)["']/g)].map(([, url]) => url);
      if (assets.length) await cache.addAll([...new Set(assets)]);
    } catch (error) {
      console.warn('[SW] Hashed asset pre-cache skipped:', error);
    }

    await self.skipWaiting();
  })());
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const cacheNames = await caches.keys();
    await Promise.all(cacheNames
      .filter(name => ![CACHE_NAME, RUNTIME_CACHE].includes(name))
      .map(name => caches.delete(name)));
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  // Documents must remain SPA documents, even when their pathname resembles an API prefix.
  if (request.destination === 'document') {
    event.respondWith((async () => {
      try {
        const response = await fetch(request);
        if (response.ok) {
          const cache = await caches.open(RUNTIME_CACHE);
          await cache.put(request, response.clone());
        }
        return response;
      } catch (error) {
        return (await caches.match(request)) || (await caches.match('/index.html')) ||
          new Response('Offline page unavailable', { status: 503, headers: { 'Content-Type': 'text/plain' } });
      }
    })());
    return;
  }

  if (API_PREFIXES.some(prefix => url.pathname === prefix || url.pathname.startsWith(`${prefix}/`))) {
    event.respondWith((async () => {
      try {
        const response = await fetch(request);
        if (response.ok) {
          const cache = await caches.open(RUNTIME_CACHE);
          await cache.put(request, response.clone());
        }
        return response;
      } catch (error) {
        const cached = await caches.match(request);
        return cached || new Response(
          JSON.stringify({ offline: true, message: 'Offline mode: cached data displayed' }),
          { status: 503, headers: { 'Content-Type': 'application/json' } }
        );
      }
    })());
    return;
  }

  if (['style', 'script', 'image', 'font'].includes(request.destination)) {
    event.respondWith((async () => {
      try {
        const cached = await caches.match(request);
        if (cached) return cached;

        const response = await fetch(request);
        if (response.ok) {
          const cache = await caches.open(CACHE_NAME);
          await cache.put(request, response.clone());
        }
        return response;
      } catch (error) {
        const cached = await caches.match(request);
        return cached || new Response('Offline asset unavailable', {
          status: 503,
          headers: { 'Content-Type': 'text/plain' },
        });
      }
    })());
  }
});

self.addEventListener('sync', (event) => {
  if (event.tag === 'sync-voice-captures') event.waitUntil(syncVoiceCaptures());
});

async function syncVoiceCaptures() {
  try {
    const db = await openIndexedDB();
    const tx = db.transaction(VOICE_CAPTURE_DB, 'readonly');
    const store = tx.objectStore(VOICE_CAPTURE_DB);
    const pendingCaptures = await store.getAll();
    for (const capture of pendingCaptures) {
      if (!capture.synced) await uploadVoiceCapture(capture);
    }
  } catch (error) {
    console.error('[SW] Sync error:', error);
  }
}

async function uploadVoiceCapture(capture) {
  const formData = new FormData();
  formData.append('audio', capture.audioBlob, 'capture.webm');
  formData.append('timestamp', capture.timestamp);
  formData.append('playerId', capture.playerId);

  try {
    const response = await fetch('/voice-capture/upload', { method: 'POST', body: formData });
    if (response.ok) {
      const db = await openIndexedDB();
      const tx = db.transaction(VOICE_CAPTURE_DB, 'readwrite');
      const store = tx.objectStore(VOICE_CAPTURE_DB);
      capture.synced = true;
      await store.put(capture);
    }
  } catch (error) {
    console.error('[SW] Upload error:', error);
  }
}

function openIndexedDB() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open('CGTennisOS', 1);
    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve(request.result);
    request.onupgradeneeded = (event) => {
      const db = event.target.result;
      if (!db.objectStoreNames.contains(VOICE_CAPTURE_DB)) {
        db.createObjectStore(VOICE_CAPTURE_DB, { keyPath: 'id', autoIncrement: true });
      }
    };
  });
}

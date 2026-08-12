// CG Tennis OS™ — Service Worker for Offline Functionality
// Enables voice capture, session data, and tournament info to work offline
// Auto-syncs when connection is restored

const CACHE_NAME = 'cg-tennis-os-v1';
const RUNTIME_CACHE = 'cg-tennis-os-runtime-v1';
const VOICE_CAPTURE_DB = 'cg-tennis-voice-captures';
const OFFLINE_ROUTES = [
  '/',
  '/index.html',
  '/assets/',
  '/dashboard',
  '/players',
  '/sessions/reflection',
  '/identity',
  '/tournaments'
];

// Install: Pre-cache critical assets
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      console.log('[SW] Caching critical assets');
      return cache.addAll([
        '/',
        '/index.html',
        '/assets/vite.svg'
      ]).catch(err => console.log('[SW] Cache addAll error:', err));
    }).then(() => self.skipWaiting())
  );
});

// Activate: Clean up old caches
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.map((cacheName) => {
          if (cacheName !== CACHE_NAME && cacheName !== RUNTIME_CACHE) {
            console.log('[SW] Deleting old cache:', cacheName);
            return caches.delete(cacheName);
          }
        })
      );
    }).then(() => self.clients.claim())
  );
});

// Fetch: Network-first with offline fallback
self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);

  // Skip non-GET requests and external APIs
  if (request.method !== 'GET') {
    return;
  }

  // API calls: Network-first, cache fallback
  if (url.pathname.startsWith('/api') || url.pathname.startsWith('/tournaments') || url.pathname.startsWith('/players')) {
    event.respondWith(
      fetch(request)
        .then((response) => {
          if (response.ok) {
            const cache = caches.open(RUNTIME_CACHE);
            cache.then((c) => c.put(request, response.clone()));
          }
          return response;
        })
        .catch(() => {
          return caches.match(request).then((cachedResponse) => {
            return cachedResponse || new Response(
              JSON.stringify({ offline: true, message: 'Offline mode: cached data displayed' }),
              { headers: { 'Content-Type': 'application/json' } }
            );
          });
        })
    );
    return;
  }

  // Static assets: Cache-first
  if (request.destination === 'style' || request.destination === 'script' || request.destination === 'image') {
    event.respondWith(
      caches.match(request).then((cachedResponse) => {
        return cachedResponse || fetch(request).then((response) => {
          if (response.ok) {
            const cache = caches.open(CACHE_NAME);
            cache.then((c) => c.put(request, response.clone()));
          }
          return response;
        });
      })
    );
    return;
  }

  // HTML pages: Network-first
  if (request.destination === 'document') {
    event.respondWith(
      fetch(request)
        .then((response) => {
          if (response.ok) {
            const cache = caches.open(RUNTIME_CACHE);
            cache.then((c) => c.put(request, response.clone()));
          }
          return response;
        })
        .catch(() => {
          return caches.match(request).then((cachedResponse) => {
            return cachedResponse || caches.match('/index.html');
          });
        })
    );
    return;
  }
});

// Background Sync: Auto-sync voice captures when online
self.addEventListener('sync', (event) => {
  if (event.tag === 'sync-voice-captures') {
    event.waitUntil(syncVoiceCaptures());
  }
});

async function syncVoiceCaptures() {
  try {
    const db = await openIndexedDB();
    const tx = db.transaction(VOICE_CAPTURE_DB, 'readonly');
    const store = tx.objectStore(VOICE_CAPTURE_DB);
    const pendingCaptures = await store.getAll();

    for (const capture of pendingCaptures) {
      if (!capture.synced) {
        await uploadVoiceCapture(capture);
      }
    }
  } catch (err) {
    console.error('[SW] Sync error:', err);
  }
}

async function uploadVoiceCapture(capture) {
  const formData = new FormData();
  formData.append('audio', capture.audioBlob, 'capture.webm');
  formData.append('timestamp', capture.timestamp);
  formData.append('playerId', capture.playerId);

  try {
    const response = await fetch('/voice-capture/upload', {
      method: 'POST',
      body: formData,
      headers: {
        'Authorization': `Bearer ${localStorage.getItem('cgto_token')}`
      }
    });

    if (response.ok) {
      const db = await openIndexedDB();
      const tx = db.transaction(VOICE_CAPTURE_DB, 'readwrite');
      const store = tx.objectStore(VOICE_CAPTURE_DB);
      capture.synced = true;
      await store.put(capture);
      console.log('[SW] Voice capture synced:', capture.id);
    }
  } catch (err) {
    console.error('[SW] Upload error:', err);
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

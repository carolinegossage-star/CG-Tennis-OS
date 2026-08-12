// CG Tennis OS™ — Offline Storage Utility
// Manages IndexedDB for voice captures, session drafts, and player data

const DB_NAME = 'CGTennisOS';
const DB_VERSION = 1;

const STORES = {
  VOICE_CAPTURES: 'voice_captures',
  SESSION_DRAFTS: 'session_drafts',
  PLAYER_CACHE: 'player_cache',
  TOURNAMENT_CACHE: 'tournament_cache',
  SYNC_QUEUE: 'sync_queue'
};

let db = null;

export async function initOfflineStorage() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onerror = () => reject(request.error);
    request.onsuccess = () => {
      db = request.result;
      console.log('[Offline] IndexedDB initialized');
      resolve(db);
    };

    request.onupgradeneeded = (event) => {
      const database = event.target.result;

      // Voice Captures Store
      if (!database.objectStoreNames.contains(STORES.VOICE_CAPTURES)) {
        const voiceStore = database.createObjectStore(STORES.VOICE_CAPTURES, { keyPath: 'id', autoIncrement: true });
        voiceStore.createIndex('timestamp', 'timestamp', { unique: false });
        voiceStore.createIndex('synced', 'synced', { unique: false });
      }

      // Session Drafts Store
      if (!database.objectStoreNames.contains(STORES.SESSION_DRAFTS)) {
        const sessionStore = database.createObjectStore(STORES.SESSION_DRAFTS, { keyPath: 'id' });
        sessionStore.createIndex('playerId', 'playerId', { unique: false });
        sessionStore.createIndex('timestamp', 'timestamp', { unique: false });
      }

      // Player Cache Store
      if (!database.objectStoreNames.contains(STORES.PLAYER_CACHE)) {
        database.createObjectStore(STORES.PLAYER_CACHE, { keyPath: 'id' });
      }

      // Tournament Cache Store
      if (!database.objectStoreNames.contains(STORES.TOURNAMENT_CACHE)) {
        const tournamentStore = database.createObjectStore(STORES.TOURNAMENT_CACHE, { keyPath: 'id' });
        tournamentStore.createIndex('startDate', 'start_date', { unique: false });
      }

      // Sync Queue Store
      if (!database.objectStoreNames.contains(STORES.SYNC_QUEUE)) {
        database.createObjectStore(STORES.SYNC_QUEUE, { keyPath: 'id', autoIncrement: true });
      }

      console.log('[Offline] Database schema initialized');
    };
  });
}

// ─── VOICE CAPTURES ───────────────────────────────────────────────────────

export async function saveVoiceCapture(audioBlob, playerId, sessionId, metadata = {}) {
  if (!db) await initOfflineStorage();

  const capture = {
    audioBlob,
    playerId,
    sessionId,
    timestamp: new Date().toISOString(),
    synced: false,
    metadata,
    id: `${playerId}-${Date.now()}`
  };

  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORES.VOICE_CAPTURES, 'readwrite');
    const store = tx.objectStore(STORES.VOICE_CAPTURES);
    const request = store.add(capture);

    request.onsuccess = () => {
      console.log('[Offline] Voice capture saved:', capture.id);
      resolve(capture);
    };
    request.onerror = () => reject(request.error);
  });
}

export async function getPendingVoiceCaptures() {
  if (!db) await initOfflineStorage();

  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORES.VOICE_CAPTURES, 'readonly');
    const store = tx.objectStore(STORES.VOICE_CAPTURES);
    const index = store.index('synced');
    const request = index.getAll(false);

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

export async function markVoiceCaptureSynced(captureId) {
  if (!db) await initOfflineStorage();

  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORES.VOICE_CAPTURES, 'readwrite');
    const store = tx.objectStore(STORES.VOICE_CAPTURES);
    const request = store.get(captureId);

    request.onsuccess = () => {
      const capture = request.result;
      if (capture) {
        capture.synced = true;
        store.put(capture);
        console.log('[Offline] Voice capture marked as synced:', captureId);
        resolve(capture);
      }
    };
    request.onerror = () => reject(request.error);
  });
}

// ─── SESSION DRAFTS ───────────────────────────────────────────────────────

export async function saveSessionDraft(playerId, data) {
  if (!db) await initOfflineStorage();

  const draft = {
    id: `draft-${playerId}-${Date.now()}`,
    playerId,
    timestamp: new Date().toISOString(),
    data
  };

  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORES.SESSION_DRAFTS, 'readwrite');
    const store = tx.objectStore(STORES.SESSION_DRAFTS);
    const request = store.add(draft);

    request.onsuccess = () => {
      console.log('[Offline] Session draft saved:', draft.id);
      resolve(draft);
    };
    request.onerror = () => reject(request.error);
  });
}

export async function getSessionDrafts(playerId) {
  if (!db) await initOfflineStorage();

  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORES.SESSION_DRAFTS, 'readonly');
    const store = tx.objectStore(STORES.SESSION_DRAFTS);
    const index = store.index('playerId');
    const request = index.getAll(playerId);

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

// ─── CACHE MANAGEMENT ───────────────────────────────────────────────────

export async function cachePlayerData(players) {
  if (!db) await initOfflineStorage();

  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORES.PLAYER_CACHE, 'readwrite');
    const store = tx.objectStore(STORES.PLAYER_CACHE);

    players.forEach(player => {
      store.put(player);
    });

    tx.oncomplete = () => {
      console.log('[Offline] Cached', players.length, 'players');
      resolve();
    };
    tx.onerror = () => reject(tx.error);
  });
}

export async function getCachedPlayers() {
  if (!db) await initOfflineStorage();

  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORES.PLAYER_CACHE, 'readonly');
    const store = tx.objectStore(STORES.PLAYER_CACHE);
    const request = store.getAll();

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

export async function cacheTournamentData(tournaments) {
  if (!db) await initOfflineStorage();

  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORES.TOURNAMENT_CACHE, 'readwrite');
    const store = tx.objectStore(STORES.TOURNAMENT_CACHE);

    tournaments.forEach(tournament => {
      store.put(tournament);
    });

    tx.oncomplete = () => {
      console.log('[Offline] Cached', tournaments.length, 'tournaments');
      resolve();
    };
    tx.onerror = () => reject(tx.error);
  });
}

export async function getCachedTournaments() {
  if (!db) await initOfflineStorage();

  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORES.TOURNAMENT_CACHE, 'readonly');
    const store = tx.objectStore(STORES.TOURNAMENT_CACHE);
    const request = store.getAll();

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

// ─── SYNC QUEUE ───────────────────────────────────────────────────────────

export async function addToSyncQueue(action, data) {
  if (!db) await initOfflineStorage();

  const queueItem = {
    action,
    data,
    timestamp: new Date().toISOString(),
    synced: false
  };

  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORES.SYNC_QUEUE, 'readwrite');
    const store = tx.objectStore(STORES.SYNC_QUEUE);
    const request = store.add(queueItem);

    request.onsuccess = () => {
      console.log('[Offline] Added to sync queue:', action);
      resolve(queueItem);
    };
    request.onerror = () => reject(request.error);
  });
}

export async function getSyncQueue() {
  if (!db) await initOfflineStorage();

  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORES.SYNC_QUEUE, 'readonly');
    const store = tx.objectStore(STORES.SYNC_QUEUE);
    const request = store.getAll();

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

export async function clearSyncQueue() {
  if (!db) await initOfflineStorage();

  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORES.SYNC_QUEUE, 'readwrite');
    const store = tx.objectStore(STORES.SYNC_QUEUE);
    const request = store.clear();

    request.onsuccess = () => {
      console.log('[Offline] Sync queue cleared');
      resolve();
    };
    request.onerror = () => reject(request.error);
  });
}

// ─── NETWORK STATUS ───────────────────────────────────────────────────────

export function isOnline() {
  return navigator.onLine;
}

export function onOnline(callback) {
  window.addEventListener('online', callback);
}

export function onOffline(callback) {
  window.addEventListener('offline', callback);
}

export function registerSyncListener(callback) {
  if ('serviceWorker' in navigator && 'SyncManager' in window) {
    navigator.serviceWorker.ready.then((registration) => {
      registration.sync.register('sync-voice-captures').then(() => {
        console.log('[Offline] Background sync registered');
        callback();
      });
    });
  }
}

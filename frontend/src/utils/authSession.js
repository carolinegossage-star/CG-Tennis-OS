const API_BASE = import.meta.env.VITE_API_URL ?? '';

const ACCESS_TOKEN_KEY = 'cgto_token';
const REFRESH_TOKEN_KEY = 'cgto_refresh_token';
let refreshInFlight = null;
let installed = false;

function requestUrl(input) {
  if (typeof input === 'string') return input;
  if (input instanceof URL) return input.toString();
  if (input instanceof Request) return input.url;
  return '';
}

function isAuthEndpoint(url) {
  return ['/auth/login', '/auth/register', '/auth/refresh-token'].some(path => url.includes(path));
}

function hasBearerToken(input, init = {}) {
  const headers = new Headers(init.headers ?? (input instanceof Request ? input.headers : undefined));
  return headers.has('Authorization');
}

function clearSession() {
  localStorage.removeItem(ACCESS_TOKEN_KEY);
  localStorage.removeItem(REFRESH_TOKEN_KEY);
}

export function storeSession({ accessToken, refreshToken }) {
  if (accessToken) localStorage.setItem(ACCESS_TOKEN_KEY, accessToken);
  if (refreshToken) localStorage.setItem(REFRESH_TOKEN_KEY, refreshToken);
}

async function refreshAccessToken(nativeFetch) {
  if (refreshInFlight) return refreshInFlight;

  refreshInFlight = (async () => {
    const refreshToken = localStorage.getItem(REFRESH_TOKEN_KEY);
    if (!refreshToken) throw new Error('Your session has ended. Please sign in again.');

    const response = await nativeFetch(`${API_BASE}/auth/refresh-token`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refreshToken }),
    });
    const data = await response.json().catch(() => ({}));

    if (!response.ok || !data.accessToken) {
      clearSession();
      throw new Error(data.error || 'Your session has ended. Please sign in again.');
    }

    storeSession(data);
    return data.accessToken;
  })();

  try {
    return await refreshInFlight;
  } finally {
    refreshInFlight = null;
  }
}

function redirectToLogin() {
  const next = `${window.location.pathname}${window.location.search}`;
  window.location.assign(`/login?next=${encodeURIComponent(next)}`);
}

export function installAuthRefresh() {
  if (installed || typeof window === 'undefined') return;
  installed = true;

  const nativeFetch = window.fetch.bind(window);
  window.fetch = async (input, init = {}) => {
    const response = await nativeFetch(input, init);
    const url = requestUrl(input);

    if (response.status !== 401 || isAuthEndpoint(url) || !hasBearerToken(input, init)) return response;

    try {
      const accessToken = await refreshAccessToken(nativeFetch);
      const headers = new Headers(init.headers ?? (input instanceof Request ? input.headers : undefined));
      headers.set('Authorization', `Bearer ${accessToken}`);
      return nativeFetch(input, { ...init, headers });
    } catch {
      redirectToLogin();
      return response;
    }
  };
}

export { ACCESS_TOKEN_KEY, REFRESH_TOKEN_KEY, clearSession };

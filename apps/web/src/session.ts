const storageKey = 'memecoin.session';

export function takeSession(): string | null {
  const fragment = new URLSearchParams(window.location.hash.slice(1));
  const incoming = fragment.get('session');
  // Clear the fragment even when storage is unavailable or the token is malformed.
  if (window.location.hash) window.history.replaceState(null, '', window.location.pathname + window.location.search);
  try {
    if (incoming !== null) {
      sessionStorage.removeItem(storageKey);
      if (/^[A-Za-z0-9_-]{43}$/.test(incoming)) sessionStorage.setItem(storageKey, incoming);
    }
    return sessionStorage.getItem(storageKey);
  } catch { return null; }
}

export function clearSession(): void {
  try { sessionStorage.removeItem(storageKey); } catch { /* Storage may be disabled. */ }
}

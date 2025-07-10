// frontend/src/utils/api.ts
/* ------------------------------------------------------------------ */
/* Build backend base URL (honours HTTPS vs HTTP)                     */
/* ------------------------------------------------------------------ */
export const BACKEND_BASE = (() => {
  const proto = location.protocol === 'https:' ? 'https' : 'http';
  return `${proto}://${location.hostname}:3000`;
})();

/* ------------------------------------------------------------------ */
/* Thin wrapper around fetch:                                         */
/*   • Always sends cookies (credentials: 'include').                 */
/*   • No automatic Authorization header — JWT is in HttpOnly cookie. */
/* ------------------------------------------------------------------ */
export async function apiFetch(path: string, opts: RequestInit = {}): Promise<Response> {
  const url        = path.startsWith('http') ? path : `${BACKEND_BASE}${path}`;
  const finalOpts: RequestInit = {
    credentials: 'include',   // <-- cookie travels both directions
    ...opts                   // caller can override/add headers, body, etc.
  };
  return fetch(url, finalOpts);
}

/* ------------------------------------------------------------------ */
/* WebSocket scheme helper                                            */
/* ------------------------------------------------------------------ */
export function wsBase(): string {
  return location.protocol === 'https:' ? 'wss' : 'ws';
}

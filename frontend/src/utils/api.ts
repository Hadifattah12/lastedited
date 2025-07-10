// frontend/src/utils/api.ts
export const BACKEND_BASE = (() => {
  const proto = location.protocol === 'https:' ? 'https' : 'http';
  return `${proto}://${location.hostname}:3000`;
})();

export async function apiFetch(path: string, opts: RequestInit = {}): Promise<Response> {
  const url = path.startsWith('http') ? path : `${BACKEND_BASE}${path}`;
  return fetch(url, opts);
}

export function wsBase(): string {
  return location.protocol === 'https:' ? 'wss' : 'ws';
}

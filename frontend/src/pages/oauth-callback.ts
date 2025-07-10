// src/pages/oauth-callback.ts
export function handleOAuthCallback(): void {
  const hash = window.location.hash;          // "#/oauth-callback?token=…&user=…"
  const [, query = ''] = hash.split('?');
  const params = new URLSearchParams(query);

  const token = params.get('token');
  const userB64 = params.get('user');

  if (token && userB64) {
    localStorage.setItem('token', token);
    try {
      const userJson = atob(userB64);
      localStorage.setItem('user', userJson);
    } catch {
      /* ignore decode errors */
    }
  }
  // Jump to real home page (now that storage is filled)
  window.location.replace('#/home');
}

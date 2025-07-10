// src/pages/oauth-callback.ts
export function handleOAuthCallback(): void {
  // URL looks like "#/oauth-callback?user=<base64>"
  const [, query = ''] = window.location.hash.split('?');
  const params = new URLSearchParams(query);

  const userB64 = params.get('user');

  if (userB64) {
    try {
      const userJson = atob(userB64);
      localStorage.setItem('user', userJson);    // harmless UI data only
    } catch {
      /* ignore decode errors */
    }
  }

  // Cookie (access_token) was already set server-side → go to home
  window.location.replace('#/home');
}

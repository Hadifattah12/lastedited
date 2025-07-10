/* src/utils/resolveAvatar.ts
   -------------------------------------------------------------- */
export function resolveAvatar(path?: string | null): string {
  /* built-in placeholder */
  if (!path) return '../photo/img_avatar.png';

  /* already an absolute URL */
  if (path.startsWith('http')) return path;

  /* ----------------------------------------------------------------
   * Dynamic backend origin
   * ----------------------------------------------------------------
   * 1) If you define VITE_API_BASE (e.g. "https://api.my-site.com"),
   *    we’ll use it.
   * 2) Otherwise we fall back to the page’s own protocol + hostname
   *    and assume your Fastify server is listening on :3000.
   * ---------------------------------------------------------------- */
  const backendOrigin =
    (import.meta.env.VITE_API_BASE as string | undefined)?.replace(/\/+$/, '') ||
    `${window.location.protocol}//${window.location.hostname}:3000`;

  /* ensure single slash between origin and path */
  return `${backendOrigin}${path.startsWith('/') ? '' : '/'}${path}`;
}

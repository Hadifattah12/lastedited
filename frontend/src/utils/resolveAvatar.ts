export function resolveAvatar(path?: string | null): string {
  if (!path) return '../photo/img_avatar.png';          // extra fallback
  if (path.startsWith('http')) return path;             // absolute URL
  return `https://localhost:3000${path}`;               // relative → full
}

const SUPABASE_DOMAIN = 'xbjgdsyukjdkfvcbzmjc.supabase.co';
const R2_PUBLIC_DOMAIN = 'pub-e16c7a50584c4db7be3571746cd80716.r2.dev';

/**
 * Transform image URL to mosaic proxy URL.
 * Supports Supabase, R2 (via /api/images/ or r2.dev), and other listing image URLs.
 * Use on public-facing pages only (admin pages show originals).
 */
export function getMosaicUrl(originalUrl: string): string {
  if (!originalUrl) return originalUrl;

  // Already proxied
  if (originalUrl.startsWith('/api/mosaic-image')) {
    return originalUrl;
  }

  // Check if this is a listing image URL that needs mosaic
  const isSupabase = originalUrl.includes(SUPABASE_DOMAIN);
  const isR2Proxy = originalUrl.includes('/api/images/');
  const isR2Direct = originalUrl.includes(R2_PUBLIC_DOMAIN);

  if (isSupabase || isR2Proxy || isR2Direct) {
    return `/api/mosaic-image?url=${encodeURIComponent(originalUrl)}`;
  }

  return originalUrl;
}

/**
 * Extract original URL from mosaic proxy URL (for admin pages)
 */
export function getOriginalUrl(url: string): string {
  if (url.startsWith('/api/mosaic-image')) {
    const params = new URLSearchParams(url.split('?')[1]);
    return params.get('url') || url;
  }
  return url;
}

const SUPABASE_DOMAIN = 'xbjgdsyukjdkfvcbzmjc.supabase.co';

/**
 * Supabase image URL to mosaic proxy URL
 * Only transforms Supabase URLs; others pass through unchanged.
 * Use on public-facing pages only (admin pages show originals).
 */
export function getMosaicUrl(originalUrl: string): string {
  if (!originalUrl || !originalUrl.includes(SUPABASE_DOMAIN)) {
    return originalUrl;
  }
  if (originalUrl.startsWith('/api/mosaic-image')) {
    return originalUrl;
  }
  return `/api/mosaic-image?url=${encodeURIComponent(originalUrl)}`;
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

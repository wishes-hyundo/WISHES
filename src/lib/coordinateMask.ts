/**
 * Coordinate Masking for Privacy (CLAUDE.md /map C5)
 *
 * Non-logged-in users see locations masked to building-block level (0.001° precision)
 * Logged-in users see precise coordinates
 *
 * 1° latitude ≈ 111km, 1° longitude ≈ 88km (Seoul)
 * 0.001° ≈ 110m (building-block level — 정확한 주소 보호하면서 매물 시각 분리 가능)
 *
 * L-mapfix-2026-05-02 (사장님 명령): 이전 0.01° (1.1km) 마스킹은 너무 거침 →
 * 매물 수십~수백 개가 한 점에 모여 마커 1개로 보였음 (사장님이 본 모든 결함의 본질).
 * 사용성 우선으로 0.001° (110m, 단지 단위) 로 완화. 정확한 주소는 여전히 보호.
 */

export interface CoordinateData {
  lat: number;
  lng: number;
  dong?: string;
  [key: string]: unknown;
}

/**
 * Mask precise coordinates to dong-level (0.01° precision)
 * Used for non-logged-in users viewing map
 */
export function maskCoordinate(lat: number, lng: number): { lat: number; lng: number } {
  // L-mapfix-2026-05-02 (사장님 명령): Round to 3 decimal places (~110m accuracy)
  // 단지 단위 보호 — 정확한 주소 노출 안 하면서 매물 시각 분리 가능.
  // 이전 0.01° (1.1km) 는 매물 수십~수백 개가 한 점에 모여 마커 1개로 보임.
  return {
    lat: Math.round(lat * 1000) / 1000,
    lng: Math.round(lng * 1000) / 1000,
  };
}

/**
 * Mask coordinates in a listing object
 * @param listing - Listing object with lat/lng
 * @param isAuthenticated - Whether user is logged in
 * @returns Modified listing with masked coordinates if not authenticated
 */
export function maskListingCoordinates<T extends CoordinateData>(
  listing: T,
  isAuthenticated: boolean
): T {
  if (isAuthenticated) {
    return listing; // Return precise coordinates for logged-in users
  }

  // Mask coordinates for non-logged-in users
  const { lat, lng } = maskCoordinate(listing.lat, listing.lng);
  return {
    ...listing,
    lat,
    lng,
  };
}

/**
 * Mask coordinates in an array of listings
 */
export function maskListingsCoordinates<T extends CoordinateData>(
  listings: T[],
  isAuthenticated: boolean
): T[] {
  if (isAuthenticated) {
    return listings;
  }

  return listings.map((listing) => maskListingCoordinates(listing, false));
}

/**
 * Check if coordinates are masked
 * (Used for testing/debugging)
 */
export function isCoordinateMasked(lat: number, lng: number): boolean {
  // If coordinates have >2 decimal places, they're not masked
  const latStr = lat.toString();
  const lngStr = lng.toString();

  const latDecimals = latStr.includes('.') ? latStr.split('.')[1].length : 0;
  const lngDecimals = lngStr.includes('.') ? lngStr.split('.')[1].length : 0;

  return latDecimals <= 3 && lngDecimals <= 3;
}

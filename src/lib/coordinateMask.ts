/**
 * Coordinate Masking for Privacy (CLAUDE.md /map C5)
 *
 * Non-logged-in users see locations masked to dong-level (0.01° precision)
 * Logged-in users see precise coordinates
 *
 * 1° latitude ≈ 111km, 1° longitude ≈ 88km (Seoul)
 * 0.01° ≈ 1.1km (acceptable dong-level accuracy for privacy)
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
  // Round to 2 decimal places (≈ 1.1km accuracy)
  // This reveals approximate dong, not precise building location
  return {
    lat: Math.round(lat * 100) / 100,
    lng: Math.round(lng * 100) / 100,
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

  return latDecimals <= 2 && lngDecimals <= 2;
}

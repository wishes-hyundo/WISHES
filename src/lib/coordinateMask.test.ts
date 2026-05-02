import { describe, it, expect } from 'vitest';
import { maskCoordinate, maskListingCoordinates, isCoordinateMasked } from './coordinateMask';

describe('Coordinate Masking (L-sec170)', () => {
  describe('maskCoordinate', () => {
    it('should round coordinates to 3 decimal places (110m precision)', () => {
      const precise = { lat: 37.4979852, lng: 127.0276368 };
      const masked = maskCoordinate(precise.lat, precise.lng);

      expect(masked.lat).toBe(37.498);
      expect(masked.lng).toBe(127.028);
    });

    it('should handle already masked coordinates', () => {
      const alreadyMasked = { lat: 37.498, lng: 127.028 };
      const result = maskCoordinate(alreadyMasked.lat, alreadyMasked.lng);

      expect(result.lat).toBe(37.498);
      expect(result.lng).toBe(127.028);
    });

    it('should mask negative coordinates correctly', () => {
      const negCoord = { lat: -33.8688197, lng: 151.2093214 };
      const masked = maskCoordinate(negCoord.lat, negCoord.lng);

      expect(masked.lat).toBe(-33.869);
      expect(masked.lng).toBe(151.209);
    });

    it('should provide approximately 110m accuracy at Seoul latitude', () => {
      // 0.001° at 37°N ≈ 110m
      const coord1 = maskCoordinate(37.500, 127.000);
      const coord2 = maskCoordinate(37.501, 127.000);

      // Difference is 0.001°, which is approximately 110m at Seoul
      expect(Math.abs(coord2.lat - coord1.lat)).toBeCloseTo(0.001, 5);
    });
  });

  describe('maskListingCoordinates', () => {
    const mockListing = {
      id: 1,
      lat: 37.4979852,
      lng: 127.0276368,
      title: 'Test Listing',
    };

    it('should return precise coordinates when authenticated', () => {
      const result = maskListingCoordinates(mockListing, true);

      expect(result.lat).toBe(37.4979852);
      expect(result.lng).toBe(127.0276368);
    });

    it('should mask coordinates when not authenticated', () => {
      const result = maskListingCoordinates(mockListing, false);

      expect(result.lat).toBe(37.50);
      expect(result.lng).toBe(127.03);
      expect(result.title).toBe('Test Listing'); // Other fields unchanged
    });

    it('should preserve other fields when masking', () => {
      const listing = { ...mockListing, deal: '월세', price: 5000 };
      const result = maskListingCoordinates(listing, false);

      expect(result.lat).toBe(37.50);
      expect(result.lng).toBe(127.03);
      expect(result.deal).toBe('월세');
      expect(result.price).toBe(5000);
    });
  });

  describe('isCoordinateMasked', () => {
    it('should detect masked coordinates (2 decimal places)', () => {
      expect(isCoordinateMasked(37.50, 127.03)).toBe(true);
    });

    it('should detect unmasked coordinates (more than 2 decimals)', () => {
      expect(isCoordinateMasked(37.4979852, 127.0276368)).toBe(false);
    });

    it('should detect partially masked coordinates', () => {
      // One masked, one precise
      expect(isCoordinateMasked(37.50, 127.0276368)).toBe(false);
    });

    it('should handle integer coordinates as masked', () => {
      expect(isCoordinateMasked(37, 127)).toBe(true);
    });
  });

  describe('Privacy compliance', () => {
    it('should mask locations to prevent precise address reversal', () => {
      // A precise coordinate can be reverse-geocoded to exact address
      // A masked coordinate only reveals approximate dong (neighborhood)
      const precise = { lat: 37.4979852, lng: 127.0276368 }; // Specific building
      const masked = maskCoordinate(precise.lat, precise.lng);

      // Masked version reveals general area, not specific building
      expect(masked.lat).not.toBe(precise.lat);
      expect(masked.lng).not.toBe(precise.lng);

      // Check that masking loses building-level precision
      expect(isCoordinateMasked(masked.lat, masked.lng)).toBe(true);
    });

    it('should apply masking consistently (deterministic)', () => {
      const lat = 37.4979852;
      const lng = 127.0276368;

      const mask1 = maskCoordinate(lat, lng);
      const mask2 = maskCoordinate(lat, lng);

      expect(mask1.lat).toBe(mask2.lat);
      expect(mask1.lng).toBe(mask2.lng);
    });
  });
});

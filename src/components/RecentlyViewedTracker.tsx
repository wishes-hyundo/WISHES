'use client';

import { useEffect } from 'react';
import { useFavorites } from '@/contexts/FavoritesContext';

interface RecentlyViewedTrackerProps {
  listingId: string;
}

export default function RecentlyViewedTracker({ listingId }: RecentlyViewedTrackerProps) {
  const { addRecentlyViewed } = useFavorites();

  useEffect(() => {
    const numId = parseInt(listingId);
    if (!isNaN(numId)) {
      addRecentlyViewed(numId);
    }
  }, [listingId, addRecentlyViewed]);

  return null;
}

'use client';

import { useEffect } from 'react';
import { useFavorites } from '@/contexts/FavoritesContext';

interface RecentlyViewedTrackerProps {
  listingId: string;
}

export default function RecentlyViewedTracker({ listingId }: RecentlyViewedTrackerProps) {
  const { addToRecentlyViewed } = useFavorites();

  useEffect(() => {
    addToRecentlyViewed(listingId);
  }, [listingId, addToRecentlyViewed]);

  return null;
}

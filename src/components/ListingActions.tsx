'use client';

import dynamic from 'next/dynamic';

const ShareButton = dynamic(() => import('./ShareButton'), { ssr: false });
const RecentlyViewedTracker = dynamic(() => import('./RecentlyViewedTracker'), { ssr: false });

interface ListingActionsProps {
  listingId: string;
  shareUrl: string;
  shareTitle: string;
  shareDescription: string;
}

export default function ListingActions({ listingId, shareUrl, shareTitle, shareDescription }: ListingActionsProps) {
  return (
    <>
      <RecentlyViewedTracker listingId={listingId} />
      <ShareButton url={shareUrl} title={shareTitle} description={shareDescription} />
    </>
  );
}

import { redirect } from 'next/navigation';
import BuyReportClient from './BuyReportClient';

export const dynamic = 'force-dynamic';

interface PageProps {
  params: Promise<{ listingId: string }>;
}

export default async function BuyReportPage({ params }: PageProps) {
  const { listingId: idStr } = await params;
  const listingId = Number.parseInt(idStr, 10);

  if (!Number.isFinite(listingId) || listingId <= 0) {
    redirect('/map');
  }

  return <BuyReportClient listingId={listingId} />;
}

export const metadata = {
  title: '권리분석 보고서 구매',
  robots: { index: false, follow: false },
};

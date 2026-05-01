import SuccessClient from './SuccessClient';

export const dynamic = 'force-dynamic';

export const metadata = {
  title: '결제 완료',
  robots: { index: false, follow: false },
};

interface PageProps {
  searchParams: Promise<{ paymentKey?: string; orderId?: string; amount?: string }>;
}

export default async function SuccessPage({ searchParams }: PageProps) {
  const sp = await searchParams;
  return <SuccessClient paymentKey={sp.paymentKey || ''} orderId={sp.orderId || ''} amount={sp.amount || ''} />;
}

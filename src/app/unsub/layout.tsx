import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: '알림 수신 해지',
  description: 'WISHES 매물 알림 수신 설정을 변경합니다.',
  robots: { index: false, follow: false },
};

export default function UnsubLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}

import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: '프로필 완성',
  description: 'WISHES 서비스 이용을 위한 필수 프로필 입력.',
  robots: { index: false, follow: false },
};

export default function CompleteProfileLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}

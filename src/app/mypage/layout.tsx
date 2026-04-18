import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: '마이페이지',
  description: 'WISHES 마이페이지 — 찜한 매물, 최근 본 매물, 저장된 검색 조건을 관리하세요.',
  robots: { index: false, follow: false },
};

export default function MyPageLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}

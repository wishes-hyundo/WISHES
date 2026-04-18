import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: '로그인',
  description: 'WISHES 로그인 — 찜 매물과 저장된 검색을 이어서 이용하세요.',
  robots: { index: false, follow: false },
};

export default function LoginLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}

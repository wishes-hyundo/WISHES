import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: '회원가입',
  description: 'WISHES 회원가입 — 찜 매물·저장 검색·신규 매물 알림까지 편하게 이용하세요.',
  robots: { index: false, follow: false },
};

export default function SignupLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}

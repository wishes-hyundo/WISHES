import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: '비밀번호 찾기',
  description: 'WISHES 비밀번호 재설정 — 가입된 이메일로 재설정 링크를 보내드립니다.',
  robots: { index: false, follow: false },
};

export default function ForgotPasswordLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}

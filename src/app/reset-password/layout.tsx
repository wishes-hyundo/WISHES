import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: '비밀번호 재설정',
  description: 'WISHES 새 비밀번호 설정.',
  robots: { index: false, follow: false },
};

export default function ResetPasswordLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}

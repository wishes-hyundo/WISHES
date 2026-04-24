import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'WISHES Command Center',
  description: '슈퍼어드민 전용 통합 관리 센터.',
  robots: { index: false, follow: false },
};

/**
 * /command 전용 standalone 레이아웃.
 * ConditionalLayout 이 /admin 만 custom 처리하므로 /command 는
 * 기본 AuthProvider/Header/Footer 스택을 피하기 위해 자체 레이아웃을 둔다.
 * 실제 auth 는 /command/page.tsx 가 직접 담당.
 */
export default function CommandLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}

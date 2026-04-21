// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// /map-2026 — 서버 엔트리 (RSC)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import MapClientWrapper from './MapClientWrapper';

export const metadata: Metadata = {
  title: 'MAP 2026 · WISHES',
  description: 'AI 큐레이션 기반 실시간 부동산 지도',
  robots: { index: false, follow: false },
};

export default function MapPage() {
  // 피처 플래그: NEXT_PUBLIC_MAP_2026=true 일 때만 노출
  if (process.env.NEXT_PUBLIC_MAP_2026 !== 'true') return notFound();

  return (
    // 외곽 ConditionalLayout 의 <main class="flex-1 overflow-hidden"> 가 이미 뷰포트 높이를
    // 책임지므로 여기서는 h-full 만 깔아 부모 높이를 그대로 물려받는다.
    <div className="h-full w-full">
      <MapClientWrapper />
    </div>
  );
}

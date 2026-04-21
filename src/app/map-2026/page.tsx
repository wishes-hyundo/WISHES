// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// /map-2026 — 서버 엔트리 (RSC)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
import type { Metadata } from 'next';
import MapClientWrapper from './MapClientWrapper';

export const metadata: Metadata = {
  title: 'MAP 2026 · WISHES',
  description: 'AI 큐레이션 기반 실시간 부동산 지도',
  robots: { index: false, follow: false },
};

export default function MapPage() {
  // MAP 2026 은 2026-04-21 PR #1 머지와 함께 프로덕션에 공개됨.
  // 기존 NEXT_PUBLIC_MAP_2026 피처 플래그는 제거 — env 미설정으로 인한 404 방지.
  // 필요시 /map 과 병존하며 점진 이관 (리디렉트는 별도 작업).

  return (
    // 외곽 ConditionalLayout 의 <main class="flex-1 overflow-hidden"> 가 이미 뷰포트 높이를
    // 책임지므로 여기서는 h-full 만 깔아 부모 높이를 그대로 물려받는다.
    <div className="h-full w-full">
      <MapClientWrapper />
    </div>
  );
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// /map — 서버 엔트리 (RSC)
//
//   2026-04-21 마이그레이션: 레거시 /map 페이지를 제거하고 MAP 2026
//   (Phase A~F, Category-First + Semantic Zoom + Hero Pin + 3D +
//   Cinematic Motion + Comparable-Aware) 을 canonical /map 경로로 승격.
//   기존 /map-2026 URL 은 next.config.js 에서 301 리디렉트로 보존.
//
//   SEO 메타데이터는 이 파일 상위의 src/app/map/layout.tsx 가 관리한다.
//   (title / description / canonical / openGraph — public indexable)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
import MapClientWrapper from './MapClientWrapper';

export default function MapPage() {
  return (
    // 외곽 ConditionalLayout 의 <main class="h-[100dvh] overflow-hidden"> 가
    // 뷰포트 높이를 책임지므로 여기서는 h-full 만 깔아 부모 높이를 그대로 물려받는다.
    <div className="h-full w-full">
      <MapClientWrapper />
    </div>
  );
}

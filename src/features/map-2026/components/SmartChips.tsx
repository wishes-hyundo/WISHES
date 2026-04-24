// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// SmartChips — Gate 진입 영역 (L-mapfilter3 재설계)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 🎯 구조 (2026-04-23)
//   · 상단: CategoryTabs (주거·상가/사무실·토지·투자) 만 노출
//   · 탭 클릭 → <FilterModal /> 오픈 (거래유형/Quick칩/상세 아코디언)
//   · 이전 Row 2(거래유형)/Row 3(Quick칩) 및 좌측 FilterAccordion 은
//     모두 모달 안으로 이관. 기본 화면을 최소화하여 "사용하기 너무
//     불편" 하던 정보 과밀 문제 해소.
//
// 이전 구현 히스토리 (참고):
//   L-mapfilter2 — 거래유형·Quick 칩을 카테고리 아래로 재배열 (여전히 always-on)
//   L-mapfilter1 — 아코디언 12 섹션 커버리지 + 스크롤 컨테이너
//   L-ux5-2     — "전체" pseudo-chip (deals=[] aria-pressed)
//   L-ux1       — 사진있음/전체해제 우측 정렬 병합
// 이 컴포넌트들이 참조하던 요소는 모두 FilterModal 로 옮겨갔으며,
// ClearAll 등 상시 노출이 필요한 요소는 ActiveFilterPills 쪽에서 제공.
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
'use client';

import { CategoryTabs } from './CategoryTabs';
import { FilterModal } from './FilterModal';

export function SmartChips() {
  return (
    <>
      <div className="border-b border-neutral-100 bg-white">
        <CategoryTabs />
      </div>
      <FilterModal />
    </>
  );
}

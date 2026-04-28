# CLAUDE.md — 절대 영구 규칙

## 🔴 최우선 규칙 (절대 까먹지 않음)

**모든 작업은 2026년 현시점 전세계 가장 최근 기준으로**
**가장 우수하고 최고의 기술과 스킬을 사용해서 작업한다.**

이 규칙은 영구하며 모든 파일 수정, 기능 추가, 버그 수정, 디자인 결정에 적용됨.

---

## 🚫 `/search` 절대 손대지 마라 (사장님 명령 2026-04-28)

`wishes.co.kr/search` = 중개사가 사용하기 가장 편한 UI 로 13년 동안 최적화된 작업장.

**보존 대상 (영구)**:
- `src/app/search/page.tsx` (451줄)
- `src/app/search/layout.tsx`
- `public/search/content.js` (13,671줄)
- `public/search/content-v230~v300-*.js` (14 patch)
- `public/search/styles.css` (850줄)

**금지**:
- React 재현 X
- BoB 컴포넌트, shadcn/ui, Tailwind 적용 X
- 디자인 변경 0
- pixel 단위 비교 검증도 X (이미 사장님 검증 완료한 상태)

**허용**:
- 새 기능은 `content-v301-...js` 패치 파일로 옛날 가게 안에 추가
- HTML 구조/CSS 손대지 않고 비즈니스 로직만 보강

**무효화된 부트스트랩 항목**:
- §7 Phase 2 ("UI 픽셀 React 재현") — 취소
- §11 #2 ("vanilla content.js 폐기") — 무효
- §11 #6 ("새 페이지 생성 X, 모든 게 /search 한 곳") — `/search` 강제 통합 의도 무효

---

## ✅ `/admin/*` 자유 (사장님 명령 2026-04-28)

`/admin/*` = 사장님이 사용. UI/UX 자유.

**허용**:
- 새 React 컴포넌트, shadcn/ui, Tailwind v4
- 디자인 변경, 새 admin 페이지 생성
- 기존 admin 페이지 강화/리팩토링

**무효화된 부트스트랩 항목**:
- §11 #7 ("/admin/* 유지 (Phase 3 후 폐기)") — `/admin/*` 영구 유지로 변경

---

## 🎞️ 위시스 필름 룩 영구 적용 (사장님 명령 2026-04-28)

**모든 위시스 사진/영상은 Fujifilm Classic Negative 레시피 자동 적용**.
명세 파일: `_WISHES_FILM_LOOK_RECIPE.md` (절대 삭제 X, 변경 시 사장님 승인 필수)

핵심 수치 (절대 까먹지 마라):
- Film: **Classic Negative**, Grain: Strong/Large, Colour Chrome FX: Strong (+ Blue Strong)
- WB: Auto (+3R/
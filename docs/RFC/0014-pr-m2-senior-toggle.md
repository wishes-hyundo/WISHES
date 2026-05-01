# RFC 0014 — PR-M-2: 시니어 토글 (큰 폰트 + 고대비 + 단순화)

> **상태**: Draft → 사장님 승인 대기
> **작성**: 2026-05-01
> **라벨**: `[UI:1]` `[approval-required]`
> **선행**: PR-M-1 (#32) — axe-core CI 통과 후
> **참조**: CLAUDE.md `#3 UI/UX — WCAG 2.2 AAA` / `세 페르소나 — 시니어/고령` / 헌법 §54

---

## 0. 11 줄 자기검증

- [x] Discovery — 시니어 사용자 비율 = 부동산 의사결정자의 30%+
- [x] 회귀 0 — opt-in only, 기본 OFF (기존 사용자 영향 0)
- [x] 무료/OSS — CSS 변수 + localStorage (라이브러리 0)
- [x] 만든 것 보존 — 기본 디자인 토큰 그대로, 토글 활성 시에만 override
- [x] UI 헌법 §54 — 토글 OFF 상태 픽셀 변경 0
- [x] 네이버·구글 SEO — 영향 0 (CSS only, DOM 동일)
- [x] 5 층 방어 — axe-core CI (PR-M-1) + 시각 회귀 spec
- [x] 0 회귀 머지
- [x] 세 페르소나 — **시니어 페르소나 1순위** (헌법 명시)
- [x] Phase 1 인프라 보강
- [ ] [UI:1] — 사장님 승인 필수

---

## 1. 목적

부동산 의사결정자의 상당 비율이 시니어 (50대+). 현재 UI는 일반 사용자 기준 디자인. **opt-in 시니어 모드** 로 폰트 1.25배, 고대비 색상, 작은 인터랙티브 요소 단순화.

---

## 2. Scope (4 파일 추가, 2 파일 수정)

### 2.1 신규 — CSS 변수 정의
`src/app/globals.css` 에 추가:
```css
[data-senior="true"] {
  --font-base: 1.125rem;        /* 18px → 22.5px */
  --font-h1: 2.25rem;           /* 36px → 45px */
  --line-height: 1.7;
  --color-text: oklch(15% 0 0);  /* 더 어두운 검정 (대비 ↑) */
  --color-bg: oklch(99% 0 0);
  --color-link: oklch(35% 0.15 250); /* 더 진한 파랑 */
  --tap-target-min: 56px;       /* 44px → 56px (모바일 터치) */
}
```

### 2.2 신규 — 토글 컴포넌트
`src/components/SeniorToggle.tsx` (60줄):
- 우측 하단 floating button (시니어 모드 ON/OFF)
- localStorage 상태 영속
- `<html data-senior="true|false">` 적용
- 시스템 prefers-reduced-motion 동시 활성화

### 2.3 신규 — 시각 회귀 spec
`tests/dom-snapshot/a11y-senior-on.spec.ts`:
- 시니어 모드 ON 상태 axe-core 게이트
- WCAG 2.2 AAA `color-contrast-enhanced` 검사
- 터치 타깃 `>=56px` 검증

### 2.4 신규 — RFC 본 문서
`docs/RFC/0014-pr-m2-senior-toggle.md`

### 2.5 수정 — Layout 통합
`src/app/layout.tsx`:
- `<html lang="ko">` → `<html lang="ko" data-senior={cookie}>` (SSR hydration 깜빡임 방지)
- `<SeniorToggle />` mount

### 2.6 수정 — 헬프 hint
첫 방문 시 우측 하단 토글 옆 "👴 큰 글씨" 힌트 (3초 후 페이드)

---

## 3. UX

### 3.1 발견 가능성
- 모든 페이지 우측 하단 floating button (모바일 56×56, 데스크탑 48×48)
- 처음 방문 시 3초 hint 풍선
- 활성 시 button 색상 반전 (시각 피드백)

### 3.2 영속성
- `localStorage.setItem('wishes-senior', '1')`
- SSR cookie 동기화 (`__senior=1`) — hydration 깜빡임 0

### 3.3 시스템 통합
- `@media (prefers-reduced-motion)` 자동 활성화
- 향후 PR-M-3 에서 `@media (forced-colors)` (Windows 고대비) 통합

---

## 4. 구현 디테일

### 4.1 ARIA
```tsx
<button
  aria-pressed={isSenior}
  aria-label="큰 글씨 모드 켜기/끄기"
  className="senior-toggle"
>
```

### 4.2 키보드
- `Alt+S` 글로벌 단축키 (시니어 토글)
- Focus ring 두께 4px (기본 2px → 시니어 모드)

### 4.3 터치 타깃
시니어 모드 ON 시 모든 button/link 최소 56×56 (heuristic class `.senior-tap`)

---

## 5. 회귀 안전망

### 5.1 axe-core (PR-M-1) 자동 검증
- WCAG 2.2 AAA `color-contrast-enhanced` (시니어 모드 ON)
- WCAG 2.1 AA (시니어 모드 OFF)

### 5.2 시각 회귀
- a11y-home/a11y-map 기존 spec 유지 (OFF 상태)
- a11y-senior-on.spec.ts 신규 (ON 상태)

### 5.3 Lighthouse
- Accessibility score >= 95 (현재 88) — 토글 ON 상태 측정

---

## 6. 위험 + 완화

| 위험 | 완화 |
|---|---|
| SSR/CSR hydration 시 폰트 깜빡임 | cookie 기반 SSR 초기 렌더 |
| localStorage 차단 환경 | cookie fallback (1년 만료) |
| 토글 buton 이 다른 floating UI 와 겹침 | z-index 99, 우측 하단 fixed (지도 핀 회피) |
| 시니어 모드가 일반 사용자에게 보이면 디자인 훼손 | floating button 만 노출, 모드 OFF 시 스타일 영향 0 |

---

## 7. 보존 (헌법 §101)

- 기본 디자인 토큰 (--font-base, --color-text 등) 변경 X
- 모든 페이지 OFF 상태 픽셀 동일
- /search vanilla, /admin/* 영향 0 (data-senior 무시)

---

## 8. 사장님 결정 필요

1. **floating button 위치**: 우측 하단 vs 헤더 우측?
2. **폰트 배율**: 1.25× (제안) vs 1.5×?
3. **첫 방문 hint**: 자동 표시 vs 100% opt-in (사용자가 발견)?

---

## 9. 후속 PR

- **PR-M-3** moderate 등급 axe 게이트 (3개월 안정 후)
- **PR-M-4** Windows 고대비 + forced-colors 통합
- **PR-M-5** Voice-Over / TalkBack 시나리오 spec

---

작성: 2026-05-01 (PR-M-1 직후)

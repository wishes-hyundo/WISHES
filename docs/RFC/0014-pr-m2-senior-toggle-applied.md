# RFC 0014 적용 완료 — 시니어 토글

> **상태**: 적용 완료 (2026-05-01)
> **참조**: RFC 0014 (origin)

---

## 적용 결과 (사장님 추천 default)

### 결정 사항 (RFC 0014 §8 사장님 결정 - 추천 default 사용)
1. **floating button 위치** — 우측 하단 (RFC 추천)
2. **폰트 배율** — 1.25× (RFC 추천)
3. **첫 방문 hint** — 추후 별도 PR (단순화)

### 변경 (4 파일)

| 파일 | 변경 내용 |
|---|---|
| `src/app/globals.css` | `[data-senior="true"]` CSS 규칙 +85 lines |
| `src/components/SeniorToggle.tsx` | 신규 클라이언트 컴포넌트 (104 lines) |
| `src/app/layout.tsx` | import + `<SeniorToggle />` mount |
| `tests/dom-snapshot/a11y-senior-on.spec.ts` | 신규 a11y spec (38 lines) |

### 핵심 구현
- **opt-in only** — 기본 OFF, 토글 OFF 상태 픽셀 변경 0
- **localStorage + cookie** — 영속 (1년)
- **Alt+S** 키보드 단축키
- **prefers-reduced-motion** 자동 활성화 (시스템 통합)
- **/search vanilla / /admin 영향 0** (`body[data-route]` CSS 숨김)

### CSS 규칙 (요약)
```css
[data-senior="true"] {
  font-size: 1.125rem;  /* ×1.25 */
  line-height: 1.7;
}
[data-senior="true"] h1 { font-size: 2.25rem; }
[data-senior="true"] a:not(.no-senior-style) {
  text-decoration: underline;
  text-underline-offset: 2px;
  text-decoration-thickness: 2px;
}
[data-senior="true"] *:focus-visible {
  outline: 4px solid #2563eb !important;
}
```

### 토글 컴포넌트
```tsx
<button aria-pressed={on} aria-label={...}>
  👴 큰 글씨 {on ? 'ON' : ''}
</button>
```

### 회귀 안전망
- a11y-senior-on.spec.ts — 시니어 모드 ON 상태 axe-core 게이트
- 기존 a11y-home / a11y-map spec (PR-M-1) — OFF 상태 그대로
- chromium project testMatch 자동 분리 (PR-M-1 negative-lookahead)

### UI 영향
- **OFF 상태**: 픽셀 변경 0 (data-senior 미설정)
- **ON 상태**: 사용자 의식적 선택 후만 발생

### 헌법 준수
- §3 'WCAG 2.2 AAA' 명령 → axe-core 게이트로 회귀 차단
- §47 `/search` 영향 0 → CSS 숨김
- §48 `/admin` 영향 0 → CSS 숨김
- 세 페르소나 — 시니어 1순위 페르소나 명시 충족

---

## 후속

- **PR-M-2-2** SSR cookie 기반 초기 렌더 (FOUC 0)
- **PR-M-2-3** 첫 방문 3초 hint 풍선 (사장님 후속 결정)
- **PR-M-3** moderate 등급 axe 게이트 (3개월 안정 후)

---

작성: 2026-05-01 (RFC 0014 origin 적용)

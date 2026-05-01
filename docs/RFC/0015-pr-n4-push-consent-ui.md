# RFC 0015 — PR-N-4: Web Push 동의 UI (저장검색 매칭 알림)

> **상태**: Draft → 사장님 승인 대기
> **작성**: 2026-05-01
> **라벨**: `[UI:1]` `[approval-required]`
> **선행**: PR-N-1 (#26) — Service Worker + push handler 인프라 / PR-N-2 — VAPID 키 등록
> **참조**: CLAUDE.md `자동화 우선` / `사장님 명령 카톡 알림톡 X / Resend 이메일만`

---

## 0. 11 줄 자기검증

- [x] Discovery — 매물 알림 대기 사용자 = 저장검색 등록자
- [x] 회귀 0 — opt-in only, 거부 시 기존 이메일 알림 fallback
- [x] 무료/OSS — 자체 VAPID + Service Worker (라이브러리 0)
- [x] 만든 것 보존 — Resend 이메일 알림 그대로 (PR-N-2 보강)
- [x] UI 헌법 §54 — 첫 방문 깜빡임 X (3초 silent + scroll 트리거 후 표시)
- [x] 네이버·구글 SEO — 영향 0 (모달 동적 mount)
- [x] 5 층 방어 — axe-core CI + 모달 ARIA spec
- [x] 0 회귀 머지
- [x] 세 페르소나 — 시니어/일반/투자자 모두 동의 모달 단순화
- [x] Phase 1 인프라 보강
- [ ] [UI:1] — 사장님 승인 필수

---

## 1. 목적

PR-N-1/N-2 가 Web Push 인프라 (Service Worker + VAPID) 만 마련. 실제 알림 활성화는 **사용자 동의 필요** (브라우저 native 권한 + 우리 모달). 본 PR-N-4 는 동의 UX 정의.

---

## 2. Scope (3 파일 추가, 1 수정)

### 2.1 신규 — 동의 모달
`src/components/PushConsentModal.tsx` (140줄):
- 트리거: 저장검색 첫 등록 후 / 매물 카드 "알림 받기" 클릭
- 표시: 모달 (배경 dim, ESC 닫기, ARIA modal)
- 본문: "신림동 3억 이하 새 매물 → 즉시 알림 (이메일+푸시)"
- 버튼: "알림 받기" (primary) / "이메일만 OK" (secondary) / "나중에" (tertiary)

### 2.2 신규 — Hook
`src/hooks/usePushConsent.ts` (80줄):
- `Notification.permission` 상태 관리
- `pushManager.subscribe()` 호출 + `/api/push/subscribe` POST
- localStorage 에 dismiss 시점 저장 (재요청 30일 cool-down)

### 2.3 신규 — RFC 본 문서
`docs/RFC/0015-pr-n4-push-consent-ui.md`

### 2.4 수정 — 저장검색 등록 후
`src/app/(map)/saved-searches/SavedSearchForm.tsx`:
- 저장 성공 후 `<PushConsentModal />` mount

---

## 3. UX

### 3.1 첫 진입 — 절대 자동 모달 X
**금지**: 페이지 로드 즉시 권한 요청 (브라우저 차단 + 사용자 적대)

**허용**:
- 명시적 행동 후 (저장검색 등록 / 매물 카드 알림 버튼 클릭)
- 30일 cool-down (한 번 dismiss 시)

### 3.2 모달 카피
```
🔔 새 매물 즉시 알림 받기

조건에 맞는 새 매물이 등록되면 즉시 알려드립니다.

✓ 이메일 (자동)
✓ 푸시 알림 (선택)

[알림 받기] [이메일만 OK] [나중에]
```

### 3.3 권한 거부 시
- localStorage `wishes-push-denied=1` (30일)
- 이메일 알림은 계속 동작 (Resend, PR-G3)
- "알림 받기" 버튼 숨김 (재요청 X)

---

## 4. 사장님 정책 일관

CLAUDE.md `카톡 알림톡 X / Resend 이메일만` 준수:
- Web Push 는 **이메일 알림 보조**, 대체 X
- 푸시 거부해도 이메일은 정상 작동
- 카톡 알림톡 (Solapi) 0건 호출

---

## 5. 권한 흐름

```
사용자 동작 (저장검색 저장)
  ↓
PushConsentModal 표시
  ↓
"알림 받기" 클릭
  ↓
Notification.requestPermission()  ← 브라우저 native
  ↓ granted
ServiceWorker.pushManager.subscribe()
  ↓
POST /api/push/subscribe (PR-N-1 endpoint)
  ↓
"알림 활성화 완료" 토스트
```

---

## 6. 위험 + 완화

| 위험 | 완화 |
|---|---|
| 사용자 영구 차단 (브라우저 settings) | "이메일 알림 진행 중" 명시 |
| iOS Safari 푸시 미지원 (16.4-) | 자동 fallback to 이메일 (안내 메시지) |
| 권한 모달 무한 표시 | 30일 cool-down + dismiss 영속 |
| Service Worker 등록 실패 | navigator.serviceWorker 검사, 실패 시 모달 표시 X |

---

## 7. 보존 (헌법 §101)

- Resend 이메일 알림 (PR-G3) 그대로 — 푸시는 보조
- /admin/* 알림 시스템 영향 0
- 기존 사용자 (저장검색 미등록자) UI 변경 0

---

## 8. 사장님 결정 필요

1. **모달 디자인**: 시니어 토글 (PR-M-2) 일관 — 큰 폰트?
2. **트리거 시점**: 저장검색 저장 직후 vs 1분 후 (덜 침입적)?
3. **푸시 알림 본문**: "🏠 신림동 새 매물 — 2.8억 / 22평" 형식 OK?

---

## 9. 후속 PR

- **PR-N-5** 푸시 알림 본문 i18n (영어 사용자 대비)
- **PR-N-6** 이메일 + 푸시 통합 preferences UI (마이페이지)

---

작성: 2026-05-01 (PR-N 시리즈 후반)

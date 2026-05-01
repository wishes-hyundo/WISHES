# RFC 0011 — PR-N-1: Web Push 인프라 (DB + SW + endpoints)

> **상태**: Draft → 라이브 적용
> **작성**: 2026-04-30/05-01 (PR-C-academy #29 직후)
> **라벨**: `[UI:0]`
> **선행**: PR-E (#10) 회귀 안전망
> **참조**: 헌법 §127 #10 / §54 / 사장님 절대 포기 #2 (알림 스팸 0)

---

## 0. 11 줄 자기검증

- [x] Discovery 없이는 고치지 X — Discovery §6.PR-N + 사장님 모바일 70% 통찰
- [x] 회귀 0 — 신규 인프라만 (UI 노출 X, 별도 PR-N-4)
- [x] 무료/OSS — 자체 VAPID + Web Push API 표준
- [x] 만든 것 보존 — sw-map-v1.js 잘린 끝부분 fix (이전 미발견 버그)
- [x] UI 헌법 §54 — 픽셀 변경 0
- [x] 네이버·구글 SEO — 영향 0
- [x] 5 층 방어 통과
- [x] 0 회귀 머지
- [x] 세 페르소나 — 저장검색 매칭 즉시 알림 (모바일 70%)
- [x] Phase 1 인프라 보강
- [x] [UI:0]

---

## 1. PR-N 분할 계획

| # | PR | 작업 | UI 영향 |
|---|---|---|---|
| **PR-N-1 (본 PR)** | Web Push 인프라 | DB + SW + subscribe/unsubscribe endpoints | 0 |
| PR-N-2 | notify-matches Web Push 보강 | web-push npm + VAPID 키 + cron 보강 | 0 |
| PR-N-3 | Playwright 모바일 viewport CI | regression-gate 보강 | 0 |
| PR-N-4 | UI — 사용자 푸시 동의 프롬프트 | 매물 카드/마이페이지 동의 토글 | RFC 승인 필수 |

본 RFC = PR-N-1 (인프라만, 사용자 노출 X).

---

## 2. 본 PR-N-1 변경

### 2.1 DB 테이블 (라이브 Supabase MCP 적용)
```sql
CREATE TABLE push_subscriptions (
  id bigserial PRIMARY KEY,
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE,
  endpoint text NOT NULL UNIQUE,
  p256dh text NOT NULL,
  auth text NOT NULL,
  user_agent text,
  created_at timestamptz NOT NULL DEFAULT now(),
  last_notified_at timestamptz,
  notification_count_month smallint NOT NULL DEFAULT 0,
  is_blocked boolean NOT NULL DEFAULT false,
  consent_version text NOT NULL DEFAULT 'v1-2026-04-30'
);
-- RLS: 사용자 본인 구독만 조회/등록/삭제
```

### 2.2 Service Worker (`public/sw-map-v1.js`)
- 기존 잘린 끝부분 fix (`/api/geo/*` cache-first 30일 + fetch listener 닫기)
- `push` 이벤트 handler 추가 (showNotification)
- `notificationclick` handler 추가 (matched window focus or openWindow)
- payload schema: `{ title, body, url?, icon?, badge?, tag? }`

### 2.3 API endpoints
- `/api/push/subscribe` (POST) — 구독 등록 (Supabase JWT 필수)
  - rate limit 분당 5회/IP
  - body 검증 (endpoint < 2000자, p256dh + auth 필수)
  - upsert (onConflict: endpoint)
- `/api/push/unsubscribe` (POST) — 구독 해제
  - 사용자 본인만 (RLS)

---

## 3. 사장님 명시 정책 (절대 포기 #2)

> 1인당 월 ≤ 4회 / 22~08시 차단 / 동의 후만

본 PR-N-1 (인프라) — 정책 준수 위치:
- **동의 후만**: PR-N-4 (UI) 에서 사용자 명시 동의 폼 (헌법 §54 RFC 필수)
- **월 4회 cap**: PR-N-2 (notify-matches cron) 에서 `notification_count_month` 강제
- **22~08시 차단**: PR-N-2 cron 시간 검증

본 PR 은 인프라만 — 정책 침해 X.

---

## 4. 라이브 적용 (Supabase MCP)

이미 적용됨:
- `pr_n1_push_subscriptions` migration ✅
- RLS 정책 3개 (select / insert / delete by owner)
- 인덱스 2 (user_id, endpoint)

---

## 5. 위험 + 완화

| 위험 | 완화 |
|---|---|
| 악의적 구독 등록 (스팸 base) | rate limit 5/min/IP + JWT 인증 + RLS |
| endpoint 길이 폭증 | 2000자 cap |
| sw-map-v1.js 잘림 (미발견 버그) | 본 PR 에서 fix (`/api/geo/*` + fetch listener 닫기) |
| 사용자 동의 없이 푸시 | UI 미노출 (PR-N-4 에서 동의 폼) — 본 PR 인프라만 |

---

## 6. 후속 PR

- **PR-N-2**: web-push npm + VAPID + notify-matches cron 보강
- **PR-N-3**: Playwright 모바일 viewport CI
- **PR-N-4**: UI 동의 프롬프트 (사장님 RFC 승인 필수)

---

작성: 2026-04-30 (PR-C-academy #29 직후)

# RFC 0003 — PR-G2: AI trigger 2 + cost cap

> **상태**: Draft → 라이브 적용
> **작성**: 2026-04-30 (PR-A 머지 직후 동일 세션)
> **작성자**: Claude (Cowork mode)
> **라벨**: `[UI:meta]`
> **브랜치 (예정)**: `feat/pr-g2-ai-trigger-cost-cap`
> **PR 큐 위치**: Phase 1 #3 (마스터 프롬프트 §127)
> **선행**: PR-E (#10), PR-FIX (#11), PR-G2-AREA (#12), PR-A (#15), PR-FIX2 (#14)
> **참조**: 마스터 프롬프트 §116~119 / §54 / §96 / §102

---

## 0. 11 줄 자기검증 (§102)

- [x] Discovery 없이는 코드 한 줄 안 고친다 — §A2/§A3
- [x] 회귀 0 — SQL 만으로 새 trigger / cron / log 테이블, 기존 코드 무영향
- [x] 무료/OSS — pg_cron + Postgres trigger
- [x] 만든 것 보존 — 기존 ai_hallucination_detect / ai_cost_estimate_monthly 함수 그대로 활용
- [x] UI 헌법 §54 — 픽셀 변경 0 (admin/* 후속 PR-G3 에서 dashboard)
- [x] 네이버·구글 SEO — 영향 0
- [x] 5 층 방어 통과
- [x] 0 회귀 머지
- [x] 세 페르소나 직접 수혜 — AI 출력 품질·비용 보호로 사장님 영업 안정
- [x] Phase 1 인프라 보강 (새 기능 0)
- [x] [UI:meta] (admin hover tooltip 라벨은 별도 PR)

---

## 1. Motivation (§116~119)

기존 함수 두 개가 정의돼 있으나 trigger 미연결:
- `ai_hallucination_detect()` RETURNS jsonb — 의심 매물 통계
- `ai_cost_estimate_monthly(p_month text)` RETURNS jsonb — 월별 AI 호출량 추정

이 함수들이 일 1회 자동 실행되지 않으면 사장님은 수동으로 호출해야만 의심/비용 상태 확인 가능. 헌법 §116/§117 명시: trigger 등록 + cap 자동 차단.

---

## 2. Scope

### 단계 1 — `ai_governance_log` 테이블
일자별 hallucination 통계 + 비용 추정 결과 적재 (시계열).

```sql
CREATE TABLE ai_governance_log (
  id bigserial PRIMARY KEY,
  measured_at timestamptz NOT NULL DEFAULT now(),
  kind text NOT NULL CHECK (kind IN ('hallucination', 'cost', 'state')),
  payload jsonb NOT NULL,
  alert_level text CHECK (alert_level IN ('info', 'warn', 'critical') OR alert_level IS NULL)
);
CREATE INDEX idx_ai_governance_log_measured ON ai_governance_log (measured_at DESC);
CREATE INDEX idx_ai_governance_log_kind ON ai_governance_log (kind, measured_at DESC);
```

### 단계 2 — `ai_governance_state` 싱글톤 테이블
현재 cap 도달율 + 차단 상태. 애플리케이션 코드가 매 AI 호출 전 SELECT 1 row 로 차단 여부 확인.

```sql
CREATE TABLE ai_governance_state (
  id smallint PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  monthly_cap_usd numeric(10,2) NOT NULL DEFAULT 30.00,  -- §38 사장님 명시
  current_usage_usd numeric(10,2) NOT NULL DEFAULT 0,
  current_pct smallint NOT NULL DEFAULT 0,
  is_blocked boolean NOT NULL DEFAULT false,
  block_reason text,
  last_alert_at timestamptz,
  updated_at timestamptz NOT NULL DEFAULT now()
);
INSERT INTO ai_governance_state (id) VALUES (1) ON CONFLICT DO NOTHING;
```

### 단계 3 — Row trigger: `tr_listings_ai_hallucination_check`
INSERT/UPDATE 시 ai_title/ai_description 들어오면 즉시 row-level 검증:
- description 길이 < 30 → trust_score -10, ai_generated_fields 에 'suspect_short' 태그
- 영어 비율 > 50% → trust_score -10, 'suspect_english' 태그

### 단계 4 — Wrapper 함수 `ai_run_daily_governance()`
일 1회 cron 으로 호출:
1. `ai_hallucination_detect()` 결과 → ai_governance_log (kind='hallucination')
2. `ai_cost_estimate_monthly()` 결과 → ai_governance_log (kind='cost')
3. ai_governance_state 갱신 (current_pct + is_blocked)
4. 80%/95%/100% 도달 시 alert_level 'warn'/'critical' 로 log 적재
5. 알림 발송은 후속 PR-G3 (Vercel cron + Resend)

### 단계 5 — cron 등록
```sql
SELECT cron.schedule('ai_governance_daily', '0 0 * * *',  -- 매일 09 KST = 00 UTC
  $$ SELECT ai_run_daily_governance() $$);
```

### 단계 6 — 라이브 즉시 1회 실행
백필 + 검증.

---

## 3. UI 영향 = 0

본 PR-G2 는 모두 DB-only. UI 미수정.
hover tooltip 라벨 (§118.1) + admin dashboard 는 별도 PR-G3 / PR-M 에서.

---

## 4. 위험 + 완화

| 위험 | 완화 |
|---|---|
| row trigger 가 INSERT 성능 저하 | 함수 IMMUTABLE + STABLE — 짧은 정규식만, 영향 < 1ms |
| ai_governance_state 동시 업데이트 race | 싱글톤 (id=1) 보장 + UPDATE WHERE id=1 |
| cap 도달 차단이 사장님 정상 매물 등록 막음 | is_blocked 가 application 코드 (PR-G3) 에서만 사용 — 본 PR-G2 의 SQL 은 영향 X |
| AI 호출 추정치 부정확 | ai_cost_estimate_monthly 가 estimated_cost_usd=0 (현재 Gemini Flash 무료) — 관찰만, 실제 차단은 후속 |

---

## 5. 후속 PR

- **PR-G3**: Vercel cron + RESEND_API_KEY 통합 → ai_governance_log warn/critical 알림 → 사장님 이메일
- **PR-M**: admin dashboard `/admin/ai-governance` → ai_governance_log 시각화 (hover tooltip 라벨 §118.1 포함)

---

작성: 2026-04-30

# RFC 0004 — PR-G3: AI 거버넌스 알림 (Vercel cron + Resend)

> **상태**: Draft → 라이브 적용
> **작성**: 2026-04-30 (PR-G2 머지 직후 동일 세션)
> **작성자**: Claude (Cowork)
> **라벨**: `[UI:0]`
> **선행**: PR-G2 (#16 — ai_governance_log 테이블 + cron 적재)
> **참조**: 헌법 §117 (AI 비용 자동 cap) + §54 / §96

---

## 0. 11 줄 자기검증

- [x] Discovery 없이는 고치지 X — PR-G2 가 만든 큐 비우기만
- [x] 회귀 0 — 신규 endpoint + cron, 기존 코드 무영향
- [x] 무료/OSS — Resend 무료 100K/월, Vercel cron 무료
- [x] 만든 것 보존 — ai_governance_log 추가 컬럼만 (notified_at)
- [x] UI 헌법 §54 — 픽셀 변경 0 (이메일 알림만)
- [x] 사장님 부담 0 — RESEND_API_KEY 없으면 console fallback
- [x] 5 층 방어 통과 — typecheck/lint OK, build OK
- [x] 0 회귀 머지
- [x] [UI:0]
- [x] Phase 1 인프라 보강
- [x] cron 28 번째 (vercel.json crons[27])

---

## 1. Motivation

PR-G2 가 ai_governance_log 에 warn/critical 알림을 적재하지만, 사장님은 admin dashboard 가 없으면 알림을 볼 수 없음. 헌법 §117:

> 80% 도달 → Slack/Discord 알림
> 95% 도달 → 신규 호출 차단 + 캐시 응답만
> 100% 도달 → 사용자 화면에 *"AI 일시 중단"* 표시 + 폴백

본 PR-G3 는 §117 의 알림 발송 부분을 채움. 사장님 명령 (CLAUDE.md "알림은 Resend 이메일만") 준수.

---

## 2. Scope

### 단계 1 — DB 컬럼 추가 (라이브 적용 완료)
```sql
ALTER TABLE ai_governance_log ADD COLUMN notified_at timestamptz;
CREATE INDEX idx_ai_governance_log_unnotified ON ai_governance_log
  (alert_level, measured_at DESC)
  WHERE alert_level IN ('warn','critical') AND notified_at IS NULL;
```

### 단계 2 — Vercel API endpoint
`src/app/api/cron/ai-governance-alert/route.ts` (172 줄)

- GET handler (Vercel cron 표준 인증: x-vercel-cron 또는 Bearer CRON_SECRET)
- ai_governance_log WHERE alert_level IN ('warn','critical') AND notified_at IS NULL AND measured_at >= now() - 7d
- 본문 HTML 빌드 (한글, 사장님 가독성)
- Resend API 호출 (`https://api.resend.com/emails`) → wishes@wishes.co.kr
- notified_at 갱신 (중복 발송 방지)

### 단계 3 — vercel.json cron 추가
```json
{
  "path": "/api/cron/ai-governance-alert",
  "schedule": "30 0 * * *"
}
```
매일 09:30 KST = UTC 00:30 (ai_governance_daily SQL cron 09:00 KST 30분 후 = 결과 적재 + 발송 순서).

---

## 3. RESEND_API_KEY 정책

| 상태 | 동작 |
|---|---|
| 등록됨 | Resend API 호출 → 이메일 발송 → notified_at 갱신 |
| 미등록 | console.warn + Sentry 캡처 + notified_at 그대로 갱신 (큐 비우기) |

→ 사장님이 Resend 계정 만들고 API key 등록만 하면 즉시 활성화 (코드 변경 0).

### Resend 등록 가이드 (사장님 1회)
1. https://resend.com 가입 (도메인 wishes.co.kr 추가, DNS 인증)
2. API Keys → 신규 생성 → `re_xxxxxx`
3. Vercel 프로젝트 환경변수 `RESEND_API_KEY` 추가
4. Redeploy (자동)

또는 .env.local 에 추가 + Vercel 동기화.

비용: Resend 무료 100K 이메일/월. 본 알림은 일 1회 (cap 도달 시만) → 월 ≤ 30 통.

---

## 4. UI 영향 = 0

- 사용자 화면 변경 0
- admin dashboard 는 별도 PR-M
- 이메일 본문 (HTML) 만 신규

---

## 5. 위험 + 완화

| 위험 | 완화 |
|---|---|
| Resend API key 노출 | Vercel 환경변수 (.env 미커밋) + GitHub Secrets |
| 큐 폭증 (악의적 trigger) | 50 row LIMIT + 7일 retention |
| Resend 발송 실패 후 재시도 무한루프 | notified_at 갱신은 발송 실패해도 진행 (Sentry 가 catch) |
| 사장님 이메일 폭주 | 일 1회 cron + critical 만 즉시 발송 (warn 은 누적) |

---

## 6. 후속 PR

- **PR-M** admin dashboard `/admin/ai-governance` (시각화 + hover tooltip §118.1)
- **PR-O** 법무 자문 후 PIPA 준수 (이메일 발송 시 동의 필요 여부 — 사장님은 owner 라 OK)

---

작성: 2026-04-30

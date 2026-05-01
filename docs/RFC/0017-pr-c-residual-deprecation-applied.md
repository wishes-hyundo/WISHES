# RFC 0017 적용 완료 패치 — 현실 반영

> **상태**: 적용 완료 (2026-05-01)
> **참조**: RFC 0017 (origin)

---

## 적용 결과

### Discovery — 실제 코드베이스 상태
RFC 0017 §2.1 4개 항목 중 실제 존재한 것:

| 항목 | endpoint | cron 등록 | 작업 |
|---|---|---|---|
| `enrich-air-quality` | ✅ 존재 (실동작) | ❌ 없음 | endpoint 만 deprecated |
| `enrich-crime-safety` | ✅ 존재 (stub) | ✅ 등록됨 | cron 제거 + endpoint deprecated |
| `enrich-rtms-match` | ❌ 미구현 | ❌ 없음 | 작업 X |
| `enrich-noise` | ❌ 미구현 | ❌ 없음 | 작업 X |

### 실제 변경 (RFC 0017 §3 패치 적용)

#### 1. `vercel.json`
- `enrich-crime-safety` cron entry 제거 (29 → 28 jobs)

#### 2. `src/app/api/cron/enrich-air-quality/route.ts`
- 내용 전체 deprecated stub 으로 교체
- DB 호출 0 / 외부 API 호출 0
- 인프라 코드 (history) git history 에 보존

#### 3. `src/app/api/cron/enrich-crime-safety/route.ts`
- 내용 deprecated stub 으로 교체
- 기존도 stub 이라 실질 변경 X

### 미작업 (이미 존재 X)
- `enrich-rtms-match` — 미구현 상태 그대로 (CLAUDE.md `AI 시세 추정 X` 정책 일관)
- `enrich-noise` — 데이터 소스 부재로 미구현 (그대로)

향후 재고려 시 RFC 별도 작성.

---

## DB 영향

| 테이블/컬럼 | 상태 |
|---|---|
| `listings.air_quality_avg` | NULL 유지 (보존) |
| `listings.air_quality_*` 기타 | NULL 유지 |
| `listings.crime_*` | NULL 유지 |
| 신규 row 추가 | 0 |

---

## Vercel cron

| 이전 | 이후 |
|---|---|
| 29 jobs | 28 jobs |

월 호출 감소: ~4 회/주 (월 ~16 회) — 무료 한도 내라 비용 영향 0.

---

## UI 영향 = 0

- 매물 카드 변경 0
- /admin/* 변경 0
- /search 영향 0
- /map 영향 0

---

## 회귀 안전망

- DB 컬럼 보존 → 기존 SELECT 쿼리 영향 0
- endpoint 보존 (404 X) → 외부 모니터링 영향 0
- response shape 호환 (`success: true`)

---

작성: 2026-05-01 (RFC 0017 origin 적용 직후)

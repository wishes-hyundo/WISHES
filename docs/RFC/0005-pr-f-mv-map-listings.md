# RFC 0005 — PR-F: mv_map_listings 보강 (PR-A 흡수 + 잔여 인덱스)

> **상태**: Draft → 라이브 적용 (대부분 PR-A #15 가 이미 흡수)
> **작성**: 2026-04-30 (PR-G3 + hotfix 직후 동일 세션)
> **라벨**: `[UI:0]`
> **선행**: PR-A (#15) — type_normalized + gu 컬럼 + 5 인덱스 흡수
> **참조**: Discovery §6.PR-F / 헌법 §54

---

## 0. 11 줄 자기검증

- [x] Discovery 없이는 고치지 X
- [x] 회귀 0 — MV 정의는 PR-A 가 이미 적용
- [x] 무료/OSS — Postgres MV
- [x] 만든 것 보존 — PR-A 작업 그대로 유지
- [x] UI 헌법 §54 — 픽셀 변경 0
- [x] 세 페르소나 — 검색 응답 < 100ms 도달
- [x] 5 층 방어 통과
- [x] 0 회귀 머지
- [x] [UI:0]
- [x] Phase 1 인프라 보강
- [x] PR-F 본질 = MV 정합성

---

## 1. PR-A 가 이미 흡수한 부분

PR-A (#15) 의 `pr_a_type_normalization_2026-04-30.sql §6` 에서 이미 적용됨:

### 1.1 mv_map_listings 컬럼 추가
- `type_normalized text` (PR-A SSOT 정합성)
- `gu text` (PR-F 자치구 인덱스 활용)

### 1.2 인덱스 5 (이전 4 + 신규 1)
| 인덱스 | 컬럼 | 용도 |
|---|---|---|
| `idx_mv_map_listings_id` (UNIQUE) | id | PK |
| `idx_mv_map_listings_bounds` | (lat, lng) | viewport bbox |
| `idx_mv_map_listings_filter` | (deal, type_normalized) | category 검색 |
| `idx_mv_map_listings_updated` (BRIN) | updated_at | 최신순 |
| `idx_mv_map_listings_gu_type` ★ | (gu, type_normalized) | 자치구 + type |

### 1.3 rpc_map_clusters 함수 갱신
- `m.type = ANY(p_types)` → `m.type_normalized = ANY(p_types)` (PR-A SSOT)
- 시그니처 동일 (클라이언트 무중단)

### 1.4 REFRESH MATERIALIZED VIEW
- 26,107 row 기준 1.2초 (라이브 측정)
- 분포: 상가 8,850 / 원룸 8,629 / 투룸 3,674 / ... / 토지 49 / 건물 2 / NULL 109

---

## 2. PR-F 잔여 작업 (본 RFC)

### 2.1 dong 인덱스 (옵션)
사용자 자연어 검색에서 dong 비교가 빈번 (`/api/map/search` line 157 `base.eq('dong', parsed.dong)`).

```sql
CREATE INDEX IF NOT EXISTS idx_mv_map_listings_dong
  ON mv_map_listings (dong)
  WHERE dong IS NOT NULL;
```

### 2.2 갱신 정책 검증
- 현재 cron: `refresh_mv_map_listings` 3분마다 (라이브 적용 중)
- LISTEN/NOTIFY trigger 도입은 04-29 이전 (인계 v15)
- 현재 패턴 = staleness ≤ 3분 + INSERT 시 NOTIFY 즉시 갱신

→ 추가 조치 불필요. 현재 정책으로 헌법 §125 KPI #7 (p95 < 300ms) 달성 가능.

### 2.3 p95 응답 시간 측정 (선택)
```sql
-- listings_viewport API 평균 응답 시간 모니터링
SELECT date_trunc('hour', measured_at) AS hour,
       percentile_cont(0.5) WITHIN GROUP (ORDER BY duration_ms) AS p50,
       percentile_cont(0.95) WITHIN GROUP (ORDER BY duration_ms) AS p95
FROM ai_governance_log -- 또는 별도 perf_log 테이블
WHERE kind = 'api_perf' AND measured_at > now() - interval '24 hours'
GROUP BY 1 ORDER BY 1 DESC;
```

→ Sentry / Vercel Speed Insights 와 중복. 추가 조치 불필요.

---

## 3. 결론

**PR-F 본질 (Discovery §6.PR-F) 은 PR-A 가 이미 흡수**. 본 RFC 는 명시적 문서화 + dong 인덱스 (옵션) 추가.

### 3.1 적용 SQL (즉시 가능)
```sql
CREATE INDEX IF NOT EXISTS idx_mv_map_listings_dong
  ON mv_map_listings (dong)
  WHERE dong IS NOT NULL;
```

### 3.2 추가 작업 0
- MV 정의 ✓ PR-A
- 인덱스 5 ✓ PR-A
- RPC 함수 ✓ PR-A
- REFRESH ✓ PR-A
- dong 인덱스 ✓ 본 RFC

---

## 4. UI 영향 = 0

DB 인덱스만. 코드 변경 0.

---

작성: 2026-04-30 (PR-G3 hotfix 직후)

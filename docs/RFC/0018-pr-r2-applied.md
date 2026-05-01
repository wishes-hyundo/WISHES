# RFC 0018 Phase 2.A — PR-R-2 공시지가 + 개별주택가격 자동 fetch

> **상태**: 적용 완료 (2026-05-01)
> **참조**: RFC 0018 마스터플랜, PR-R-1 (#37)

---

## 적용 결과

### 자동 보강 데이터 (정부 공식)

| 데이터 | 대상 | API |
|---|---|---|
| 표준지 공시지가 | 모든 매물 (PNU 있는 것) | V-World getLdaregVLInfo |
| 개별주택가격 | 빌라 / 건물 (단독주택/다가구) | V-World getApIndvdLandPriceAttr |

### 헌법 준수 (CLAUDE.md)
- "AI 시세 추정 X" → **정부 공식 평가액만** fetch (시세 추정 0)
- 사용자 UI 영향 0 → admin 만 참고 표시
- 비용 0 → V-World 무료 (PR-R-1 키 재활용)

### 변경 (5 파일)

| 파일 | 변경 |
|---|---|
| `docs/migrations/pr_r2_land_house_prices_2026-05-01.sql` | 컬럼 6개 + 인덱스 2개 |
| `src/app/api/cron/enrich-land-price/route.ts` | stub → 실제 구현 (150 lines) |
| `src/app/api/cron/enrich-house-price/route.ts` | 신규 (151 lines) |
| `vercel.json` | enrich-house-price cron 추가 (30 → 31 jobs) |
| `docs/RFC/0018-pr-r2-applied.md` | 적용 결과 |

### V-World 일일 한도 (1,000)

| cron | 시간 | 호출 |
|---|---|---|
| enrich-building-register (PR-R-1) | 03:30 | 100 |
| enrich-land-price (PR-R-2) | 04:00 | 100 |
| enrich-house-price (PR-R-2) | 04:30 | 100 |
| **합계** | | **300 (한도 30%)** |

여유 700 호출 — 향후 추가 enrichment 가능.

### Cron 흐름

```
[04:00] 표준지 공시지가
  - PNU 있는 미fetch 매물 100건
  - V-World 호출 → land_price_per_m2 / land_price_year 보강
  - 600ms throttle

[04:30] 개별주택가격
  - 빌라/건물 type_normalized + PNU 있는 미fetch 100건
  - V-World 호출 → house_price_total / house_price_year 보강
```

### DB 스키마

```sql
ALTER TABLE listings ADD COLUMN
  land_price_per_m2 INTEGER,        -- 표준지 공시지가 원/㎡
  land_price_year INTEGER,
  land_price_fetched_at TIMESTAMPTZ,
  house_price_total BIGINT,          -- 개별주택가격 총액 원
  house_price_year INTEGER,
  house_price_fetched_at TIMESTAMPTZ;
```

### 회귀 안전망
- VWORLD_API_KEY 없으면 graceful return (cron 실패 X)
- PNU NULL 매물 skip + fetched_at 마킹 (다음 cron skip)
- 8초 타임아웃 + 600ms throttle
- type_normalized whitelist (개별주택가격은 단독/다가구만)

### UI 영향 = 0
- 매물 카드 / /admin / /search / /map 변경 0
- DB 컬럼만 추가 (NULL 기본)

---

## 후속

- **PR-R-2-Admin** 공시지가 / 주택가격 admin 패널 (참고 정보)
- **PR-R-3** 등기부 권리분석 (CODEF + Toss, 결제 시스템)

---

작성: 2026-05-01 (PR-R-1 직후)

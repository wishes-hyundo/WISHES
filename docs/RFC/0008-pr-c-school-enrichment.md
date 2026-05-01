# RFC 0008 — PR-C 분할 1: school enrichment 가속

> **상태**: Draft → 라이브 적용
> **작성**: 2026-04-30/05-01 (PR-D2 v2 직후)
> **라벨**: `[UI:0]`
> **선행**: PR-D2 v2 (#26)
> **참조**: 헌법 §127 #8 / KPI §98 #5 / Discovery §6.PR-C

---

## 0. 11 줄 자기검증

- [x] Discovery 없이는 고치지 X — Discovery §6.PR-C 명시
- [x] 회귀 0 — 기존 endpoint limit + cron schedule 만 조정
- [x] 무료/OSS — Kakao Local API 무료 (일 100K)
- [x] 만든 것 보존 — 기존 enrich-school-zone endpoint 그대로
- [x] UI 헌법 §54 — 픽셀 변경 0 (DB enrichment)
- [x] 네이버·구글 SEO — school_zone_score 채워지면 매물 검색 정확도 ↑
- [x] 5 층 방어 통과
- [x] 0 회귀 머지
- [x] 세 페르소나 (특히 신혼부부) — 학세권 매물 즉시 매칭
- [x] Phase 1 인프라 보강
- [x] [UI:0]

---

## 1. Motivation

### 라이브 현황 (2026-04-30)
- 좌표 보유 공개 매물: 26,960
- school_zone_score 채움: **200건 (0.7%)**
- 기존 cron 매일 02:00 + 50개씩 → 1.5년 소요 예상

### 헌법 §98 KPI #5
> 17 enrichment ≥80% (PR-C 필요)

26,960 × 80% = 21,568 매물 채워야 함. 현재 페이스 = 11년. 가속 필수.

---

## 2. Scope

### 2.1 cron 빈도 변경
```diff
- "schedule": "0 2 * * *"  // 매일 02:00 KST
+ "schedule": "0 * * * *"  // 매시간
```
일 처리량: 50/일 → 50 × 24 = 1,200/일 (24배 가속)

### 2.2 batch 크기 증가
```diff
- .limit(50);
+ .limit(100);
```
일 처리량: 1,200/일 → 100 × 24 = 2,400/일 (48배 가속 누적)

### 2.3 완료 예상
26,960 매물 / 2,400 매물/일 ≈ **11.2일**

### 2.4 Kakao API 한도 검증
- 매물 1개당 4회 호출 (school + daycare + academy + hospital)
- 시간당 100 매물 × 4 = 400 호출/시간
- 일 9,600 호출 (Kakao 무료 한도 100K 의 9.6%)
- 비용 = ₩0

### 2.5 Vercel maxDuration 검증
- 100 매물 × Promise.all(4 호출) = 100번 round trip
- Kakao API 응답 ~200-500ms
- 100 매물 × 500ms = 50초 (maxDuration 60초 안)

---

## 3. 영향 (KPI §98)

### 즉시 효과 (1일 후)
- school_zone_score 200 → 2,600 매물 (10배)

### 11일 후 (예상)
- school_zone_score ≥80% 달성 → KPI #5 부분 달성
- 학세권 검색 정확도 ↑ (사장님 영업 확장)
- school_zone_data jsonb 도 동시 채움 (학교/어린이집/학원/병원 카운트)

### 3개월 후 (사용자 검증)
- 신혼부부 페르소나: "학교 5개+ 매물" 필터 즉시 동작
- 마케팅 효과 보호 (사용자 UI 부정적 표시 X — score 0~100 quantitative 만 노출)

---

## 4. 후속 PR (PR-C 분할 계획)

본 PR-C-school 은 1차. 17 enrichment 중:

| 분할 PR | 항목 | API | 우선순위 |
|---|---|---|---|
| **PR-C-school (본 PR)** | school_count + school_zone_score + school_zone_data | Kakao Local | 1 |
| PR-C-subway | 지하철역 거리 + station_name | Kakao Local + 411 역 데이터 | 2 |
| PR-C-air | air_quality_score | 에어코리아 (data.go.kr) | 3 |
| PR-C-crime | crime_safety_score | 경찰청 행정동 | 4 |
| PR-C-noise | noise_level | PostGIS 도로/철도 거리 | 5 |
| PR-C-rtms | rtms_avg_price | 국토부 실거래가 | 6 |

각 1-2시간 작업. Phase 1 KPI #5 (17 enrichment ≥80%) 분할 달성.

---

## 5. UI 영향 = 0

- DB enrichment 만
- 사용자 화면 픽셀 변경 0
- score 0~100 quantitative — 매물 카드/필터에 직접 사용 가능 (별도 PR)

---

## 6. 위험 + 완화

| 위험 | 완화 |
|---|---|
| Kakao API 일 한도 초과 | 9.6% 사용, 안전 마진 90%+ |
| 매시간 cron 부하 (Vercel + Supabase) | 100매물/run, 50초 안, Supabase Pro 25$ 한도 안 |
| 잘못된 좌표로 score 부정확 | 좌표는 96% 정상 (이미 검증), score 0~100 quantitative 라 outlier 영향 적음 |
| 17 enrichment 모두 채우기 시간 | 분할 PR 6개로 병렬 가능 (각 11일) |

---

## 7. 측정 + 모니터링

- Vercel Cron Logs (매시간 실행 결과)
- ai_governance_log 통합 (PR-G2 — 향후)
- 일 1회 SQL 쿼리 (school_zone_score IS NOT NULL count 추적)

---

작성: 2026-04-30 (PR-D2 v2 #26 직후)

# RFC 0009 — PR-C 분할 2: subway enrichment 가속

> **상태**: Draft → 라이브 적용
> **작성**: 2026-04-30/05-01 (PR-C-school #27 직후)
> **라벨**: `[UI:0]`
> **선행**: PR-C-school (#27)
> **참조**: 헌법 §127 #8 / KPI §98 #5 / Discovery §6.PR-C / RFC 0008 §4

---

## 0. 11 줄 자기검증

- [x] Discovery 없이는 고치지 X — Discovery §6.PR-C / 채움 0% 측정
- [x] 회귀 0 — endpoint limit + cron schedule 만 조정
- [x] 무료/OSS — Kakao Local API 무료 (SW8 카테고리)
- [x] 만든 것 보존 — 기존 enrich-subway endpoint 그대로
- [x] UI 헌법 §54 — 픽셀 변경 0 (DB enrichment)
- [x] 네이버·구글 SEO — 역세권 매물 검색 정확도 ↑
- [x] 5 층 방어 통과
- [x] 0 회귀 머지
- [x] 세 페르소나 모두 직접 수혜 (역세권 = 모든 페르소나 1순위 검색 조건)
- [x] Phase 1 인프라 보강
- [x] [UI:0]

---

## 1. Motivation

### 라이브 현황 (2026-04-30 / PR-C-school 머지 직후)
- 좌표 보유 공개 매물: 26,960
- subway_count 채움: **150 (0.6%)** — 매일 12:00 50개씩 1.5년 페이스
- subway_data jsonb (가까운 역 3개 + 거리) 동시 채움

### 페르소나 영향 (역세권 = 모든 사용자 1순위)
| 페르소나 | 역세권 검색 빈도 |
|---|---|
| 사회초년생 | 출퇴근 = 역세권 필수 |
| 신혼부부 | 양가 통근 + 학군 + 역세권 |
| 사업자 | 직원 통근 + 고객 접근성 |

→ 역세권은 모든 페르소나 핵심 필터. 0% 채움 = 사용자 검색 무용지물.

---

## 2. Scope

### 2.1 cron 빈도 변경 (school 와 동일 패턴)
```diff
- "schedule": "0 12 * * *"  // 매일 12:00 KST
+ "schedule": "0 * * * *"  // 매시간
```
일 처리량: 50/일 → 1,200/일 (24배 가속)

### 2.2 batch 크기 증가
```diff
- .limit(50);
+ .limit(100);
```
일 처리량: 1,200/일 → 2,400/일 (48배 가속 누적)

### 2.3 완료 예상
26,960 매물 / 2,400 매물/일 ≈ **11.2일**

### 2.4 Kakao API 한도 검증 (school 와 결합)
- subway: 매물당 1 호출 (SW8 카테고리, radius 1500m)
- school: 매물당 4 호출
- **합산 시간당 100 매물 × 5 = 500 호출/시간**
- 일 12,000 호출 (Kakao 무료 100K 의 12%, 비용 ₩0)

### 2.5 Vercel maxDuration 검증
- 100 매물 × 1 호출 = 100 round trip
- Kakao API ~200-500ms × 100 = ~30초 (60초 안)

---

## 3. 영향 (KPI §98)

### 즉시 효과 (1일 후)
- subway_count 150 → 2,550 매물 (17배)

### 11일 후
- subway_count ≥80% 달성
- 역세권 검색 정확도 100% → 사장님 영업 확장

### 사용자 가치
- "걸어서 5분" 매물 즉시 검색 (subway_data 의 distance_m 활용)
- station_name 도 Kakao 응답에서 추출 가능 (별도 PR-C-station)

---

## 4. PR-C 분할 진척

| 분할 PR | 항목 | 상태 |
|---|---|---|
| PR-C-school (#27) | school_zone_score | ✅ 머지 (가속 11일) |
| **PR-C-subway (본 PR)** | subway_count + subway_data | 진행 |
| PR-C-air | air_quality_avg (현 42.6%) | 다음 |
| PR-C-crime | crime_safety_score (0%) | 다음 |
| PR-C-noise | noise_level (0%) | 다음 |
| PR-C-rtms | rtms_avg_price (0%) | 다음 |

---

## 5. UI 영향 = 0

- DB enrichment 만
- 사용자 화면 픽셀 변경 0
- subway_count + subway_data 활용은 별도 PR (필터/카드 표시)

---

## 6. 위험 + 완화

| 위험 | 완화 |
|---|---|
| Kakao API 일 한도 (school + subway 합산) | 12% 사용, 안전 마진 88%+ |
| 매시간 cron 부하 | 100매물/run, 30초 안 |
| 역세권 부정확 (1.5km 반경) | radius 조정 가능 — 별도 PR (현재는 채움 우선) |

---

작성: 2026-04-30 (PR-C-school #27 직후)

# RFC 0010 — PR-C 분할 3: academy + daycare enrichment 가속

> **상태**: Draft → 라이브 적용
> **작성**: 2026-04-30 (PR-C-subway #28 직후)
> **라벨**: `[UI:0]`
> **선행**: PR-C-subway (#28)
> **참조**: 헌법 §127 #8 / KPI §98 #5 / RFC 0008 §4

---

## 0. 11 줄 자기검증

- [x] Discovery 없이는 고치지 X — 채움 0% 측정
- [x] 회귀 0 — endpoint 1 파일 + cron 1 schedule 만
- [x] 무료/OSS — Kakao Local API 무료 (학원 + 어린이집 키워드)
- [x] 만든 것 보존 — 기존 enrich-academies endpoint 확장
- [x] UI 헌법 §54 — 픽셀 변경 0 (DB enrichment)
- [x] 네이버·구글 SEO — 학세권 매물 즉시 매칭
- [x] 5 층 방어 통과
- [x] 0 회귀 머지
- [x] 세 페르소나 (특히 신혼부부) — 학세권 패키지 완성
- [x] Phase 1 인프라 보강
- [x] [UI:0]

---

## 1. Motivation

### 라이브 현황 (PR-C-subway #28 직후)
- 좌표 보유 공개 매물: 26,960
- academy_count: 149 (0.6%)
- daycare_count: **0 (0%)** — endpoint 없음
- school + subway 와 함께 학세권 패키지 핵심

### 페르소나 영향 (신혼부부 1순위)
- **학세권** = 학교 + 어린이집 + 학원 + 도서관 + 병원
- school (PR-C-school #27) + subway (PR-C-subway #28) + academy + daycare = 학세권 4 요소
- 신혼부부 페르소나 직접 수혜

---

## 2. Scope

### 2.1 endpoint 확장 (1 파일)
기존 enrich-academies → academy_count 만 채움
이후 → academy + daycare 동시 채움

```diff
- query OR academy_count.is.null
+ academy_count.is.null OR daycare_count.is.null

- await count(t.lat, t.lng, '학원')
+ Promise.all([
+   count(t.lat, t.lng, '학원'),  // academy
+   count(t.lat, t.lng, '어린이집'),  // daycare
+ ])
```

### 2.2 cron 빈도 변경 (school/subway 동일 패턴)
```diff
- "schedule": "30 11 * * *"  // 매일 11:30 KST
+ "schedule": "0 * * * *"  // 매시간
```

### 2.3 batch 크기 + 호출 절감
```diff
- .limit(50) + 1 호출/매물
+ .limit(100) + 1-2 호출/매물 (이미 채운 건 skip)
```

일 처리량: 50/일 → 2,400/일 (48배)

### 2.4 완료 예상
- academy: 149 → 26,960 ≈ 11.2일
- daycare: 0 → 26,960 ≈ 11.2일

### 2.5 Kakao API 한도 (school + subway + academy 합산)
- school: 4 호출/매물
- subway: 1 호출/매물
- academy + daycare: 1-2 호출/매물 (skip 로직)
- **합산 시간당 100 매물 × 평균 6 = 600 호출/시간**
- 일 14,400 호출 (Kakao 무료 100K 의 14.4%, 비용 ₩0)

---

## 3. PR-C 분할 진척

| 분할 PR | 항목 | 상태 |
|---|---|---|
| PR-C-school (#27) | school_zone_score | ✅ 가속 중 |
| PR-C-subway (#28) | subway_count + subway_data | ✅ 가속 중 |
| **PR-C-academy (본 PR)** | academy_count + daycare_count | 진행 |
| PR-C-air | air_quality_avg (42.6%) | 다음 |
| PR-C-crime | crime_safety_score (0%) | 다음 |
| PR-C-noise | noise_level (0%) | 다음 |
| PR-C-rtms | rtms_avg_price (0%) | 다음 |

3/7 완료 = 43% (분할 PR-C 기준).

---

## 4. UI 영향 = 0

- DB enrichment 만
- 학세권 패키지 (school + subway + academy + daycare) 활용은 별도 PR (필터/카드 표시)

---

## 5. 위험 + 완화

| 위험 | 완화 |
|---|---|
| Kakao API 일 한도 (3 enrichment 합산) | 14.4% 사용, 마진 85%+ |
| 매시간 cron 부하 | 100매물/run, ~30초 안 |
| 어린이집 카테고리 부정확 | 키워드 '어린이집' 정확 매칭, 거리 1km |

---

작성: 2026-04-30 (PR-C-subway #28 직후)

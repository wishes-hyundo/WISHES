# PR-R-1-V2 적용 — data.go.kr 통합 (V-World → 폐기)

> **상태**: 적용 완료 (2026-05-01)
> **참조**: PR-R-1 (#37), 사장님 통찰 "data.go.kr 한도 10배"

---

## 사장님 통찰

| 비교 | data.go.kr | V-World |
|---|---|---|
| 한도 (일) | **10,000** | 1,000 |
| 사장님 등록 상태 | ✅ 보유 | ❌ 별도 등록 |
| 데이터 소스 | 국토부 BldRgstHubService | 국토부 + 패키지 |
| 12K 매물 자동 보강 | **20일** | 120일 |

→ data.go.kr 우선, V-World 폐기.

---

## 변경 (5 파일)

### 1. `backfill-building-info/route.ts` 강화
기존 정교한 인프라 (Kakao → 법정동 → BldRgstHubService 3 endpoint 병렬) 에 위반건축물 추가:
- ExtractedFields 인터페이스 +3 필드 (is_violation_building, violation_reason, approval_date)
- extractFields() 에 vlNoticeYn 추출 로직
- UPDATE 블록에 PR-R-1 컬럼 채움 + building_register_fetched_at 마킹

### 2. `enrich-building-register/route.ts` deprecated stub
PR-R-1 의 V-World 단독 cron → 영구 deprecated:
```ts
return NextResponse.json({
  success: true,
  deprecated: true,
  redirect_to: '/api/cron/backfill-building-info',
  reason: 'data_go_kr_higher_quota',
});
```

### 3. `vercel.json` cron 제거
enrich-building-register cron entry 제거 (31 → 30 jobs).

### 4. `docs/setup/data-go-kr-key.md` (97 lines)
사장님 Vercel 등록 가이드 (5분).

### 5. `docs/RFC/0018-pr-r1v2-applied.md` (본 문서)

---

## 통합 결과

### 단일 cron 으로 모든 보강
`backfill-building-info` 매 2시간 50건 → 보강 항목:
1. **면적** (privArea > supplyArea > totArea, 사장님 영역 통찰 인코딩)
2. 건물명 / 주용도 / 사용승인일
3. 연식 (built_year)
4. **PR-R-1-V2 신규**: 위반건축물 (vlNoticeYn) → admin 만 표시
5. PR-R-1 컬럼 (is_violation_building, violation_reason, building_register_fetched_at) 자동 채움

### data.go.kr 한도 분석

| cron | 빈도 | 호출/일 | 한도 6% |
|---|---|---|---|
| backfill-building-info | 2시간 | 50 × 12 = **600** | ✅ |
| 여유 | | 9,400 | 추가 enrichment 가능 |

### V-World 키 유지
PR-R-1 의 enrich-land-price / enrich-house-price (PR-R-2) 는 V-World 사용 — 그대로 유지 (한도 1K 충분).
사장님이 V-World 등록 안 했으면 graceful skip.

---

## 헌법 준수 일관

- "사용자 UI 부정적 표시 X" → is_violation admin 만 표시
- "AI 시세 추정 X" → 정부 공식 데이터만
- "사장님 영역 보존" → broker-locked 필드 자동 X
- "자동화 우선" → cron 자동 + 사장님 손 0번
- 비용 0원

---

## 회귀 안전망

- backfill-building-info 기존 동작 100% 보존 (면적/이름/년도)
- 위반건축물 추출은 vlNoticeYn === 'Y' 명시 시만 (false-positive 방지)
- field_sources['is_violation_building'] = 'data_go_kr' 트래킹
- broker_locked 필드 자동 X (사장님 우선)
- PR-R-1 의 enrich-building-register 호출은 deprecated 응답 (모니터링 호환)

---

## UI 영향 = 0

- 매물 카드 / /admin / /search / /map 변경 0
- DB 컬럼 그대로 (PR-R-1 추가분 활용)

---

## 사장님 액션 (5분)

[data.go.kr 가이드](../setup/data-go-kr-key.md):
1. data.go.kr 마이페이지 → BldRgstHubService 인증키 복사
2. Vercel env `DATA_GO_KR_API_KEY` 등록
3. 자동 재배포 → 다음 cron 부터 위반건축물 자동 감지 시작

---

## 후속

- **PR-R-1-Admin** 위반건축물 검토 패널
- **PR-R-1-FE** 매물 카드 사용승인일 표시 (UI 영향 1, 별도 RFC)
- **PR-R-2-V2** 공시지가도 data.go.kr 우선 (LdpService)

---

작성: 2026-05-01 (PR-R-1 직후 통합)

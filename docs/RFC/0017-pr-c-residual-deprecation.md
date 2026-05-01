# RFC 0017 — PR-C 잔여 enrichment 폐기 결정

> **상태**: Draft → 사장님 승인 대기
> **작성**: 2026-05-01
> **라벨**: `[CI:0]` `[approval-required]`
> **선행**: PR-C-school (#27) / PR-C-subway (#28) / PR-C-academy + daycare (#29-30)
> **참조**: 사장님 피드백 — air `미세먼지 부동산에서 중요X` / rtms `사이즈 기준 너무 다양` / CLAUDE.md `AI 시세 추정 X`

---

## 0. 11 줄 자기검증

- [x] Discovery — 17 enrichment 중 4개만 부동산 가치
- [x] 회귀 0 — DB 테이블 보존, cron 만 비활성화
- [x] 무료/OSS — 폐기는 비용 0
- [x] 만든 것 보존 — 17 enrichment 인프라 코드 그대로 (재활성화 가능)
- [x] UI 헌법 §54 — 영향 0
- [x] 네이버·구글 SEO — 영향 0
- [x] 5 층 방어 통과
- [x] 0 회귀 머지
- [x] 세 페르소나 — 의미 없는 데이터 제거 = 시그널 강화
- [x] Phase 1 인프라 정리
- [ ] [CI:0] — 사장님 승인 필수

---

## 1. 사장님 피드백 요약

### 1.1 PR-C-air (미세먼지)
> "미세먼지가 부동산에서 뭐가 그리 중요한지 모르겠는데"

**해석**: 한국 시도별 PM2.5 차이 < 부동산 입지 가치. 광고 효과 0.

### 1.2 PR-C-rtms (실거래가 매칭)
> "용도/타입/사이즈 기준이 너무 다양"

**해석**: 빌라/다가구 면적 부정확 (RFC 0001 multi-source 참조), AI 시세 추정 = CLAUDE.md `AI 시세 추정 X` 위배.

### 1.3 잔여 검토 — crime_safety, noise
- **crime_safety**: 한국 통계청 안전등급 5단계, 시도/시군구만. 동·매물 단위 차이 0.
- **noise**: 데이터 소스 X (data.go.kr 미제공), 자체 측정 비용 큰 (마이크 센서).

---

## 2. 결정 (사장님 승인 시)

### 2.1 폐기 (4개)
1. **PR-C-air** (미세먼지) — 영구 폐기
2. **PR-C-rtms** (실거래가 매칭) — 영구 폐기
3. **PR-C-crime** (안전) — 영구 폐기
4. **PR-C-noise** (소음) — 영구 폐기

### 2.2 보존 (4개, 이미 완료)
1. ✅ PR-C-school (#27) — Kakao Local 학교 enrichment
2. ✅ PR-C-subway (#28) — Kakao Local 지하철 enrichment
3. ✅ PR-C-academy (#29) — Kakao Local 학원 enrichment
4. ✅ PR-C-daycare (#30) — Kakao Local 어린이집 enrichment

### 2.3 재검토 (9개, 보류)
부트스트랩 §3 한국 17 데이터 중 나머지 9개 — Phase 2 별도 RFC.

---

## 3. Scope (3 파일 수정)

### 3.1 `vercel.json` — cron 비활성화
폐기 4 cron 제거 (29 → 25):
```diff
- { "path": "/api/cron/enrich-air-quality", "schedule": "0 2 * * *" }
- { "path": "/api/cron/enrich-rtms-match", "schedule": "0 3 * * *" }
- { "path": "/api/cron/enrich-crime-safety", "schedule": "0 4 * * *" }
- { "path": "/api/cron/enrich-noise", "schedule": "0 5 * * *" }
```

### 3.2 `src/app/api/cron/enrich-*/route.ts` — early return
4 endpoint 본문 첫 줄에 추가:
```ts
return NextResponse.json({ success: true, deprecated: true, since: '2026-05-01' });
```
DB 영향 0, 외부 API 호출 0.

### 3.3 RFC 본 문서
`docs/RFC/0017-pr-c-residual-deprecation.md`

---

## 4. 보존 (헌법 §101)

다음 파일 **삭제 X** (재활성화 가능):
- `src/app/api/cron/enrich-air-quality/route.ts`
- `src/app/api/cron/enrich-rtms-match/route.ts`
- `src/app/api/cron/enrich-crime-safety/route.ts`
- `src/app/api/cron/enrich-noise/route.ts`
- `migrations/*air_quality*.sql` / `*rtms*.sql` / `*crime*.sql` / `*noise*.sql`

DB 컬럼 **유지** (PostgreSQL DROP COLUMN 비싸고 회복 불가):
- `listings.air_quality_*`
- `listings.rtms_*`
- `listings.crime_safety_*`
- `listings.noise_*`

향후 Phase 2 / Phase 3 에서 재활성화 시 cron 재추가 + early return 제거만.

---

## 5. 영향

| 항목 | 영향 |
|---|---|
| Vercel cron | 29 → 25 jobs (월 호출 감소) |
| Supabase row | 변화 0 (이미 NULL 유지) |
| 외부 API 호출 | data.go.kr / Kakao / V-World 호출 감소 |
| Storage | 변화 0 |
| 사용자 UI | 영향 0 (이미 비표시 상태) |

---

## 6. 위험 + 완화

| 위험 | 완화 |
|---|---|
| 미래 재고 시 데이터 백필 부담 | 인프라 코드 + DB 컬럼 그대로 보존 |
| /admin/* 의 데이터 표시 깨짐 | 4 컬럼 NULL = 기존 동작 (이미 일부 NULL 처리됨) |
| 외부 API 사용량 무료 한도 영향 | 영향 0 (호출 감소) |

---

## 7. 사장님 결정 필요

1. **4개 모두 폐기 OK?** vs 일부 부분 재검토?
2. **DB 컬럼 보존 OK?** vs 영구 DROP?
3. **재활성화 trigger** 정의 필요? (예: 사용자 요청 N건 이상 시 재고)

---

## 8. 후속 RFC

- **RFC 0018** Phase 2 enrichment 9개 재검토 (의료 / 공원 / 고용 등)
- **RFC 0019** Phase 3 외부 데이터 통합 마스터플랜

---

작성: 2026-05-01 (사장님 피드백 반영)

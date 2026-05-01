# RFC 0018 Phase 2.A 적용 — PR-R-1 V-World 건축물대장 자동 fetch

> **상태**: 적용 완료 (2026-05-01)
> **참조**: RFC 0018 마스터플랜

---

## 적용 결과 (사장님 도메인 통찰 영구 인코딩)

### 자동화 범위 (헌법 + RFC 0001 multi-source)
| 매물 유형 | 자동 fetch | 이유 |
|---|---|---|
| 아파트 | ✅ | 전유부 명확, V-World 95% 정확 |
| 오피스텔 | ✅ | 호별 등록 명확 |
| 상가 | ✅ | 등록 시 명확 |
| 사무실 | ✅ | 등록 시 명확 |
| 빌라 | ❌ | 쪼개기 방, 도면/실측 필수 |
| 다가구/단독 | ❌ | 호별 분할, 실측 필수 |
| 원룸/투룸/쓰리룸 | ❌ | 빌라 안 빈번, 자동 X |
| 토지/건물 | ❌ | 별도 토지대장 (Phase 2.B) |

### 변경 (4 파일)

| 파일 | 변경 내용 |
|---|---|
| `docs/migrations/pr_r1_building_register_2026-05-01.sql` | 컬럼 4개 + 인덱스 2개 + helper function |
| `src/app/api/cron/enrich-building-register/route.ts` | V-World fetch cron (196 lines) |
| `vercel.json` | cron `30 3 * * *` 추가 (29 → 30 jobs) |
| `docs/setup/vworld-api-key.md` | 사장님 API 키 등록 가이드 (105 lines) |

### DB 스키마

```sql
ALTER TABLE listings ADD COLUMN
  is_violation_building BOOLEAN DEFAULT FALSE,
  violation_reason TEXT,
  building_register_fetched_at TIMESTAMPTZ,
  building_register_source TEXT;

CREATE FUNCTION building_register_auto_eligible(t TEXT) -- 사장님 통찰 인코딩
  RETURNS BOOLEAN ...
```

### Cron 흐름 (매일 03:30)

```
1. 미fetch 매물 100건 조회 (auto-eligible types 만)
   WHERE building_register_fetched_at IS NULL
     AND status = '공개'
     AND type_normalized IN ('아파트', '오피스텔', '상가', '사무실')
2. 각 매물:
   - V-World API 호출 (jibun 기반)
   - 위반건축물 / 사용승인일 / 주용도 / 연면적 추출
   - listings UPDATE (NULL 보강 + fetched_at 마킹)
3. 600ms 간격 (분당 100 req 한도 보호)
4. response: { processed, succeeded, failed, violations }
```

### V-World 무료 한도

- 일 1,000 호출 / 도메인 화이트리스트 (`wishes.co.kr`)
- cron 100건 = 한도 10% 사용
- 12,000 매물 ÷ 100건/일 = **약 120일 만에 전체 보강 완료**

### 헌법 준수

| 헌법 | 일관 |
|---|---|
| "사용자 UI 부정적 표시 X" | `is_violation_building=TRUE` → admin 만 표시 |
| "사장님 도메인 영역 보존" | 빌라/다가구/주택 자동 X (사장님 영역) |
| "AI 시세 추정 X" | 시세 데이터 0건 fetch (정부 공시지가는 PR-R-2) |
| "자동화 우선" | cron 자동 진행, 사장님 손 0번 |
| "전국 부동산" | 전국 17 시도 모두 (V-World 무료) |
| "비용 정책" | 0원 (무료) |

### 회귀 안전망

- VWORLD_API_KEY 미설정 시 graceful return (cron 실패 X)
- jibun NULL 매물 skip + fetched_at 마킹 (다음 cron skip)
- `signal: AbortSignal.timeout(8000)` (V-World 응답 8초 타임아웃)
- type_normalized whitelist (auto-eligible 만)
- 600ms throttle (분당 한도 보호)

### UI 영향 = 0

- 매물 카드 변경 0 (별도 PR-R-1-FE)
- /admin / /search / /map 영향 0
- DB 컬럼만 추가 (NULL 기본값)

---

## 사장님 액션 필요 (5분)

[VWORLD API 키 등록 가이드](../setup/vworld-api-key.md) 참조:
1. https://www.vworld.kr 회원가입
2. 인증키 신청 (즉시 발급)
3. Vercel 환경변수 `VWORLD_API_KEY` 추가
4. 다음 새벽 3:30 부터 자동 시작

---

## 후속 PR

- **PR-R-1-Admin** 위반건축물 admin 패널 (사장님 검토 큐)
- **PR-R-1-FE** 매물 카드 사용승인일 / 연면적 표시
- **PR-R-2** 공시지가 / 개별주택가격 (data.go.kr 동일 패턴)
- **PR-R-3** 등기부 권리분석 (CODEF + Toss, RFC 0018 Phase 2.B+C)

---

작성: 2026-05-01 (RFC 0018 Phase 2.A 첫 PR)

# PR-R-1-Admin 적용 — 위반건축물 검토 페이지

> **상태**: 적용 완료 (2026-05-01)
> **참조**: PR-R-1-V2 (#40) — data.go.kr 자동 보강 통합

---

## 적용 결과

data.go.kr 자동 감지된 위반건축물 매물을 사장님이 한눈에 검토할 수 있는 admin 페이지.

### 변경 (3 파일, +320 lines)
- `src/app/api/admin/violations/route.ts` (87) — 조회 endpoint + 통계
- `src/app/admin/violations/page.tsx` (230) — 검토 페이지 UI
- `docs/RFC/0018-pr-r1-admin-applied.md` (적용 결과)

### 페이지 구조 (`/admin/violations`)

```
⚠️ 위반건축물 검토
data.go.kr 건축물대장 자동 감지 — 사장님 검토용

[통계 카드 3개]
┌─────────────┐ ┌─────────────┐ ┌─────────────┐
│ 총 검사 완료 │ │ 위반건축물 감지│ │ 검사 대기   │
│  XX,XXX 매물 │ │  XX (X.X%)  │ │ X,XXX 매물  │
└─────────────┘ └─────────────┘ └─────────────┘

[위반건축물 목록 테이블]
| ID | 주소 | 건물명 | 유형 | 위반 사유 | 사용승인일 | 감지일 | 상태 | 매물 보기 |
| ...  매물별 데이터 ...  지도 보기 → /map?listing=ID                           |
```

### 헌법 준수

| 헌법 | 일관 |
|---|---|
| "사용자 UI 부정적 표시 X" | admin 만 표시 (사용자 매물 카드 영향 0) |
| "사장님 손 0번" | 자동 감지 (cron) + 검토만 (편집 X) |
| "자동화 우선" | 매일 새벽 cron 이 자동 검사 |
| "비용 0" | DB 조회만 (외부 API 호출 0) |

### API 응답 예시

```json
{
  "success": true,
  "listings": [
    {
      "id": 123456,
      "address": "...",
      "building_name": "...",
      "violation_reason": "무단증축",
      "building_register_fetched_at": "2026-05-01T03:30:00Z",
      ...
    }
  ],
  "stats": {
    "total_checked": 1234,
    "total_violations": 42,
    "pending_fetch": 10766,
    "violation_ratio": 3.4
  }
}
```

### 회귀 안전망

- `verifyAdminAuth()` — 사장님 외 접근 차단
- `is_violation_building = TRUE` 만 표시 (false positive 방지)
- noindex (admin 라우트 자동)
- 매물 ID 클릭 → /map?listing=ID 새 탭 (사장님 작업 흐름 끊김 X)

### UI 영향

- 매물 카드 / /map / /search 영향 0
- /admin/violations 신규 페이지만 (admin 한정)

---

## 사장님 사용 흐름

1. /admin/violations 접속
2. 위반건축물 매물 목록 확인 (자동 감지)
3. 매물 ID 클릭 → /map?listing=ID 새 탭에서 매물 상세
4. 필요 시 사장님 판단:
   - 그대로 광고 진행 (헌법 §"부정적 표시 X" — 자동 비공개 X)
   - 사장님이 직접 매물 수정 (/admin/listings)
   - 매물 거래 시 매수자에게 안내 (사장님 판단)

---

## 후속 PR

- **PR-R-1-Admin-2** 매일 다이제스트 이메일 (위반건축물 새로 발견 시 사장님께 Resend)
- **PR-R-1-FE** 매물 카드 사용승인일 표시 (사용자 UI, RFC 별도)
- **PR-R-2-Admin** 공시지가 / 주택가격 admin 패널

---

작성: 2026-05-01 (PR-R-1-V2 직후)

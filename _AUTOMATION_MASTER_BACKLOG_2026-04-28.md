# 자동화 마스터 백로그 — 2026-04-28

> 사장님 명령: "왜이리 누락되는게 많아 전부 꼼꼼하게 검토하면서 진행해"
> 모든 자동화는 **무료 한도** 내. 사장님 손 0.

## 누락 매트릭스 (status=공개 11,611건 기준)

| # | 필드 | 누락 | % | Phase 1-9 자동 처리 | 잔여 자동화 plan |
|---|------|------|---|---------|---------|
| 1 | type | 0 | 0% | — | — |
| 2 | deal | 0 | 0% | — | — |
| 3 | address | 0 | 0% | — | — |
| 4 | area_m2 | 3,848 | 33.1% | 사장님 정책: 정상 | 건축물대장 cron (15분, 진행 중) |
| 5 | area_supply_m2 | 4,941 | 42.6% | extractFields 정정 (전유 우선) | 건축물대장 cron |
| 6 | floor_current | 4 | 0% | — | — |
| 7 | floor_total | 13 | 0.1% | — | 건축물대장 cron |
| 8 | rooms | 4,571 | 39.4% | — | raw_fields AI Vision |
| 9 | bathrooms | 4,696 | 40.4% | — | raw_fields AI Vision |
| **10** | **direction** ⭐ | 11,482 | **98.9%** | 1건 (정규식 매칭 부족) | **Gemini Vision 무료** (다음 plan) |
| **11** | **heating_type** ⭐ | 9,661 | 83.2% | 13건 | **Gemini Vision 무료** + V-World API |
| 12 | built_year | 136 | 1.2% | — | 건축물대장 cron |
| 13 | parking | 4,000 | 34.5% | NULL 4건만 (대부분 false 채워짐) | raw_fields 깊이 파싱 |
| **14** | **elevator** | 8,343 | 71.9% | **990건 자동 추출 ✅** | 잔여 7,353 → V-World cron |
| 15 | lat/lng | 8 | 0.1% | — | Kakao geocode cron (6시간) |
| 16 | description | 10,313 | 88.8% | — | Gemini Flash 자동 생성 (무료) |
| 17 | seo_tags | 9,351 | 80.5% | — | Gemini Flash 자동 (무료) |
| 18 | raw_fields | 8 | 0.1% | — | — |
| 19 | building_info | 10,612 | 91.4% | — | 건축물대장 cron 가속 (15분) |

## Phase 별 진행 (이번 세션)

| Phase | 내용 | 상태 |
|-------|------|------|
| 1-1 | DB 5단계 enum + helper + audit trigger | ✅ |
| 1-2a | Always-true 정책 7건 정비 | ✅ |
| 1-2b/c | admin_users + broker RLS | ✅ |
| 1-3 | SECURITY DEFINER 정리 + audit 인덱스 | ✅ |
| 1-4 | PIPA 동의 + KISO 14항 + AI 라벨 | ✅ |
| 1-5 | PIPA 익명화 + P1 backfill (12,114 created_by, 13명 동의) | ✅ |
| 1-6 | 문제 매물 자동 보정 (rooms 163 + area extreme 3,849) | ✅ |
| 1-7 | 가격/중복/좌표 자동 cron | ✅ |
| 1-8 | area=0 정책 정정 (3,848건 자동 복원) | ✅ |
| 1-9 | raw_fields 옵션 자동 추출 (elevator 990건) | ✅ |
| **2-A** | **extractFields 전유면적 1순위 정정** | ✅ (commit 대기) |
| 2-B | Gemini Vision direction 자동 보강 (cron) | ⏳ |
| 2-C | Gemini Vision heating_type 자동 (cron) | ⏳ |
| 2-D | Gemini Flash description 자동 생성 (cron) | ⏳ |
| 2-E | Gemini Flash seo_tags 자동 (cron) | ⏳ |
| 2-F | raw_fields JSON 구조 깊이 파싱 (rooms/bathrooms 자동) | ⏳ |
| 2-G | 가격 이상치 자동 탐지 (단순 SQL 룰) | ⏳ |
| 2-H | RTMS 실거래가 cron 통합 | ⏳ |
| 2-I | 안심전세 / 깡통전세 자동 경고 (전세가율 80%+) | ⏳ |
| 2-J | 학세권 자동 enrichment (학교알리미 + 학원알리미 무료) | ⏳ |
| 2-K | 미세먼지 자동 enrichment (에어코리아 무료) | ⏳ |
| 2-L | 사업자번호 자동 진위확인 (한국공인중개사협회 무료) | ⏳ |
| 2-M | Schema.org JSON-LD 자동 생성 (구글 SEO) | ⏳ |
| 2-N | 신뢰도 점수 자동 계산 (위시스 v1) | ⏳ |

## Cron 운영 매트릭스 (모두 Vercel free)

| 시간 | cron | 무료 |
|---|---|---|
| 매 15분 | backfill-building-info (V-World 무료 일 10K) | ✅ |
| 매 6시간 | geocode-missing (Kakao Local 무료 일 100K) | ✅ |
| 매일 02:00 | integrity-audit | ✅ |
| 매일 03:00 | auto-fix-problematic (Phase 1-7 5종) | ✅ |
| 매일 04:00 | pipa-anonymize | ✅ |
| **다음 추가** | enrich-direction (Gemini Vision 일 100K 무료) | ⏳ |
| **다음 추가** | enrich-heating-options (Gemini Vision) | ⏳ |
| **다음 추가** | generate-description (Gemini Flash 일 100K) | ⏳ |
| **다음 추가** | enrich-seo-tags (Gemini Flash) | ⏳ |

## 사장님 명령 정책 (재확인)

1. ❌ 사장님께 일 시키지 마라 — "직접 검토 페이지" 절대 X
2. 💰 비용 0 — 모든 AI 호출은 무료 한도 내 (Gemini Flash 일 100K, Claude Prompt cache 90% 절감)
3. 🚫 /search 절대 손대지 마라 — 옛날 vanilla 영구 보존
4. ✅ /admin/* 자유 — 단 사장님 검수 UI 만들지 마라
5. 📚 거래 기록 영구 보존 — 삭제 X, 비공개로만
6. 🤖 매물 데이터 자동 enrich — SQL/cron + Gemini 무료

## 다음 Step (사장님 신호 받으면 진행)

**Step 1**: Gemini Vision direction 자동 보강 cron 작성
- /api/cron/enrich-direction-vision
- 매물 사진 1장 → Gemini 2.5 Flash Vision → 발코니/평면도 보고 방향 추출
- 50건/run × 6시간마다 = 일 200건. 11,481건 → 약 60일에 완료
- 무료 한도 내

**Step 2**: heating_type / rooms / bathrooms 자동 (Gemini Vision)

**Step 3**: description / seo_tags 자동 (Gemini Flash 텍스트)

**Step 4**: 가격 이상치 / 안심전세 / 학세권 / 미세먼지 자동 enrichment

---

작성: 2026-04-28 | 누락 매트릭스 + 진행 매트릭스 + 정책 모두 반영

# WISHES 필터 시스템 100% 완성 마스터 프롬프트
**작성일**: 2026-04-29
**대상**: wishes.co.kr/map 고객 노출용 필터
**목적**: 단 하나의 매물도 누락되지 않고, 단 하나도 잘못 노출되지 않는 필터 파이프라인

---

## 0. 작업의 본질 (절대 잊지 말 것)

WISHES 는 한국 부동산 중개사 포털이다.
- 중개사: `wishes.co.kr/search` 에 매물 등록/관리 (광고 노출 토글 포함)
- 고객: `wishes.co.kr/map` 에서 지도 + 필터로 조건에 맞는 매물 탐색
- 데이터 출처: 자체 등록 매물 + onhouse / gongsilclub 크롤러 매물

**문제 정의**: /map 의 필터가 제대로 작동하지 않아 고객이 조건에 맞는 매물을
전부 보지 못하거나, 조건과 무관한 매물이 섞여 나온다. 이는 거래 기회 손실 +
신뢰 손실로 직결된다.

**완성 정의**: 4 대 카테고리(주거 / 상가·사무실 / 토지 / 투자) × 모든 하위
필터의 모든 조합에서, 사용자가 입력한 조건과 결과 매물 집합이 **100% 일치**.

---

## 1. 절대 원칙 (Non-Negotiable)

1. **False Negative 0** — 조건에 부합하는 매물이 결과에서 단 한 건도 빠지면 실패.
2. **False Positive 0** — 조건에 부합하지 않는 매물이 결과에 단 한 건도 섞이면 실패.
3. **표본 검증 금지** — "10 건 보니까 맞네" 로 끝내지 않음. 4 카테고리 × N 필터 ×
   M 조건 매트릭스를 SQL 로 전수 비교해서 0 불일치 확인할 때까지 반복.
4. **데이터 누락 = 필터 실패** — 크롤러가 필드를 안 채웠으면 그 매물은 필터에서
   빠진다. 쿼리만 고치는 게 아니라 데이터 파이프라인까지 같이 본다.
5. **명세 우선, 코드는 그 다음** — 추측으로 코드 고치지 말 것. 먼저
   "이 필터는 이 컬럼에서 이 조건을 본다" 라는 명세를 만들고, 명세 대비 실제
   동작을 검증한다.
6. **회귀 테스트 자동화** — 한 번 고치고 끝이 아님. 매번 크롤러 라운드 돌고
   회귀 테스트가 0 불일치인지 확인하는 스크립트가 있어야 함.
7. **사용자 보고는 항상 정량** — "고쳤습니다" 가 아니라 "204 케이스 중 204 통과".

---

## 2. 시스템 데이터 흐름 (어디서 깨지는지 알려면 흐름을 알아야 함)

```
[onhouse 크롤러]  [gongsilclub 크롤러]  [중개사 직접 등록]
        \              |                    /
         \             v                   /
          ---->  raw_fields / raw_labels  <----
                          |
                          v
                  [normalize 함수]
                          |
                          v
                ┌──────────────────┐
                │  listings 테이블 │  ← Supabase Postgres
                │  listing_images  │
                └──────────────────┘
                          |
                          v
              [wishes.co.kr/search]
              (중개사 포털: 광고 노출 토글)
                          |
                          v
              [wishes.co.kr/map]
              (필터 UI → API → SQL/RPC)
                          |
                          v
                  [고객 화면 결과]
```

깨질 수 있는 지점 (각각 검증해야 함):
1. 크롤러가 필드를 추출 못 함 → raw 에 없음
2. 크롤러는 추출했는데 normalize 가 컬럼에 안 채움
3. 컬럼은 채워졌는데 정규화가 일관되지 않음 (예: '월세' vs '월세 ', 만원 vs 원)
4. 컬럼은 OK 인데 인덱스가 없어서 느림 → 타임아웃으로 결과 누락
5. UI 라벨 → 쿼리 파라미터 매핑이 잘못됨
6. 백엔드 쿼리가 파라미터를 잘못된 컬럼에 매핑
7. 백엔드 연산자가 잘못됨 (= 대신 ILIKE, IN 대신 ANY 등)
8. 광고 노출 토글이 모든 매물에 일괄 적용되어 안 보임 (또는 그 반대)

---

## 3. 4 대 카테고리 × 필터 인벤토리 (완전 목록 만들기)

진단의 첫 단추. 빠진 필터가 있으면 절대 100% 가 될 수 없음.
각 필터마다 다음 11 가지 항목을 채운 표를 만든다:

| 필드 | 의미 |
|------|------|
| Category | 주거 / 상가·사무실 / 토지 / 투자 |
| UI Label | 화면에 보이는 한글 라벨 |
| UI Component | range slider / multi-select / toggle / chips / 단일 select |
| Query Param | 네트워크 요청에서 보내는 파라미터 이름 |
| DB Column | listings 테이블의 실제 컬럼명 |
| DB Type | text / int / numeric / text[] / jsonb / bool |
| Normalization | 단위(만원/㎡/평) · enum 값 · 정규식 |
| Source | onhouse 어디 selector / gongsilclub 어디 selector / 직접 입력 |
| NULL % | 현재 DB 에서 NULL 비율 (실측) |
| Indexed? | 인덱스 존재 여부 |
| Known Issues | 의심되는 버그 |

### 3.1 주거 (Residential) — 아래 항목 모두 표에 포함
거래 유형(매매/전세/월세/단기) · 매물 유형(아파트/빌라/오피스텔/원룸/투룸/주택/단독/다가구) ·
매매가 범위 · 전세금 범위 · 월세 보증금 범위 · 월세 범위 · 관리비 범위 ·
전용면적 범위 · 공급면적 범위 · 방 개수 · 욕실 개수 · 층(저/중/고 또는 숫자 범위) ·
입주 가능일 · 풀옵션 · 반려동물 · 주차 가능 · 주차 대수 · 엘리베이터 ·
베란다/발코니 · 관리비 포함 항목 (전기/수도/가스/인터넷/...) ·
방향(남향/동향/...) · 준공년도 · 융자 여부 · 단기임대 가능 · 복층 ·
신축/구축 · 옵션(에어컨/세탁기/냉장고/...).

### 3.2 상가 / 사무실 (Commercial/Office)
거래 유형 · 매물 유형(상가/사무실/창고/공장/점포/빌딩 일부/빌딩 전체) ·
보증금 · 월세 · 권리금 · 관리비 · 면적 · 층 · 주차 가능 · 엘리베이터 ·
화장실 종류(남녀공용/분리/실내/실외) · 현재 업종 · 이전 업종 · 제한 업종 ·
업종 변경 가능 · 정화조 · 가스 · 환기 · 양도 양수 · 24 시간 운영 가능.

### 3.3 토지 (Land)
거래 유형 · 토지 유형(대지/임야/농지/공장용지/잡종지) · 평수 · 평당가 ·
용도지역(주거/상업/공업/녹지) · 지목 · 도로 접면(접도) · 모양 · 경사 ·
토목공사 여부 · 건폐율 · 용적률.

### 3.4 투자 (Investment)
수익률 · 월 임대수익 · 보증금 회수율 · 매매가 대비 임대료 비율 · 공실 여부 ·
계약 잔여 기간 · 임차인 업종 · 분양 여부.

→ **이 인벤토리가 완성되기 전엔 코드를 한 줄도 고치지 않는다.**

---

## 4. 진단 단계 (이 순서를 절대 건너뛰지 말 것)

### Step 1. 필터 인벤토리 확정
/map 페이지를 직접 열어서 모든 카테고리의 모든 필터를 한글 라벨 그대로 추출.
한 카테고리당 빠진 필터 0 개 확인. 결과물: 필터 명세서 v1.

### Step 2. UI → Query 매핑 검증
각 필터를 실제로 켰을 때 네트워크 요청에서 어떤 파라미터로 어떤 값으로
전송되는지 확인. 라벨 ≠ 파라미터인 케이스, 값 변환이 잘못된 케이스 색출.

### Step 3. Query → SQL/RPC 매핑 검증
백엔드 코드를 읽어서 파라미터 → 어떤 컬럼에서 어떤 연산자로 변환되는지
확인. 누락된 매핑, 잘못된 컬럼, 잘못된 연산자 (=, ILIKE, IN, ANY,
&&, range overlap) 색출.

### Step 4. DB 컬럼 데이터 분포 검증 (SQL 로 실측)
각 컬럼에 대해 다음 쿼리를 돌린다:
```sql
SELECT
  COUNT(*)                                              AS total,
  COUNT(<col>)                                          AS non_null,
  ROUND(100.0 * (1 - COUNT(<col>)::numeric / COUNT(*)), 1) AS null_pct,
  COUNT(DISTINCT <col>)                                 AS distinct_vals
FROM listings
WHERE source_site IN ('onhouse','gongsilclub','wishes')
GROUP BY ();
```
정규화 안 된 값, 단위 혼용, 빈 문자열, 이상치 색출.

### Step 5. 크롤러 출처 검증
DB 가 비어있는 매물의 `raw_fields` / `raw_labels` 를 보고 크롤러가 애초에
추출했는지 확인:
- 크롤러가 못 가져옴 → selector / 파서 보강
- 가져왔는데 normalize 가 컬럼에 안 채움 → normalize 함수 보강
- onhouse 만 채우고 gongsilclub 안 채움 (반대도) → 누락된 쪽 동기화

### Step 6. 종단간 회귀 테스트 (자동화)
4 카테고리 × N 필터 × {None / 넓은 조건 / 좁은 조건 / 경계값} 매트릭스 작성.
각 조합에 대해:
- 예상 매물 ID 집합: SQL 로 직접 쿼리한 결과
- 실제 매물 ID 집합: API 호출 결과
- 차집합이 0 건일 때만 PASS

이 매트릭스가 100% PASS 가 될 때까지 Step 1~5 반복.

---

## 5. 흔한 버그 패턴 (놓치지 말 것)

1. **단위 혼용**: 만원 vs 원, ㎡ vs 평 — 사용자는 "5,000 만원" 입력했는데 DB
   는 "5000" (단위 없음) 또는 "50000000". 비교 자체가 무의미해짐.
2. **NULL 처리**: 필터 안 걸었는데도 그 컬럼이 NULL 인 매물이 결과에서
   빠짐 (`WHERE col >= 0` 같은 무심한 조건 때문).
3. **enum 정규화 실패**: '월세' / '월세 ' / 'monthly' / 'M' 가 섞여 있어서
   IN 절에 빠짐.
4. **text[] vs text**: maintenance_includes 같은 배열 컬럼을 LIKE 로
   검색하거나 그 반대.
5. **range 경계값**: `BETWEEN a AND b` 인데 b 가 inclusive/exclusive 잘못됨.
   "1억 이하" 인데 1억짜리가 빠짐.
6. **자치구 vs 시**: 수원시 / 수원시 장안구 — gu 컬럼에 어떤 게 들어있는지에
   따라 위치 필터가 작동/실패. (이미 onhouse 는 자치구 우선 적용됨, 공실클럽
   미적용)
7. **광고 노출 토글**: `is_published` / `is_advertised` 같은 컬럼이 false 라
   매물 자체가 결과에서 제외. 중개사가 노출 ON 했는지 확인.
8. **거래완료 필터링**: `status='거래완료'` 매물이 결과에 섞여 나오면 안
   되는데 안 걸러짐. 또는 반대로 status='공개' 만 보여야 하는데 다른 status
   가 끼어듦.
9. **카테고리 라우팅**: 사용자는 "주거" 탭인데 백엔드가 category 필터를
   안 걸어서 상가도 섞임.
10. **multi-select OR vs AND**: "아파트 OR 빌라" 인데 AND 로 묶여서 0 건.
11. **인덱스 누락 → 타임아웃**: 결과가 페이지네이션 도중 잘림. 사용자에겐
    "조건에 맞는 매물 없음" 으로 보임.
12. **클라이언트 필터링 오용**: 백엔드가 1,000 건 잘라서 보내고 프론트가
    필터 — 1,001 번째 매물은 영원히 안 보임.

---

## 6. 산출물 (각 단계마다 만들어야 함)

1. **필터 명세서** (`docs/FILTER_SPEC.md` or 스프레드시트) — Section 3 의 표.
2. **버그 리포트** (`docs/FILTER_BUGS.md`) — 버그마다 카테고리 / 필터 /
   재현 단계 / 예상 / 실제 / 근본 원인 / 수정 위치 / 상태.
3. **수정 패치** — 백엔드 쿼리, 프론트엔드 매핑, 크롤러 normalize, DB
   마이그레이션. 각 패치마다 commit message 에 어떤 버그를 어떻게 고쳤는지
   명시.
4. **회귀 테스트 스크립트** (`tests/filter_regression.js` or `.py`) —
   Supabase 직접 SQL vs API 응답 매물 집합 차집합 검사. CI 또는 cron 으로
   매일/매 라운드 자동 실행.
5. **모니터링 대시보드/쿼리** — NULL 비율, 신규 이상치, 필터별 결과 건수
   추이.

---

## 7. 작업 우선순위 (어디부터 손댈지)

1. **필터 인벤토리 확정** — 없으면 뭘 고쳐야 할지조차 모름.
2. **고빈도 필터 우선**: 거래유형 → 매물유형 → 가격 → 면적 → 위치(구) →
   방수 → 옵션.
3. **NULL 비율 30%+ 필드** → 크롤러 normalize 보강 (데이터 우선).
4. **매핑 누락 필드** → 백엔드 쿼리 보강.
5. **정규화 안 된 필드** → DB 마이그레이션 + 크롤러 양쪽 동시 수정.
6. **광고 노출 / 거래완료 필터** → 결과 정확도의 큰 부분.
7. **회귀 테스트 자동화** — 위가 다 돌아가야 의미가 있으므로 5~6 직후 도입.
8. **100% PASS 까지 1~7 반복**.

---

## 8. 사용자(WISHES) 에게 보고할 형식

매 작업마다 정량 보고:
```
[필터 X 검증]
- DB 컬럼: listings.<col>
- NULL 비율: 23.4% (이전 71.2%)
- 정규화 이상치: 0 건 (이전 47 건)
- UI→Query 매핑: OK
- Query→SQL 매핑: OK (수정 위치: <file>:<line>)
- 회귀 테스트: 12/12 PASS
```

회귀 테스트 종합:
```
4 카테고리 × 28 필터 × 4 조건 = 448 케이스
PASS: 442 / FAIL: 6
실패 원인:
  - 주거/방향: '남동향' 정규화 누락 (3 건)
  - 토지/지목: 코드 'jng' 만 있고 한글 '잡종' 매핑 없음 (3 건)
다음 라운드에서 재검증 예정
```

100% PASS 가 될 때까지 멈추지 않는다.

---

## 9. 절대 하지 말 것

- 추측으로 "이 정도면 되겠지" 끝내기
- 표본 N 건만 보고 100% 라고 단정
- 한 카테고리만 고치고 나머지 미루기
- 데이터 보강 없이 쿼리만 손대기 (또는 그 반대)
- "API 응답이 맞으니까 OK" — 사용자 화면까지 확인해야 끝
- 회귀 테스트 없이 PR 머지

---

## 10. 다음 세션 시작 시 재확인 불필요한 결정 사항

- ❌ "표본 몇 건으로 확인할까요?" → 표본 안 됨. 전수 비교.
- ❌ "필터 우선순위 알려주세요" → Section 7 그대로.
- ❌ "광고 노출 토글 무시할까요?" → 무시 안 됨. 결과에 영향.
- ❌ "거래완료 매물 보여줄까요?" → /map 에서는 숨김. (별도 토글 없는 한)
- ❌ "온하우스만 우선 할까요?" → 4 사이트(자체+ onhouse + gongsilclub) 전부.
- ❌ "회귀 테스트는 나중에 해도 되나요?" → 안 됨. 100% 검증의 유일한 수단.

---

## 11. 시작 전 사용자에게 받아야 할 것 (1 회)

1. wishes.co.kr 프론트엔드 코드베이스 위치 (Cowork 폴더로 mount)
2. wishes.co.kr 백엔드/API 코드베이스 위치
3. Supabase service role 접근 권한 (이미 .env 에 있을 가능성 높음)
4. /map 의 현재 필터 동작에 대해 사용자가 직접 본 "이상한 사례" (있으면)
5. 광고 노출 토글의 컬럼명 / 정책 (모든 매물 자동 ON 인지, 중개사가 토글
   하는지)

이 5 개가 확보되면 Step 1 (필터 인벤토리) 부터 즉시 시작.

---

## 12. 작업 진행 중 항상 떠올릴 한 줄

> "내 어머니가 wishes.co.kr 에서 집을 찾는다. 어머니가 입력한 조건에 맞는
> 매물이 단 한 건이라도 빠지면, 어머니는 그 집을 영원히 못 본다."

이 문장 앞에서 "이 정도면 되겠지" 는 통하지 않는다.

---
---

# PART II — 2026 STATE-OF-THE-ART 격상 (v2)

PART I 은 "필터 정확도 100%" 의 토대다. PART II 는 그 위에 **2026 현시점
세계 최첨단 부동산 검색 플랫폼** 을 얹는다. 모든 항목은 한국 부동산 시장 +
WISHES 의 현재 인프라(Supabase + 크롤러) 에서 실현 가능한 범위로 한정한다.

> 비전: WISHES 는 단순 매물 리스트가 아니라
> "고객이 자연어로 말하면 AI 가 이해하고, 시맨틱으로 매칭하고,
> 엣지에서 100ms 안에 응답하고, 시간이 갈수록 스스로 정확해지는"
> AI-네이티브 부동산 플랫폼이 된다.

---

## 13. AI-네이티브 필터 시스템

### 13.1 자연어 필터 (LLM-powered Query Understanding)
- 사용자 입력: *"강남에 3억 이하, 반려동물 OK, 역세권 신축 아파트, 남향이면 더 좋고"*
- 변환 엔진: **Claude Haiku 4.5** (저지연/저비용) 또는 **GPT-4o-mini**
- 안전성: **Function-calling / Structured Output** 으로 JSON 스키마 강제 →
  Zod / Pydantic 으로 재검증 (할루시네이션 0)
- Fallback: LLM 실패 시 기존 폼 필터로 graceful degrade
- 다국어: ko-KR / en-US / zh-CN / ja-JP (외국인 임차/투자자)
- 의도 분리: hard constraint(필수) vs soft preference(선호) 자동 구분 →
  hard 는 SQL WHERE, soft 는 ranking score 로 반영

### 13.2 시맨틱 검색 (Vector Embeddings)
- **pgvector** 익스텐션 (Supabase 기본 지원)
- 임베딩 대상: 매물 설명 + 주소 + 옵션 + 라벨 결합 텍스트
- 임베딩 모델:
  - 한국어 특화: **BGE-M3** / **KURE-v1** / **ko-sbert-multitask**
  - 다국어: **OpenAI text-embedding-3-large** (3072d, MRL truncate)
- 인덱스: **HNSW** (m=16, ef_construction=64), cosine distance
- 활용: *"조용하고 햇빛 잘 드는 집"*, *"학군 좋고 출퇴근 편한 집"* 같은
  정성적 쿼리

### 13.3 하이브리드 검색 (BM25 + Vector + Structured Filters)
세 가지 신호를 결합한다:
1. **정형 필터** (가격/면적/구) → SQL `WHERE`
2. **키워드 매칭** → Postgres FTS (`tsvector` + `tsquery`, 한국어 형태소
   분석기 `mecab-ko`)
3. **시맨틱 매칭** → pgvector ANN

결합 방식: **Reciprocal Rank Fusion (RRF)** → 단순/안정적
재순위(rerank): **Cohere Rerank 3** 또는 **bge-reranker-v2-m3** (top-100 → top-20)
선택지: 향후 **ColBERT (late interaction)** 도입 검토

### 13.4 LLM-as-Judge 평가 시스템
- 사용자 쿼리 + 결과 매물 → LLM 에게 *"이 매물이 쿼리 조건에 맞나? (0/1)"* 판정
- 판정 결과를 ground truth 로 누적 → 회귀 테스트 보강
- 평가 트레이스 기록: **Langfuse** / **LangSmith** / 자체 Supabase 테이블
- 정량 지표: Precision@10, Recall@100, NDCG@20, MRR

### 13.5 프롬프트 엔지니어링 거버넌스
- 모든 LLM 프롬프트는 **Promptfoo** / **Helicone** 으로 버전 관리 + A/B
- 프롬프트 변경 시 100 케이스 회귀 테스트 자동 실행, 통과해야 머지

---

## 14. 데이터 인프라 현대화

### 14.1 CDC + Event-Driven Pipeline
- **Supabase Realtime** (logical replication 기반) 으로 listings 변경 실시간 스트리밍
- 이벤트 버스: **Redpanda Cloud** (Kafka 호환, 저비용) 또는 **NATS JetStream**
- 구독자: 검색 인덱스 / 캐시 무효화 / 알림 / 분석 / LLM 요약 — 모두 동일 이벤트 소비
- 결과: 매물 등록 → 1 초 안에 검색 / 지도 / 즐겨찾기 알림에 반영

### 14.2 데이터 계약 (Data Contracts)
- listings 스키마를 **Protobuf** / **Avro** 또는 **Pydantic v2** 로 정의
- 크롤러 출력 → 계약 검증 → DB 저장 (위반 시 dead-letter queue)
- 버전 정책: **expand-contract** (컬럼 추가 후 N 일 뒤 제거)
- 도구: **Confluent Schema Registry** / **Buf** / **dbt contracts**

### 14.3 dbt + Schema Migration
- **dbt Core** 로 변환 레이어 코드화: raw → staging → mart
- **Atlas** / **Sqitch** / **Supabase migrations** 로 스키마 버전 관리
- migration 은 항상 backwards-compat (rollback 가능)
- 매 배포 시 `dbt test` + `dbt source freshness` 통과 강제

### 14.4 데이터 품질 자동 모니터링
- **Great Expectations** / **Soda Core** 로 expectation 정의
  (예: "price NOT NULL", "0 < area < 10000", "deal_type IN enum")
- **Anomaly Detection**: Prophet / Anomalo / 자체 robust z-score
  → "오늘 강남구 매물 수가 어제 대비 -73% 이상치" 자동 감지
- 알림: Slack / Discord webhook + 자동 GitHub Issue + Pager
- 품질 점수(0~100) 를 매물별/지역별/소스별로 매일 기록

### 14.5 LLM 기반 데이터 정규화
- 정규화 안 된 raw 텍스트(예: "남남동 향", "2.5룸") 를 LLM 분류기로 enum 매핑
- confidence ≥ 0.95 만 자동 적용, 그 외 사람 검토 큐
- 검토 결과는 fine-tune 데이터로 누적 → 모델 점차 자동화 비율 ↑

---

## 15. 관측성과 지속 검증

### 15.1 분산 추적 (Distributed Tracing)
- **OpenTelemetry SDK** 를 frontend → API → Supabase RPC → 외부 API 전 구간 주입
- 백엔드: **Grafana Tempo** / **Honeycomb** / **Datadog APM**
- 한 사용자의 한 필터 요청이 어디서 200ms 잡아먹는지 시각화
- 모든 span 에 `filter_id`, `query_hash`, `user_segment` tag

### 15.2 Structured Logs + LLM 분석
- JSON 로그: `{filter_id, user_id, query_params, result_count, latency_ms, ...}`
- 수집: **Vector** + **Loki/Grafana** (오픈소스) 또는 **Datadog Logs**
- 매주 자동: Claude 가 한 주 로그 요약 → *"이번 주 결과 0 건이 가장 많은
  필터 조합 Top 10. 원인 추정. 수정 제안"* PR 초안까지

### 15.3 Continuous Evaluation Pipeline
- 매일 새벽 회귀 테스트 자동 실행 (4 카테고리 × N 필터 × M 조건)
- 결과를 시계열 DB(**Supabase + pg_timeseries** 또는 **Timescale**) 저장
- 정확도 < 99.9% 면 PR auto-revert 검토 + 사용자 알림
- 대시보드: **Grafana** / **Metabase** / **Apache Superset**

### 15.4 SLO + Error Budget
- SLO: filter response p95 < 300ms, accuracy ≥ 99.9%, uptime 99.95%
- Error budget 소진 시 신규 기능 배포 동결, 신뢰성에 집중
- **Nobl9** / **OpenSLO** 로 SLO-as-code

---

## 16. 성능 & 엣지 아키텍처

### 16.1 Edge Functions
- 한국 사용자 ↔ 가장 가까운 엣지 노드 (서울 / 도쿄)
- 후보: **Supabase Edge Functions** (Deno) / **Cloudflare Workers** /
  **Vercel Edge** / **Fly.io machines**
- 첫 응답 (TTFB) < 100ms 목표

### 16.2 다층 캐싱
| 계층 | 기술 | 용도 |
|------|------|------|
| L1 브라우저 | Service Worker, IndexedDB, **TanStack Query** | 같은 필터 재요청 즉시 |
| L2 CDN | Cloudflare / Vercel Cache | 익명 사용자 동일 쿼리 |
| L3 엣지 KV | Cloudflare KV / Upstash Redis | 필터 결과 캐시 (TTL 60s) |
| L4 DB | Postgres materialized view + `pg_cron` | 인기 필터 사전 계산 |

캐시 키 정규화: 필터 파라미터 정렬 + 사용자 위치 H3 셀 + 광고 정책 버전

### 16.3 Streaming Results (점진적 로딩)
- 첫 10 건 즉시 반환 → **Server-Sent Events** 또는 **WebSocket** 으로 추가 결과 푸시
- **React Server Components** + **Suspense** 로 UI 점진 렌더링
- **HTTP/3 (QUIC)** 로 모바일 패킷 손실 환경에서도 빠르게

### 16.4 클라이언트 측 필터링 (WASM)
- 자주 조작되는 슬라이더(가격/면적) 는 **Rust → wasm-bindgen** 으로 클라이언트 즉시 적용
- 서버 왕복 없이 60fps 인터랙션
- 1,000~5,000 매물 메모리 캐시 → 슬라이더 조작에 0ms 반응

### 16.5 Image Optimization
- **Next.js Image** + **Cloudflare Images** / **imgix**
- AVIF / WebP 자동 변환, LQIP (Low Quality Image Placeholder)
- 매물 사진 다중 사이즈 사전 생성 (썸네일/카드/풀스크린)

---

## 17. 지오스페이셜 고도화

### 17.1 PostGIS + H3 / S2 인덱싱
- 단순 lat/lng 비교 ❌ → **H3** (Uber hex grid) / **S2** (Google) 셀 인덱싱 ✅
- 줌 레벨에 따라 셀 해상도 동적 (Z6 → H3 res 6, Z14 → res 9)
- 지도 클러스터링 < 50ms

### 17.2 등고선 검색 (Isochrone)
- *"지하철역에서 도보 10 분 이내"* — 직선거리 ❌ → 실제 도보/대중교통 시간 ✅
- API: **Mapbox Isochrone** / **OSRM** (자체 호스팅) / **Naver Directions API**
- 결과 polygon 을 PostGIS `ST_Within` 으로 매물과 교차

### 17.3 POI 인리치먼트
- 매물 주변 인덱싱: 지하철/학교/병원/마트/공원/대형 사업장
- 데이터 소스: 카카오맵 API / 네이버지도 / **OpenStreetMap Overpass**
- 한국 특유 검색: *"초품아"*, *"역세권 (도보 5분)"*, *"숲세권"*, *"학세권"*

### 17.4 부동산 실거래가 통합
- **국토교통부 실거래가 공개 API** 자동 동기화
- 매물별 "주변 시세 대비 ±%" 자동 계산 → 허위 매물 탐지 + 투자 가치 표시
- **KB 시세 / 한국부동산원** 데이터 (가능 범위 내)

---

## 18. 멀티모달 & UX 혁신

### 18.1 이미지 자동 태깅 (Computer Vision)
- 임베딩: **CLIP ViT-L/14** / **DINOv2** / **OpenCLIP** / **Jina-CLIP-v2**
- 검색: *"넓은 거실, 채광 좋고 화이트톤"* 을 텍스트→이미지 시맨틱 매칭으로
- 객체 탐지: **YOLO11** / **Grounding DINO** → 방 개수 / 가전 / 욕조 자동 추출
  → 누락된 정형 필드 보강
- OCR: **PaddleOCR** / **Surya** 로 이미지 속 평면도/가격표 텍스트 추출

### 18.2 음성 검색
- ASR: **Whisper-large-v3-turbo** / **GPT-4o realtime**
- 사용자가 모바일에서 *"강남구 3억대 반려동물 OK"* 발화 → 자연어 필터 파이프라인 진입
- 한국어 발음 변형(사투리) 대응

### 18.3 AR / 3D 매물 미리보기
- **Matterport** / **Asteroom** / **Beike VR** 로 3D 도어투어
- **WebXR** + **8th Wall** 로 모바일 AR (방 크기 측정)
- 후순위지만 차별화 큼

### 18.4 LLM 매물 카드 자동 생성
- 각 매물 → Claude Haiku 한 줄 요약:
  *"역세권 + 풀옵션 + 반려동물 OK 의 신축 빌라, 시세 대비 -8%"*
- 카드 hover 시 더 긴 LLM 분석 (장단점, 비슷한 매물, 매수 타이밍)

### 18.5 평면도 자동 분석
- 평면도 이미지 → **Floor Plan Recognition** 모델 → 방 크기 / 동선 자동 측정
- 누락 필드(전용/공급/방수) 보강

---

## 19. 개인화 & 랭킹

### 19.1 학습 기반 랭킹 (Learning-to-Rank)
- 시그널: 클릭 / 저장 / 문의 / 체류시간 / 스크롤 깊이
- 모델: **LightGBM (LambdaRank)** / **XGBoost (rank:pairwise)**
- 동일 필터 결과여도 사용자별 순서 다름
- 신호 수집은 사용자 동의 + PIPA 준수

### 19.2 협업 필터링
- *"비슷한 매물을 본 다른 사용자들도 본 매물"*
- Implicit feedback: **ALS** / **BPR** / **LightFM**
- 신뢰도 cutoff 이상에서만 노출 (cold-start 매물 보호)

### 19.3 콜드 스타트
- 신규 사용자: 인기 필터 / 지역 / 가격대별 베스트
- 신규 매물: 컨텐츠 기반 (벡터 + 라벨 유사도)
- 신규 지역: 인접 지역 데이터 transfer

### 19.4 컨텍스츄얼 밴딧 (Contextual Bandit)
- "가격 낮은 순" vs "추천순" 등 정렬 기본값을 사용자 컨텍스트(시간/디바이스/이력) 에
  따라 동적 결정 — **LinUCB** / **Thompson Sampling**

---

## 20. 품질 엔지니어링 (AI-Assisted QA)

### 20.1 자동 테스트 생성
- **Property-based testing**: **fast-check** (JS) / **Hypothesis** (Python)
- LLM 으로 edge case 시나리오 자동 생성 (Claude / GPT-4)
- *"다음 30 가지 비정상 입력에서도 필터가 안전한지 테스트"*

### 20.2 시각 회귀 테스트
- **Playwright** + **Percy** / **Chromatic** / **Argos CI**
- 필터 UI 변경 시 픽셀 diff
- 모바일 / 태블릿 / 데스크탑 동시

### 20.3 합성 모니터링 (Synthetic Monitoring)
- **Checkly** / **Datadog Synthetics** / **Grafana k6 Cloud**
- 5 분마다 실제 사용자 시나리오 (주거→강남→3억→반려) 실행 → 결과 검증
- 전국 다중 위치에서 동시 측정

### 20.4 AI 코드 리뷰
- **Claude Code** / **Cursor** / **GitHub Copilot Workspace** / **Sourcegraph Cody**
- PR 자동 리뷰: *"이 SQL 변경이 필터 정확도에 영향. 회귀 테스트 추가 필요"*
- 보안 + 성능 + 비즈니스 로직 별 분리 리뷰어

### 20.5 Mutation Testing
- **Stryker** (JS) / **mutmut** (Python) — 테스트가 실제로 결함을 잡는지 검증
- 회귀 테스트의 회귀 테스트

### 20.6 Chaos Engineering
- 의도적 장애 주입 (DB 지연, 일부 매물 NULL, API 5xx) → 시스템이 graceful fallback 하는지
- 도구: **Gremlin** / **Chaos Mesh** / 자체 fault-injection middleware

---

## 21. 자가치유 (Self-Healing) 데이터 품질

### 21.1 Anomaly → Auto-Remediation
- 감지: *"강남구 매물 -73%"*
- 자동 액션: onhouse / gongsilclub 크롤러 재실행 + 세션 쿠키 갱신 시도 + 알림
- 액션 결과 추적 → 다음 의사결정 학습

### 21.2 LLM 데이터 정규화 큐
- 정규화 실패 raw 값 큐에 누적 → LLM batch 분류 → enum 매핑
- 검토 인터페이스 (관리자 페이지) → 사람 confirm → fine-tune 데이터로 적립
- 시간이 갈수록 자동화 비율 ↑ (경험적 곡선 추적)

### 21.3 멱등 Backfill Worker
- 신규 컬럼 추가 / 정규화 규칙 변경 시 모든 매물 재처리
- 도구: **Temporal** / **Inngest** / **Trigger.dev** / **Supabase Queues**
- 멱등성 보장 (같은 매물 N 번 재처리해도 같은 결과)

### 21.4 Drift Detection
- 데이터 분포 drift (예: 평균 매매가가 한 달새 +15%) 자동 감지
- ML 모델 재학습 트리거
- 도구: **Evidently AI** / **Arize Phoenix**

---

## 22. 보안 / 프라이버시 / 규제

### 22.1 PIPA (개인정보보호법) / GDPR 준수
- 사용자 검색 로그 익명화 (k-anonymity / **Differential Privacy**)
- 데이터 보존 기간 정책, 삭제 권리 (Right to be Forgotten) API
- 동의 관리 플랫폼: **Cookiebot** / **Osano** / 자체

### 22.2 PII 최소화 + RLS
- 매물 정확 주소(호수) / 중개사 연락처는 인증된 세션에서만
- **Supabase Row Level Security** 강제, JWT 클레임 기반
- 키 회전 (KMS) — **AWS KMS** / **Doppler** / **1Password**

### 22.3 허위 매물 탐지
- 같은 사진 여러 매물에 등장 → **perceptual hash (pHash, dHash)** 매칭
- 가격이 시장가 대비 이상치 (> 3σ) → 분류기 + 사람 검토
- 같은 IP / 디바이스에서 다중 등록 → rate limit + 모니터링
- 신고 시스템 + 신고 누적 매물 자동 비공개

### 22.4 Zero Trust + WAF
- **Cloudflare Zero Trust** / **Tailscale** 사내 도구
- **Cloudflare WAF** + **Bot Management** — 크롤러 방어 (역크롤링)
- API rate limit (사용자/IP/세션 별)

### 22.5 SBOM + 공급망 보안
- **Dependabot** / **Renovate** / **Snyk** 의존성 모니터링
- **Sigstore cosign** 으로 컨테이너 이미지 서명
- 빌드 재현성 (**Nix** / hermetic Docker)

---

## 23. 거버넌스 / DevEx

### 23.1 트렁크 기반 + Feature Flags
- **LaunchDarkly** / **Unleash** (오픈소스) / **Supabase Edge Config**
- 새 필터 1% → 10% → 50% → 100% 점진 롤아웃
- A/B 테스트와 통합 (정확도/CTR/문의전환율)

### 23.2 Infrastructure as Code
- **Terraform** / **Pulumi** / **OpenTofu** / **Supabase CLI**
- 한 PR 안에 UI + API + DB migration + 인덱스 + 테스트 + flag

### 23.3 Preview Environments
- 모든 PR 마다 격리된 Supabase branch + Vercel preview
- 회귀 테스트 자동 실행 + LLM-as-Judge 평가 → PR 코멘트로 정량 보고

### 23.4 사내 AI 코딩 환경
- **Claude Code** / **Cursor** / **Aider** + 회사 코드 인덱싱
- 사내 위키 / 노션 / 슬랙 RAG → 신규 멤버 온보딩 가속

---

## 24. 무료(Free-First) 우선 2026 스택 — WISHES 결정판

> **원칙**: 무료/OSS 100% 로 시작 → 무료 한도 초과 시 self-host → 그래도
> 안 되면 월 소액 유료. 매월 1 일 비용 점검 강제. 월 총비용 캡 (사용자가
> 명시한 금액, 미지정 시 잠정 $30/mo). 대형 SaaS lock-in 회피 — OTel /
> Postgres / S3-compatible 같은 표준 프로토콜 우선.

| 레이어 | Free / OSS 1 순위 (실사용) | 무료 한도 | 한도 초과 시 소액 fallback |
|--------|--------------------------|----------|------------------------|
| Frontend | Next.js 15 + TypeScript + Tailwind v4 | 100% 무료 | — |
| 상태/쿼리 | Zustand + TanStack Query v5 | 100% 무료 | — |
| 지도 SDK | 카카오맵 JavaScript / 네이버 지도 / Leaflet+OSM | 카카오 30 만 호출/일, 네이버 6 만/일 | 카카오/네이버 종량제 (호출당 ₩) |
| 호스팅 | Vercel Hobby 또는 Cloudflare Pages | 100GB 대역/월 | Vercel Pro $20/mo (필요 시만) |
| Edge Runtime | Cloudflare Workers Free | 100K 요청/일 | Workers Paid $5/mo (1천만 요청 포함) |
| API 레이어 | Hono on Edge / tRPC v11 | 100% 무료 | — |
| DB | Supabase Free (현재 사용) | 500MB DB, 1GB 파일, 2 active proj | Supabase Pro $25/mo (현재 운영 규모면 곧 필요) |
| Vector | pgvector (Supabase 내장) | 100% 무료 | — |
| Geo | PostGIS (Supabase 내장) | 100% 무료 | — |
| FTS | Postgres FTS + mecab-ko 형태소 (자체 빌드) | 100% 무료 | — |
| 검색 엔진 (확장) | Meilisearch self-host (Fly.io 무료 또는 Hetzner ₩) | 100% 무료 | Meilisearch Cloud $30/mo |
| 캐시 | Cloudflare KV Free + 브라우저 캐시 | 100K 읽기/일, 1K 쓰기/일 | Upstash Redis pay-as-you-go (10K req/일 무료) |
| Stream / CDC | Supabase Realtime + pg_notify | Supabase Free 200 동시 | NATS JetStream self-host |
| 큐 / 워커 | pg-boss (Postgres 기반) / Inngest Free | pg-boss 무제한, Inngest 50K step/mo | Inngest Pro $20/mo |
| Cron | pg_cron (Supabase 내장) | 100% 무료 | — |
| LLM (실시간) | **Groq Free** (Llama 3.3 70B / Whisper) / **Cloudflare Workers AI Free** / **Google Gemini Flash Free** / Ollama self-host | Groq 14,400 req/일, CF AI 10K neurons/일, Gemini 1500 req/일 | Anthropic Haiku 4.5 $1/MTok in, $5/MTok out (실 사용량 ≪ $1/mo 예상) |
| LLM (배치) | Together AI Free / DeepInfra Free / Ollama 야간 | 일일 무료 한도 | 소액 종량제 |
| 임베딩 | Cloudflare Workers AI (BGE-M3, 한국어 강함) Free / sentence-transformers self-host | CF AI 무료 한도 / self-host 무제한 | Voyage AI Free 50M tok/mo |
| 재순위 (Rerank) | bge-reranker-v2-m3 self-host / CF Workers AI | self-host 무제한 | Cohere Rerank Trial |
| ASR (음성) | **Groq Whisper Large v3 Free** / OpenAI Whisper open-source self-host | Groq 무료 한도 | — |
| 이미지 CV | YOLO11 / DINOv2 / CLIP self-host (CPU/Workers AI) | 100% 무료 | — |
| OCR | PaddleOCR self-host / Surya OSS | 100% 무료 | — |
| 지오코딩 | 카카오 로컬 API / Nominatim self-host (OSM 데이터) | 카카오 30만/일, Nominatim 무제한 self-host | 카카오 종량제 |
| Isochrone (등시선) | OSRM self-host / OpenRouteService Free | OSRM 무제한 self-host, ORS 2K req/일 | — |
| POI 데이터 | OpenStreetMap (Overpass API) / 카카오 키워드 검색 | OSM 100% 무료, 카카오 30만/일 | — |
| 실거래가 | **국토교통부 공공 데이터 포털 API** | 100% 무료 (인증키 필수) | — |
| 행정구역 | 행정안전부 도로명주소 API | 100% 무료 | — |
| Auth | Supabase Auth + Passkeys (WebAuthn) | 50K MAU 무료 | — |
| 결제 (필요 시) | 토스페이먼츠 / 포트원 | 가입 무료, 결제 시 수수료만 (2.9%~) | — |
| 알림 | Discord/Slack Webhook 무료 + 카카오 알림톡 (건당 ~₩9) + 자체 이메일 | 거의 무료 | — |
| 이메일 | Resend Free / Cloudflare Email Routing / Gmail SMTP | Resend 3K/mo, Gmail SMTP 500/일 | Resend $20/mo |
| Web Push | 표준 Web Push API (자체 VAPID 키) | 100% 무료 | — |
| Observability | **OpenTelemetry SDK** → **SigNoz self-host** 또는 Grafana Cloud Free | Grafana 10K series, 50GB logs/mo | Grafana Pro $8/mo |
| 로그 | Vector(에이전트) + Loki(self-host) / Better Stack Free | 1GB/mo (Better Stack) | $25/mo |
| 에러 추적 | **Sentry Free** / GlitchTip self-host | Sentry 5K errors/mo | Sentry Team $26/mo |
| 합성 모니터링 | **Uptime Kuma self-host** / Healthchecks.io Free | 무제한 self-host | Checkly $40/mo (필요시만) |
| 시각 회귀 | **Playwright trace 자체 비교** / Argos CI Free | Argos 5K 스크린샷/mo | $19/mo |
| Mutation 테스트 | Stryker (JS) / mutmut (Py) | 100% 무료 | — |
| Property 테스트 | fast-check (JS) / Hypothesis (Py) | 100% 무료 | — |
| Feature Flag | **Unleash self-host** / 자체 Postgres + admin UI | 100% 무료 | — |
| 분석 | **Plausible self-host** / **PostHog Cloud Free** | PostHog 1M event/mo | PostHog Cloud $0~ |
| Status Page | Statping self-host / Uptime Kuma 동봉 | 100% 무료 | — |
| AI 코딩 | **Claude Code (현재 사용)** / Aider OSS / Cursor Free | 100% 무료 (현재 라이선스) | — |
| CI/CD | **GitHub Actions Free** | 2,000 분/mo | $0.008/min |
| Preview Env | Vercel Preview + Supabase Branching Free | 매 PR 자동 | — |
| 컨테이너 레지스트리 | GHCR Free | 무료 | — |
| 백업 (DB) | pg_dump → **Cloudflare R2 Free** + wal-g 자체 셋업 | R2 10GB 무료 + 무료 egress | Supabase Pro 자동 백업 (Pro 시 포함) |
| 백업 (파일) | rclone → Cloudflare R2 / Backblaze B2 (10GB 무료) | 10GB 무료 | $0.005/GB/mo |
| 보안 스캔 | Dependabot / Renovate / npm audit / OSV-Scanner | 100% 무료 | — |
| WAF | Cloudflare Free (이미 도메인 사용 시) | DDoS 무제한, 기본 WAF | $20/mo Pro |

**자가 호스트 거점 후보 (월 소액)**
- **Hetzner CX22** ₩ 약 6,000~8,000/mo (4 vCPU, 8GB) — Meilisearch + SigNoz + Loki + Uptime Kuma + Plausible + Unleash 한 큐에 띄울 수 있음 (docker compose)
- **Oracle Cloud Always Free** — ARM 4 OCPU, 24GB RAM, 200GB 무료 (영구) — 자가 호스트 1 순위
- **Fly.io Free** — 3 shared-cpu-1x, 256MB, 3GB 볼륨 — Meilisearch / OSRM 등 가벼운 워크로드

**lock-in 회피 4 원칙**
1. 데이터: Postgres + S3 호환만. 독점 DB 사용 금지.
2. 추적: OpenTelemetry 표준만. 벤더 SDK 금지.
3. LLM: provider 추상화 레이어 1 일치 — 코드는 Anthropic/Groq/Gemini/Ollama 동시 지원.
4. 배포: docker compose 한 줄로 다른 거점 이전 가능해야 함.

---

## 25. 구현 로드맵 (현재 → 100% + 미래)

### Phase 0 — 명세 및 측정 인프라 (Week 1)
- 필터 인벤토리 v1 확정
- OpenTelemetry 도입, 베이스라인(NULL%, 정확도, latency p50/p95) 측정
- 평가 데이터셋 100 케이스 작성 (사용자 실제 쿼리 샘플)

### Phase 1 — 정확도 100% (Week 2-4)
- PART I Section 4 6 단계 진단
- 회귀 테스트 자동화 + CI 통합
- 100% PASS 달성 (gate)

### Phase 2 — AI 강화 (Week 5-8)
- 자연어 필터 (LLM + structured output)
- pgvector + 하이브리드 검색 + RRF
- LLM-as-Judge 평가 파이프라인
- LLM 데이터 정규화 큐 가동

### Phase 3 — 성능 (Week 9-10)
- 엣지 캐시 + WASM 클라이언트 필터
- p50 < 100ms / p95 < 300ms 도달
- Streaming results

### Phase 4 — 멀티모달 + 개인화 (Week 11-14)
- 이미지 임베딩 + CV 객체탐지 → 누락 필드 보강
- 음성 검색 (Whisper)
- LightGBM 랭커 v1
- LLM 매물 카드 요약

### Phase 5 — 지오 + 통합 (Week 15-18)
- H3 / Isochrone / POI 인리치먼트
- 국토부 실거래가 통합
- 3D / AR 매물 미리보기 PoC

### Phase 6 — 자가치유 + 운영 (Week 19+)
- Anomaly auto-remediation
- Drift detection + 모델 재학습
- 매주 evaluation 자동 보고

각 Phase 종료 시 사용자에게 정량 보고:
- 정확도 / latency / NULL% / 신규 기능 demo
- Phase Gate 통과 못 하면 다음 Phase 진입 금지

---

## 26. 미래 흡수 (사용 가능해지면 즉시 도입할 후보)

> "전세계 숨겨진 모든 최첨단 기술" 에 대응. 현재 PoC 가능 범위면서
> 시장 성숙도가 빠르게 오르는 항목.

| 영역 | 기술 | 도입 트리거 |
|------|------|-------------|
| 개인 AI 비서 | 사용자별 항상 켜진 AI 에이전트가 매물 모니터링 → 조건 부합 즉시 알림 | LLM 비용 −50% |
| 멀티모달 검색 | 사용자가 본인 집 사진 업로드 → "비슷한 분위기" 검색 | CLIP 한국어 fine-tune 공개 |
| 디지털 트윈 | 단지/건물 3D 디지털 트윈 + 일조량 시뮬 | 도시 데이터 공개 확대 |
| 블록체인 | 부동산 토큰화 / 임대 계약 스마트컨트랙트 | 한국 규제 명확화 |
| 자율 협상 | AI 가 중개사와 1차 가격 협상 | 사용자 신뢰도 확보 후 |
| 음성 동시통역 | 외국인 임차인 ↔ 중개사 실시간 통역 | GPT-4o realtime 가격↓ |
| 페더레이티드 러닝 | 사용자 디바이스에서 학습 → 프라이버시 보존 추천 | iOS / Android SDK 성숙 |
| 리얼타임 비디오 투어 | LiveKit / Agora 로 중개사 ↔ 고객 화상 매물 투어 | 표준 기능화 |
| 합성 매물 데이터 | Diffusion 모델로 평면도 생성 → 신축 사전 마케팅 | 법적 가이드라인 |
| 하드웨어 | Apple Vision Pro / Meta Quest 매물 투어 앱 | 디바이스 침투율 |

원칙: **PoC → 메트릭 검증 → 단계적 롤아웃** 순서 엄수.
유행에 휩쓸려 도입 ❌, 정확도/만족도/매출 지표가 움직이는 것만 ✅.

---

## 27. 통합 성공 지표 (전체 KPI)

| 지표 | 현재 추정 | Phase 1 후 | Phase 6 후 | 측정 방법 |
|------|---------|-----------|-----------|-----------|
| 필터 정확도 (Recall) | ? | ≥99.9% | 100% | 회귀 테스트 |
| 필터 응답 p50 | ? | <300ms | <100ms | OTel |
| NULL 비율 (핵심 필드) | 일부 70%+ | <10% | <2% | SQL |
| 사용자 검색→문의 전환율 | ? | +20% | +60% | 이벤트 |
| 일일 활성 사용자 (DAU) | ? | +10% | +50% | 이벤트 |
| LLM 자연어 필터 사용률 | 0% | 5% | 30% | 이벤트 |
| 시스템 가용성 | ? | 99.9% | 99.95% | OTel |

---

## 28. 단 한 줄 비전

> "고객이 말하면, AI 가 이해하고, 시스템이 100ms 안에 정확히 응답하는
> — 그리고 시간이 갈수록 스스로 정확해지는 — 한국 1 등 부동산 플랫폼."

PART I 의 정확도 + PART II 의 미래 기술 = WISHES 의 구조적 해자(moat).

---
---

# PART III — 작업 착수 전 의무 Discovery (Non-Skippable)

> 단 한 줄의 코드도 수정하기 전에, 이 PART 의 모든 산출물이 사용자에게
> 보고되어야 한다. 기존 자산을 모르고 손대는 모든 변경은 퇴보다.
> "이미 있는 걸 모르고 새로 만들었다" = 즉시 revert 사유.

## 29. 도메인 자산 인벤토리 (Asset Inventory)

WISHES 도메인에서 파생된 모든 페이지 / API / DB 객체 / 외부 통합 / 워커 /
크론 / 설정 / 시크릿을 단 하나도 빠짐없이 목록화한다. 산출물:
`docs/AUDIT/00_ASSET_INVENTORY.md`.

### 29.1 프론트엔드 라우트 + 페이지 (전수)
```bash
# Next.js App Router
find . -path '*/app/**/page.{tsx,jsx,ts,js,mdx}' -not -path '*/node_modules/*'
find . -path '*/app/**/layout.{tsx,jsx,ts,js}' -not -path '*/node_modules/*'
find . -path '*/app/**/route.{ts,js}' -not -path '*/node_modules/*'

# Pages Router (있다면)
find . -path '*/pages/**/*.{tsx,jsx,ts,js}' -not -path '*/node_modules/*'

# 클라이언트 컴포넌트 'use client' 분포
grep -rn "^'use client'" --include='*.tsx' --include='*.jsx' .

# 데이터 페칭 위치 (서버컴포넌트 vs 클라이언트)
grep -rn "supabase\|fetch(" --include='*.tsx' --include='*.ts' src/ app/
```
산출: 모든 URL 경로 + 어떤 컴포넌트가 그리는지 + 어떤 데이터를 부르는지 트리.

### 29.2 백엔드 / API / RPC 인벤토리
```bash
# API 엔드포인트
find . -path '*/api/**' \( -name 'route.ts' -o -name 'route.js' \)
# 환경변수 사용처 (시크릿 노출 사전 점검)
grep -rn "process.env\." --include='*.ts' --include='*.tsx' --include='*.js'

# Supabase Edge Functions
find supabase/functions -type d -mindepth 1 -maxdepth 2
```
SQL (Supabase SQL Editor 또는 psql):
```sql
-- 모든 RPC / 함수
SELECT n.nspname AS schema, p.proname AS name,
       pg_get_function_arguments(p.oid) AS args,
       pg_get_function_result(p.oid)    AS returns
FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname IN ('public','extensions','auth','storage')
ORDER BY 1,2;

-- 모든 트리거
SELECT event_object_table, trigger_name, event_manipulation, action_statement
FROM information_schema.triggers
WHERE trigger_schema='public' ORDER BY 1,2;

-- 모든 RLS 정책
SELECT schemaname, tablename, policyname, permissive, cmd, qual, with_check
FROM pg_policies ORDER BY 1,2,3;

-- pg_cron 작업
SELECT jobid, schedule, command, nodename, jobname, active FROM cron.job;
```

### 29.3 DB 스키마 전수
```sql
-- 테이블 + 컬럼 + 타입 + NULL 허용
SELECT table_name, column_name, data_type, is_nullable, column_default
FROM information_schema.columns
WHERE table_schema='public' ORDER BY 1, ordinal_position;

-- 모든 인덱스
SELECT tablename, indexname, indexdef FROM pg_indexes
WHERE schemaname='public' ORDER BY 1,2;

-- 모든 제약 (CHECK, FK, UNIQUE)
SELECT table_name, constraint_name, constraint_type
FROM information_schema.table_constraints
WHERE table_schema='public' ORDER BY 1,3,2;

-- 뷰 + 머티리얼라이즈드뷰
SELECT table_name, view_definition FROM information_schema.views WHERE table_schema='public';
SELECT matviewname, definition FROM pg_matviews WHERE schemaname='public';

-- 익스텐션
SELECT extname, extversion FROM pg_extension ORDER BY 1;

-- 시퀀스
SELECT sequence_name, last_value FROM information_schema.sequences
WHERE sequence_schema='public';

-- 데이터 분포 — 핵심 테이블
SELECT source_site, status, COUNT(*) cnt FROM listings GROUP BY 1,2 ORDER BY 1,2;
SELECT source, COUNT(*) FROM listing_images GROUP BY 1;
```

### 29.4 외부 통합 + 시크릿
- 카카오맵 API key, 국토부 API key, Supabase URL/keys, onhouse 세션 쿠키,
  gongsilclub 인증, OpenAI/Anthropic/Groq 키, GitHub Actions secrets,
  Vercel env, 도메인 / DNS / Cloudflare 계정
- 모든 시크릿은 `docs/AUDIT/SECRETS_MAP.md` 에 "어디서 사용 / 만료일 /
  로테이션 절차" 만 기록 (값은 절대 기록 금지)
- 누가 갱신 권한 있는지 명시

### 29.5 크롤러 / 워커 / 스케줄
- onhouse_crawler / wishes_crawler / wishes_core 의 모든 .bat / .sh / 자동
  스크립트
- pg_cron 잡 + cron.bat 무한 루프 + GitHub Actions schedule
- 각 잡의 "마지막 실행 / 평균 소요 / 영향받는 테이블" 기록

### 29.6 git 히스토리 — 필터 관련
```bash
# 'filter', 'listings', 'search' 가 들어간 모든 커밋
git log --all --oneline --grep -E -i "filter|listings|search|map|category|deal_type|listing_type"
# 최근 6 개월 변경 빈도 높은 파일 (위험/중요 후보)
git log --since="6 months ago" --pretty=format: --name-only \
  | sort | uniq -c | sort -rn | head -50
```

## 30. 필터 동작 베이스라인 스냅샷 (Behavior Freeze)

> 변경 전후 비교의 절대 기준. 회귀 0 의 정의가 여기서 나온다.

1. /map 의 4 카테고리 × 모든 필터 조합을 스크립트로 호출 (Playwright 또는
   API 직접) → 응답을 JSON 으로 저장 (`docs/AUDIT/snapshot_YYYYMMDD/`).
2. 매물 ID 집합 + 결과 카운트 + 응답 시간 기록.
3. 추가로: 비로그인 / 로그인 / 모바일 UA / 데스크탑 UA 4 가지 컨텍스트.
4. 매물 상세 페이지 N=50 무작위 추출 → HTML/스크린샷 보존.
5. 어떤 변경도 이 스냅샷 대비 의도된 차이만 발생해야 함.

```bash
# 스크립트 예시 (의사코드)
node scripts/snapshot_filters.mjs \
  --base https://wishes.co.kr \
  --out docs/AUDIT/snapshot_$(date +%Y%m%d) \
  --matrix configs/filter_matrix.json
```

## 31. 광고 노출 / 게시 정책 매핑

- listings 의 `status` 모든 고유값과 빈도
- `is_published` / `is_advertised` / `expose_to_public` 등 게시 토글 컬럼
  존재 여부
- 중개사 ↔ 매물 ownership 모델 (broker_id, agency_id 컬럼)
- 광고 만료 / 갱신 정책 (DB 컬럼 + cron + 알림)
- 차단 / 신고 / 모더레이션 흐름 (테이블 + admin 페이지)
- /search (중개사) 가 토글하면 /map (고객) 에 어떤 경로로 반영되는지
  단계별 추적

산출: `docs/AUDIT/02_VISIBILITY_PIPELINE.md` (시각화 다이어그램 포함)

## 32. 사용자 흐름 / 퍼널 매핑

- 랜딩 → /map → 필터 → 상세 → 문의/저장 → 거래 까지 단계별 페이지/이벤트
- 각 단계에서 호출되는 API / DB 테이블
- 현재 측정되는 이벤트(있다면) 와 측정되지 않는 이벤트
- 베이스라인 전환율 (있다면 추출, 없으면 측정 인프라 도입 후 0 부터)

## 33. 의존성 / 위험 매핑

- 외부 API: 카카오맵 / 국토부 / 행안부 / onhouse / gongsilclub
- SLA 추정 + 다운 시 fallback 시나리오
- 라이브러리 의존성 트리 (`pnpm why`, `npm ls`, `pip list`)
- EOL 임박 / 보안 권고 있는 의존성 색출
- "이 라이브러리가 죽으면?" 시나리오 매핑

> **Discovery 산출물 5 개를 받기 전엔, 이후 PART 작업 1 줄도 시작하지 않는다.**

---

# PART IV — 비파괴 작업 원칙 (Do No Harm)

## 34. 비파괴 변경 프로토콜 (모든 작업 공통)

모든 변경은 다음 7 단계를 강제한다. 단계 건너뛰기 = 즉시 revert.

1. **Read-only 분석 보고** — Discovery 결과 인용, 변경 대상 식별
2. **변경 명세 (RFC)** — `docs/RFC/NNNN-title.md` 에 의도/영향/롤백
3. **격리 브랜치 + Preview 환경** — Vercel Preview + Supabase Branch
4. **회귀 테스트 0 회귀** — Section 30 스냅샷 대비 차이 = 의도분만
5. **카나리 1% 롤아웃** — Feature flag 로 제한 노출, 24h 메트릭 관찰
6. **점진 100%** — 1% → 10% → 50% → 100%, 각 단계 메트릭 OK 확인
7. **Cool-down 24h** — 이상 지표 없으면 cleanup, 있으면 즉시 revert

## 35. 안전 마이그레이션 (Schema Evolution)

- **expand-contract 강제**: 컬럼 drop 즉시 금지. 추가 → N 일 dual-write →
  read-switch → drop.
- **NOT NULL 추가는 backfill 후**: NULL 잔존 시 마이그레이션 실패시키는
  방어로직.
- **인덱스 변경은 CONCURRENTLY**: 운영 락 금지.
- **모든 migration 파일에 rollback 동봉** (또는 자동 reversibility 검증).
- **데이터 손실 가능 변경**: PR 본문에 명시 + 사용자 명시 승인.
- **migration 도구**: Supabase CLI + 타임스탬프 prefix, 머지 전 `supabase db diff` 검토.

## 36. 코드 보존 규칙 (절대 삭제 금지 사례)

- **사용 여부 불확실한 코드** — 우선 `@deprecated` JSDoc + 런타임 워닝 →
  N 일 모니터링 → 호출 0 확인 후 삭제.
- **legacy crawler / wishes_core 동작** — 인수인계 문서에 명시된 모든 동작은
  보존이 기본. 변경하려면 RFC + 사용자 승인.
- **크롤러 라운드 진행 중 변경 금지** — 안전 윈도우(라운드 종료 ~ 30분 대기 사이)
  에만 배포. 자동 가드 스크립트로 강제.
- **prod 데이터 삭제** — soft-delete (`deleted_at`) 만 허용. 실제 row 삭제는
  사용자 명시 승인 + 백업 검증 후만.

## 37. 회귀 검증 게이트 (PR 머지 자동 차단)

PR 이 다음 6 개 게이트를 모두 통과해야만 머지 가능. CI 강제.

1. **Filter Regression**: 4 카테고리 × N 필터 × M 조건 매트릭스, diff = 의도분
2. **Behavior Snapshot Diff**: Section 30 스냅샷 대비 unexpected diff = 0
3. **Visual Regression**: Playwright trace + 픽셀 비교 통과
4. **Type Check**: `tsc --noEmit` 성공
5. **Unit + Integration**: Vitest 100% 통과
6. **Security**: OSV-Scanner / npm audit critical 0

bypass 권한 없음. 긴급 hotfix 도 동일 게이트 통과 필요.

---

# PART V — 비용 규율 (Cost Discipline)

## 38. 월 비용 캡 + 자동 점검

- **월 캡**: 사용자 명시 (잠정 $30/mo). 초과 자동 알림.
- **매월 1 일 점검**: 직전 월 사용량 / 한도 임박 / 새 비용 발생 보고
- **관측 무료 도구**: Cloudflare Analytics, Supabase 사용량, OpenAI/Anthropic
  대시보드 자동 스크랩 → Discord/Slack 알림
- **신규 SaaS 도입 결정**: 6 개월 TCO 표 (자가호스트 시간비용 포함) 비교 후만

## 39. Self-host vs SaaS 결정 매트릭스

| 조건 | 결정 |
|------|------|
| 무료 한도 ≥ 예상 사용량 1.5× | Free SaaS 사용 |
| Self-host 가능 + 운영 부담 < 월 1h | Self-host (Hetzner/Oracle Free) |
| 무료 초과 + Self-host 비현실 + 월 < $20 | 소액 유료 (사용자 승인) |
| 위 어느 것도 안 됨 | 기능 보류, RFC 재논의 |

> 어떤 결정이든 `docs/DECISIONS/NNNN-title.md` 에 ADR(Architecture
> Decision Record) 로 남긴다. 6 개월 뒤 자동 재검토.

---

# PART VI — 한국 부동산 / 개인정보 컴플라이언스

## 40. 공인중개사법 + 부동산 광고 표시 의무

- **표시 의무 정보**: 중개사무소 명칭, 등록번호, 소재지, 대표자, 연락처,
  거래종류, 가격, 면적, 소재지, 매물 종류 등 (공인중개사법 시행령 별표).
- **허위·과장 광고 금지**: 시장가 대비 비정상 가격 / 존재하지 않는 매물 /
  거래완료 매물의 미삭제 노출 = 처벌 대상.
- **인터넷 광고 모니터링**: 부동산광고시장감시센터 가이드 준수.
- **자동 검증**: 신규 등록 시 표시 필수 항목 미입력 → 노출 차단 + 알림.
- **거래완료 즉시 비공개**: 사용자 신고 + 자동 모니터링.

## 41. 개인정보보호법 (PIPA)

- **수집 동의**: 회원가입/문의 폼에 개별 항목 동의, 선택/필수 분리
- **개인정보 처리방침** 페이지 의무 (변경 시 공지)
- **보관 기간**: 회원 탈퇴 시 즉시 / 법정 보관 외 폐기
- **제 3 자 제공**: 중개사에게 고객 연락처 전달 시 별도 동의 필요
- **개인정보 영향평가** (대규모 시): 가이드라인 준수
- **로그 익명화**: 검색 / 클릭 로그는 user_id hash 또는 익명 ID 기반
- **삭제권 / 열람권**: 사용자 셀프 서비스 페이지 제공

## 42. 부동산 거래신고법 / 임대차보호법

- **실거래 신고 의무**는 중개사 책임이지만, WISHES 가 자동화 보조 가능 (서식 사전 채움)
- **임대차 신고제** (전월세 신고제) 대응: 거래 완료 매물에 신고 안내
- **표준임대차계약서** 다운로드 / 전자 작성 보조

---

# PART VII — 운영 / DR / 인시던트

## 43. 백업 / 재해복구 (DR)

- **DB 백업**: 매일 `pg_dump` → Cloudflare R2 (10GB 무료) + 7 일 보관
- **WAL 스트리밍**: wal-g + R2 (시간당 1 회) — RPO 1 시간
- **이미지/파일**: Supabase Storage → R2 동기화 (rclone 야간)
- **복구 RTO 목표**: 4 시간 내 새 Supabase 프로젝트로 부트스트랩
- **분기 1 회 복구 훈련**: 실제로 백업에서 복구 → 검증 → 보고

## 44. 인시던트 대응 (Incident Response)

심각도 정의:
- **SEV1**: /map 전체 다운, 매물 노출 0 — 즉시 대응
- **SEV2**: 한 카테고리/지역 결과 비정상, 결제 일부 실패 — 1h 내 대응
- **SEV3**: 일부 필터 정확도 하락, latency 증가 — 24h 내
- **SEV4**: 사소한 UX 버그 — sprint 큐

대응 절차:
1. 자동 감지 (SLO 위반 알림) 또는 사용자 신고
2. Status Page 즉시 업데이트 (Uptime Kuma + RSS)
3. War Room (Slack 전용 채널)
4. Post-mortem 24h 내 작성 (`docs/POSTMORTEM/YYYYMMDD-title.md`)
5. Blameless: 시스템 결함 명세 + 재발방지 액션

## 45. 중개사 / 고객 지원

- **1차 셀프 서비스**: FAQ + LLM 기반 챗봇 (Groq + 사내 RAG)
- **2차 사람 검토 큐**: 챗봇 confidence 낮으면 자동 전송
- **응답 SLA**: 영업시간 내 1 시간, 외 12 시간
- **VOC 누적**: 모든 문의를 카테고리화 (LLM) → 매주 우선순위 백로그 반영

---

# PART VIII — SEO / 성장 / 분석

## 46. SEO + 구조화 데이터 (네이버 / 구글 / 다음 동시 최적화)

- **schema.org/RealEstateListing** + `Place` + `GeoCoordinates` JSON-LD 모든 매물 페이지
- **sitemap**: 매물별 동적 sitemap.xml + sitemap index (50K limit 분할)
- **robots.txt**: 개인정보 페이지 disallow, 매물 / 카테고리 allow
- **canonical URL**: 동일 매물 중복 URL 방지
- **OpenGraph + Twitter Card**: SNS 공유 시 매물 사진 + 가격 카드
- **네이버 검색**: 네이버 서치어드바이저 등록 + 사이트맵 제출 + RSS
- **구글 Search Console**: 등록 + Core Web Vitals 모니터링
- **다음 검색**: 다음 검색 등록 (한국 시장 보조)
- **Local SEO**: 지역별 랜딩 페이지 (강남구 매물 / 서초구 매물 ...)

## 47. PWA / 모바일 / 푸시

- **PWA**: manifest.json + Service Worker + 오프라인 폴백
- **Web Push**: 표준 Web Push API (FCM 거치지 않고 자체 VAPID)
- **알림 구독**: "강남 3억 이하 신축 나오면 알림" — 사용자 저장 검색 + 매칭 워커
- **모바일 UX**: bottom sheet 필터, swipe 매물 카드, 지도-목록 토글
- **App-like**: 홈 화면 추가 유도, 풀스크린 모드

## 48. 분석 / 퍼널 / A/B

- **이벤트 트래킹**: PostHog Free Cloud (1M 이벤트/mo) 또는 Plausible self-host
- **퍼널**: 랜딩 → /map → 필터 적용 → 상세 → 문의/저장 / 거래
- **검색어 분석**: 사용자 입력 자연어 / 필터 조합 → LLM 카테고리화
- **A/B 테스트**: GrowthBook self-host + Bayesian 분석
- **Cohort**: 신규/재방문/지역별 retention

---

# PART IX — 실행 규율 / Definition of Done

## 49. PR / 코드리뷰 / 커밋 규약

- **Conventional Commits**: `feat:`, `fix:`, `chore:`, `refactor:`, `test:`,
  `docs:`, `perf:`, `BREAKING CHANGE:` 의무
- **PR 템플릿** (자동 적용):
  - 의도(Why)
  - 변경(What) — 파일/줄 수준
  - 영향 범위(Where)
  - 회귀 테스트 결과 (수치)
  - 롤백 절차
  - Discovery 참조 (Section 29~33 어떤 항목 영향)
- **리뷰**: 1 사람 이상 + 1 LLM 자동 리뷰 (Claude Code/Cursor)
- **자동 라벨**: 변경 파일 패턴 → label (filter / crawler / db / ui)
- **변경 파일 수 캡**: 한 PR ≤ 500 줄 권장 (초과 시 분리)

## 50. Definition of Done (모든 작업)

PR 머지 + prod 반영까지 다음이 모두 갖춰져야 "완료" 라고 부른다:

- [ ] Discovery 참조 — 어떤 자산을 건드렸는지 명시
- [ ] RFC / 변경 명세 작성 (≥ 100 LOC 변경 시)
- [ ] 단위 + 통합 테스트 추가/수정
- [ ] 회귀 테스트 0 회귀 (Section 37 게이트 6 종 모두 통과)
- [ ] 모니터링 — 새 메트릭 / 알림 정의
- [ ] 문서 — README / docs / 운영 런북 업데이트
- [ ] 비용 영향 명시 (월 ₩/달러)
- [ ] 롤백 절차 검증 — 실제로 되는지 preview 에서 확인
- [ ] 카나리 1% → 점진 100%
- [ ] Cool-down 24h 메트릭 OK
- [ ] 사용자에게 정량 보고 (전/후 메트릭)

## 51. 운영 런북 (Runbook) — 사전 정의

`docs/RUNBOOK/` 에 다음 시나리오별 즉시 실행 가능 절차 보유:

- **R-01 크롤러 정지** — 로그 확인 / 세션 재발급 / 수동 트리거
- **R-02 DB 다운 또는 응답 지연** — Supabase 상태 / read replica fallback / cache 가동
- **R-03 카카오/네이버 지도 API 한도 초과** — Leaflet+OSM fallback 자동 전환
- **R-04 LLM 비용 급증** — provider 자동 fallback (Anthropic → Groq → Gemini → Ollama)
- **R-05 광고 노출 정책 변경** — feature flag 토글 절차
- **R-06 허위 매물 신고 폭증** — 검토 큐 자동 우선순위 + 사람 투입
- **R-07 데이터 유실 의심** — 백업 복구 절차 + 영향 범위 산출
- **R-08 인증 시스템 장애** — Supabase Auth 우회 read-only 모드
- **R-09 보안 사고 (시크릿 유출)** — 즉시 키 회전 절차 + 감사 로그
- **R-10 트래픽 급증 (DDoS / 정상 폭증)** — Cloudflare 모드 전환

각 런북에 **마지막 검증일** 기록 — 6 개월 미검증 시 재훈련 의무.

---

# PART X — 안티패턴 + 최종 결정

## 52. 절대 안티패턴 카탈로그 (PR 거부 사유)

1. **"고친 것 같다"** — Section 37 게이트 6 종 0 회귀 증거 없으면 안 고친 것
2. **"기존 코드 정리 + 신규 기능 같이"** — 분리해서 PR. 한 PR 한 의도.
3. **"테스트는 다음 PR 에"** — 테스트 없으면 머지 X
4. **"이 SaaS 가 편하니까"** — Section 39 매트릭스 통과 없이 도입 X
5. **"기존 동작은 그냥 그렇겠지"** — Discovery (PART III) 없이 코드 수정 X
6. **"우선 지우고 새로"** — Section 36 위반. soft-deprecate 후 검증.
7. **"prod 데이터 직접 수정"** — migration 없이 SQL 직타 X
8. **"임시로 시크릿을 코드에"** — 1 분도 허용 X. 즉시 키 회전.
9. **"한국어/영어 혼용 그냥 두지"** — UI 카피는 마케팅 톤 가이드 따름
10. **"그 라이브러리 1.x 도 잘 됐는데 굳이"** — 보안 패치 EOL 의존성 6개월 내 업그레이드 의무
11. **"한 번 배포하면 끝"** — Cool-down 24h 메트릭 안 본 변경은 미완성
12. **"버그 리포트 없이 추정"** — 재현 절차 없는 수정 X
13. **"이번 라운드만 빨리"** — 크롤러 진행 중 배포 금지 (Section 36)
14. **"성능은 나중에"** — p95 SLO 미충족 PR 머지 X
15. **"문서는 코드 보면 알지"** — 외부 인터페이스 / 운영 절차 문서 없으면 미완성

## 53. 최종 작동 원칙 (모든 PR 의 한 줄 자기검증)

> **Discovery 없이는 코드 한 줄 안 고친다.**
> **회귀 0 이 아니면 머지 안 한다.**
> **무료/OSS 가 가능한데 유료 안 쓴다.**
> **만든 것은 부수지 않고 더 정교하게 만든다.**
> **이 넷이 한 PR 에 모두 있어야 비로소 머지.**

이 네 줄을 PR template 첫 머리에 박아둔다. 매 PR 작성 시 작성자가
직접 체크박스로 확인.

---

# 부록 A — 이 프롬프트를 다음 세션에 그대로 붙여넣기 위한 요약 (Drop-in)

다음 세션 첫 메시지에 그대로 사용 가능:

> WISHES 필터 / 사이트 작업 v3 마스터 프롬프트(이 파일) 를 따른다.
> 무료/OSS 우선, 비파괴 변경, Discovery (PART III) 선행 의무, 회귀 0 게이트
> (PART IV §37) 통과 의무. 어떤 변경도 PR Template (PART IX §49) +
> Definition of Done (§50) + 53 안티패턴 (§52) 자기검증 통과 후만 진행.
> Phase 0 (측정 인프라) 부터 시작. 추측·확장·삭제 모두 금지.

---

# 부록 B — Discovery 산출물 디렉토리 구조 (의무)

```
docs/
├── AUDIT/
│   ├── 00_ASSET_INVENTORY.md
│   ├── 01_DB_SCHEMA.md
│   ├── 02_VISIBILITY_PIPELINE.md
│   ├── 03_USER_FUNNEL.md
│   ├── 04_DEPENDENCIES.md
│   ├── SECRETS_MAP.md           # 값 없이 위치/소유자만
│   └── snapshot_YYYYMMDD/        # 베이스라인 응답 JSON
├── RFC/
│   └── NNNN-title.md             # 변경 명세
├── DECISIONS/
│   └── NNNN-title.md             # ADR
├── RUNBOOK/
│   └── R-NN-title.md             # 사전 정의 운영 절차
├── POSTMORTEM/
│   └── YYYYMMDD-title.md
└── FILTER_SPEC.md                # PART I §3 필터 명세서
```

---

# 부록 C — 즉시 실행 가능한 첫 30 분 명령 (Phase 0 Kickoff)

코드베이스 mount 직후 사용자 보고 전에 자동 수집 (Read-only):

```bash
# 1. 라우트 / 페이지
find . -path '*/app/**/page.{tsx,jsx,ts,js,mdx}' -not -path '*/node_modules/*' \
  > docs/AUDIT/_routes.txt

# 2. API 엔드포인트
find . -path '*/api/**' \( -name 'route.ts' -o -name 'route.js' \) \
  > docs/AUDIT/_api.txt

# 3. 환경변수 사용처
grep -rn "process.env\." --include='*.ts' --include='*.tsx' --include='*.js' . \
  > docs/AUDIT/_env_usage.txt

# 4. 의존성
cat package.json > docs/AUDIT/_deps.json
pnpm why supabase || npm ls > docs/AUDIT/_deps_tree.txt

# 5. 최근 변경 빈번 파일
git log --since="6 months ago" --pretty=format: --name-only \
  | sort | uniq -c | sort -rn | head -50 > docs/AUDIT/_hotspots.txt
```

```sql
-- 6. DB 스키마 dump (Supabase SQL Editor)
\copy (SELECT table_name, column_name, data_type, is_nullable, column_default
       FROM information_schema.columns WHERE table_schema='public'
       ORDER BY 1, ordinal_position) TO '/tmp/schema.csv' CSV HEADER;
-- 또는 supabase db dump --schema public > docs/AUDIT/01_DB_SCHEMA.sql
```

산출물 5 개를 사용자에게 보고 → 사용자 OK → 비로소 Phase 1 진입.

---

---
---

# PART XI — UI 불변 헌법 + 네이버/구글 SEO 최우선 + 무회귀 5층 방어 (v4)

> 이 PART 는 사용자가 명시한 세 가지 절대 조건을 헌법화한다.
> (1) UI 기본틀 절대 불변, (2) 네이버/구글 노출 최우선, (3) 0 회귀까지 무한 반복.
> 셋 모두 자동 게이트로 강제 — 사람의 의지에 의존하지 않는다.

## 54. UI 불변성 헌법 (UI Invariance Constitution)

**대원칙**: WISHES 의 현재 UI 기본틀은 **자산이자 헌법**이다. 어떤 작업도
사용자의 명시적 승인 없이 UI 기본틀을 변경하지 않는다. 위반 PR 은 무조건
revert. 예외 없음.

### 54.1 "UI 기본틀" 의 정의 (변경 금지 대상)
다음은 모두 UI 기본틀이며 명시 승인 없이 변경 시 자동 거부:

- **레이아웃 구조**: header / nav / sidebar / footer / main 의 위치·비율·반응형 동작
- **컴포넌트 트리**: 각 페이지의 React 컴포넌트 계층
  (예: `<Layout><MapShell><FilterPanel/><MapCanvas/></MapShell></Layout>`)
- **HTML 시맨틱**: `<section>` / `<article>` / `<nav>` / heading 위계 (h1~h6)
- **CSS 디자인 토큰**: Tailwind 색상 / spacing / radius / shadow / typography
- **컴포넌트 인터페이스**: 공개 props 이름·타입·기본값
- **인터랙션 패턴**: hover / active / focus / 클릭 / 드래그 / 스와이프 / 단축키
- **반응형 breakpoint**: sm / md / lg / xl 기준점과 각 layout
- **모달 / 드로어 / 팝오버 / 토스트** 의 위치·등장 패턴
- **애니메이션**: duration / easing / 트리거 조건 / motion-reduce 처리
- **z-index 위계**

### 54.2 UI 불변과 무관 — 자유롭게 개선 가능
- 컴포넌트 **내부 로직** (data fetch, memo, 캐시, 가상화)
- **데이터 소스** (어떤 API / 어떤 SQL — 결과만 같으면 OK)
- **상태로 표현되는 데이터 자체** (필터 결과 매물 목록의 "내용")
- **메타 태그 / `<head>` 내부** (SEO 향상, 시각 비가시)
- **JSON-LD 스크립트** (구조화 데이터, 시각 비가시)
- **OTel / 분석 SDK 주입** (사용자 비가시)
- **새 라우트 추가** (기존 페이지 트리 보존하는 별도 경로 OK)
- **접근성 속성 추가** (`aria-*`, `role`, `alt` — 시각 변화 없음)
- **성능 최적화** (LCP/INP/CLS 개선은 항상 환영)

### 54.3 UI 변경이 정말 필요할 때의 절차
1. **UI Change RFC** — 현재 스크린샷 + 제안 스크린샷 + 영향 범위
2. **사용자 명시 승인** (PR 코멘트에 "승인" 또는 별도 채널)
3. UI/UX 사전 리뷰 (WCAG 2.1 AA + 모바일 사용성)
4. Visual Regression baseline 갱신 (전후 diff 첨부)
5. 단계 롤아웃 (1% → 10% → 50% → 100%) + 24h cool-down

### 54.4 자동 강제 — UI Guard CI 게이트
모든 PR 에 다음 자동 검증을 게이트로 강제. 통과 못 하면 머지 자동 차단:

- **DOM Snapshot Diff**: Vitest snapshot — 핵심 페이지(/, /map, /listing/[id],
  /region/[gu]) 의 렌더된 HTML 트리 구조 → 변경 시 diff 0 또는 명시 승인
- **Visual Regression**: Playwright + Argos Free / 자체 pixelmatch — 데스크탑
  (1440x900) + 모바일 (390x844) + 태블릿 (768x1024) 3 viewport 스크린샷
- **CSS Token Lock**: `tailwind.config.{ts,js}` / theme tokens 변경 시 RFC 라벨 강제
- **Component API Lock**: `api-extractor` 로 공개 컴포넌트 props 의 .d.ts
  capture → breaking change 자동 감지

```yaml
# .github/workflows/ui-guard.yml
- name: DOM Snapshot
  run: pnpm test -- --run dom-snapshot
- name: Visual Regression
  run: pnpm exec playwright test --grep visual && pnpm argos upload
- name: CSS Token Lock
  run: pnpm exec ts-node scripts/check-tokens.ts
- name: Component API Extractor
  run: pnpm exec api-extractor run --local
```

### 54.5 UI 불변 위반 정의 (즉시 PR 거부)
- DOM 트리 변경 (요소 추가 / 제거 / 순서 / 래퍼 변경)
- Tailwind 클래스의 의미 변경 (색상 / spacing 토큰 변경)
- props **추가 + default** 는 OK / **제거 / 타입 변경** 불가
- 컴포넌트 위치 이동 (다른 페이지·다른 위치) 불가
- 폰트 / 색상 팔레트 변경 불가
- breakpoint 값 변경 불가

---

## 55. "콘텐츠 변경" vs "구조 변경" 명확한 경계 표

| 변경 종류 | 예시 | 판정 |
|---------|------|------|
| 매물 가격 표기 형식 | "5,000만원" → "5천만원" | UI(시각) 변경 → RFC |
| 매물 가격 데이터 자체 | 5000 → 5500 | 데이터 변경 → OK |
| 필터 결과 정렬 기본값 | "최신순" → "추천순" | 동작 변경 → A/B + RFC |
| 필터 결과 정확도 | 누락 매물 노출 | 동작 보강 → OK (게이트 통과만) |
| 새 SEO 메타 추가 | `<meta property="og:...">` | 비가시 → OK |
| JSON-LD 추가 | RealEstateListing | 비가시 → OK |
| LCP 개선 | 4s → 1.5s | 사용자 체감↑ → OK |
| CLS 감소 | 0.3 → 0.05 | 안정성↑ → OK |
| 클래스 추가 (시각 동일) | 접근성 `aria-*` | 비가시 → OK |
| 색상 진하기 변경 | `text-gray-700` → `text-gray-800` | 시각 변경 → RFC |
| 컴포넌트 wrapper 추가 | `<div>` → `<div><div>...` | 구조 변경 → 거부 |

회색지대는 무조건 RFC 큐로 보낸다. 추측 금지.

---

## 56. 네이버 SEO — 최우선순위 (Korean Search #1)

> **WISHES 의 SEO 우선순위**: 네이버 ≫ 구글 > 다음 > Bing.
> 한국 부동산 검색의 70%+ 가 네이버에서 발생. 네이버 로직에 맞춘 구조를
> 최우선 구축하고, 동일 데이터로 구글·다음·Bing 동시 충족.

### 56.1 네이버 서치어드바이저 — 즉시 의무
- https://searchadvisor.naver.com 등록 + HTML 메타 인증
- **사이트맵 제출** (XML, 50K 매물 단위 분할)
- **RSS 피드 제출** — 신규 매물 자동 갱신 (네이버는 RSS 매우 잘 인식)
- **수집 robots.txt** 제출
- 매주 색인 현황 자동 스크랩 + Discord/Slack 알림

### 56.2 네이버가 좋아하는 페이지 구조
- **모바일 우선** — 네이버 검색 트래픽 80%+ 모바일
- **본문 텍스트 풍부** — 매물 상세에 자연어 설명 (LLM 자동 생성, UI 는
  접힘 가능 — 단 콘텐츠는 DOM 에 노출되어야 인덱싱)
- **제목 35 자 / 설명 80 자 룰** — 네이버 검색결과 표시 한계
- **이미지 alt + 캡션** — 네이버 이미지 검색 영향 큼
- **본문 키워드 자연 분포** — 지역명 + 매물유형 + 거래유형 조합
- **신규 콘텐츠 발행 빈도** — 신규 매물 = 콘텐츠 발행 → RSS 갱신
- **외부 백링크** — 자체 네이버 블로그 / 카페 운영 검토

### 56.3 네이버 부동산 / 네이버 플레이스 연동
- **네이버 부동산** — 제휴 가능 시 매물 노출 채널 추가
- **네이버 플레이스** — 중개사무소별 등록 (각 중개사 협조)
- **네이버 톡톡** — 매물 문의 채널 (카카오톡 채널 동시)

### 56.4 네이버 모바일 친화 체크
- viewport meta + 100% 반응형
- 터치 타겟 ≥ 44px
- 본문 폰트 ≥ 14px
- 풀페이지 인터스티셜 광고 금지 (네이버 + 구글 모두 페널티)

### 56.5 네이버 알고리즘 대응 (C-Rank + DIA)
- **C-Rank** — 도메인 신뢰도. 일관된 주제(부동산) + 꾸준한 발행
  → 시간이 갈수록 권위 ↑
- **DIA (Deep Intent Analysis)** — 문서 품질. 중복 회피 + 본문 풍부 +
  체류시간

### 56.6 IndexNow — 네이버 일부 + Bing 즉시 인덱싱
- 매물 INSERT/UPDATE → 큐 → IndexNow ping
- 자동 워커 (pg_cron + edge function 또는 Supabase Realtime trigger)

---

## 57. 구글 SEO — 2 순위

### 57.1 Google Search Console — 의무 등록
- 사이트 등록 + 인증 + sitemap 제출
- Core Web Vitals 모니터링
- 모바일 사용성 / Indexing / 보안 이슈 알림 자동 수집

### 57.2 Core Web Vitals SLO (구글 랭킹 직접 영향)
- **LCP** < 2.5s (75 percentile)
- **INP** < 200ms (FID 대체, 2024 부터)
- **CLS** < 0.1
- **TTFB** < 800ms
- 위반 시 자동 PR 차단

### 57.3 EEAT (Experience / Expertise / Authority / Trust)
- **저자 표시** — 매물 게시 중개사 이름·등록번호·연락처 명시
- **About 페이지** — 회사 / 운영진 / 수상·언론
- **연락처** — 전화 + 주소 + 사업자번호
- **HTTPS / HSTS** — 보안
- **개인정보처리방침 / 이용약관**

### 57.4 Helpful Content 방어
- 자동 생성 텍스트라도 사실 기반 + 사용자 가치
- 저품질 동적 검색결과 페이지 → `noindex`
- 중복 콘텐츠 → `canonical` 통일

---

## 58. 다음 / 카카오 / Bing / AI 검색

- **다음 검색** — 다음 검색 등록 가이드 준수
- **Bing Webmaster** + IndexNow 자동 인덱싱
- **DuckDuckGo / Yandex** — Bing 인덱스 활용 (자동)
- **ChatGPT / Bing AI / Perplexity / Claude 검색** 인덱싱 — schema.org JSON-LD
  풍부할수록 우선

---

## 59. Core Web Vitals + 성능 SLO (페이지 단위)

| 페이지 | LCP | INP | CLS | TTFB |
|--------|-----|-----|-----|------|
| / (랜딩) | <1.8s | <100ms | <0.05 | <500ms |
| /map | <2.5s | <200ms | <0.1 | <800ms |
| /listing/[id] | <2.0s | <100ms | <0.05 | <600ms |
| /region/[gu] | <2.0s | <150ms | <0.05 | <700ms |

측정: **RUM (web-vitals 패키지)** → PostHog Free / 자체 + 합성 (Lighthouse CI).
위반 시 자동 알림 + 회귀 PR 자동 차단.

---

## 60. 구조화 데이터 / 메타 자동화 (UI 비가시이므로 자유)

### 60.1 매물 상세 — RealEstateListing JSON-LD
```json
{
  "@context": "https://schema.org",
  "@type": "RealEstateListing",
  "name": "강남구 역삼동 아파트 매매",
  "description": "...",
  "url": "https://wishes.co.kr/listing/...",
  "datePosted": "2026-04-29",
  "image": ["..."],
  "address": {
    "@type": "PostalAddress",
    "addressLocality": "강남구",
    "addressRegion": "서울특별시",
    "addressCountry": "KR"
  },
  "geo": {"@type":"GeoCoordinates","latitude":"...","longitude":"..."},
  "offers": {"@type":"Offer","price":"500000000","priceCurrency":"KRW"},
  "floorSize": {"@type":"QuantitativeValue","value":"84","unitCode":"MTK"},
  "numberOfRooms": "3"
}
```

### 60.2 다른 schema 타입
- 모든 페이지: **BreadcrumbList**
- 중개사무소: **Organization** + **RealEstateAgent**
- 지역 페이지: **Place**
- FAQ 섹션: **FAQPage**
- 후기: **Review** + **AggregateRating**

### 60.3 메타 자동 생성 규칙
- `<title>` ≤ 35 자 한국어 — LLM 자동 + 폴백 규칙
  (예: `"강남구 역삼동 아파트 매매 5억 | WISHES"`)
- `<meta name="description">` ≤ 80 자
- Open Graph + Twitter Card — 매물 사진 자동 1200×630 변환 (Cloudflare Images Free)
- `<meta name="naver-site-verification">` + `google-site-verification`
- `<link rel="canonical">` 강제 — 동적 URL 정규화

---

## 61. sitemap / robots / 인덱싱 컨트롤

### 61.1 sitemap 분할
- `/sitemap.xml` (index)
  - `/sitemap-listings-1.xml` ... `-N` (5만 매물 단위)
  - `/sitemap-regions.xml`
  - `/sitemap-static.xml`
- 매시간 자동 재생성 (pg_cron + edge function)
- `lastmod` 정확 (매물 update 시점)
- `changefreq` 보수적 (`weekly` static, `daily` listings)

### 61.2 robots.txt
- 매물 / 카테고리 / 지역 페이지 allow
- /admin / /api / 동적 검색결과 disallow
- Sitemap 위치 명시
- 크롤 예산 보호 — 무한 파라미터 페이지 차단

### 61.3 IndexNow 자동화
- 매물 INSERT/UPDATE 트리거 → 큐 → IndexNow ping
- 거래완료 → URL `410 Gone` 응답 → 인덱스에서 자동 제거

### 61.4 RSS 피드
- `/rss/listings.xml` — 신규 매물 최근 100 건
- 네이버 서치어드바이저 RSS 등록

### 61.5 noindex / canonical 정책
- 동적 검색결과 (`/map?filter=...`) → `noindex, follow`
- 페이지네이션 → `rel="prev/next"` (구글은 무시하지만 네이버는 사용)
- 정렬/필터 변형 URL → canonical 정규화

---

## 62. 무회귀 5 층 방어 (Best of Best)

### 5 층 방어 모델 — bypass 불가 의무 게이트

```
┌──────────────────────────────────────────────────────────┐
│ Layer 5: 프로덕션 모니터링 + 자동 롤백                    │
│   RUM + Synthetic + Error Tracking + SLO 위반 시 revert  │
├──────────────────────────────────────────────────────────┤
│ Layer 4: 카나리 + Shadow Traffic                          │
│   1% 트래픽 + 100% read-only 비교 (응답 diff)            │
├──────────────────────────────────────────────────────────┤
│ Layer 3: E2E + Visual + DOM Snapshot                      │
│   Playwright + Argos/pixelmatch + DOM tree diff          │
├──────────────────────────────────────────────────────────┤
│ Layer 2: Integration + Contract + Property + Mutation     │
│   Vitest + msw + Pact/OpenAPI + fast-check + Stryker    │
├──────────────────────────────────────────────────────────┤
│ Layer 1: Static + Type + Lint + Pre-commit                │
│   tsc strict + ESLint/Biome + Husky + lint-staged       │
└──────────────────────────────────────────────────────────┘
```

### 62.1 Layer 1 — 정적 분석
- TypeScript strict + `--noUncheckedIndexedAccess`
- ESLint + Biome (type-aware lint)
- Pre-commit (Husky + lint-staged): 변경 파일만 lint + format + tsc + 단위 테스트
- Pre-push: 전체 unit + integration + secret 스캔 (gitleaks)

### 62.2 Layer 2 — 통합 / 계약 / Property / Mutation
- **Vitest** unit + **Vitest + msw** integration
- **Pact** 또는 OpenAPI snapshot — API 계약 파괴 자동 감지
- **fast-check** property-based — 필터 입력 fuzz (random valid + invalid)
- **Stryker** mutation testing — kill rate ≥ 80% 통과
- **Diff coverage** ≥ 90% (변경된 줄 기준)

### 62.3 Layer 3 — E2E + Visual + DOM
- **Playwright** 핵심 user flow: 랜딩 → /map → 필터 적용 → 상세 → 문의
- **Visual Regression**: Argos Free 또는 자체 pixelmatch
- **DOM Snapshot**: `expect(html).toMatchSnapshot()` (Section 54.4)
- 데스크탑 / 모바일 / 태블릿 3 viewport
- Lighthouse CI — Core Web Vitals 회귀 차단

### 62.4 Layer 4 — 카나리 + Shadow Traffic (핵심)
- **Feature Flag (Unleash self-host)** — 1% 사용자만 신규 코드
- **Shadow Traffic** — 신규 코드를 100% 트래픽에 **read-only 모드**로 병렬
  실행 → 응답 diff 자동 비교
  - 쓰기 작업은 차단, 읽기 결과만 비교
  - diff 발생 시 즉시 알림
  - 24h 무이상 시 점진 활성화

### 62.5 Layer 5 — 프로덕션 모니터링 + 자동 롤백
- **SLO**: 정확도 99.9%, p95 < 300ms, 에러율 < 0.1%
- **Error Budget** 소진 시 신규 배포 자동 차단
- **자동 롤백 트리거**: Section 64

---

## 63. 사이드 이펙트 방지 — Best of Best 9 가지 기법

### 63.1 Strangler Fig 패턴 (legacy 점진 교체)
- 기존 로직 옆에 새 로직을 두고 점진 전환
- 동일 입력의 두 결과를 비교 → 일치하면 점진 전환
- 한 번에 갈아엎지 않음 — 사이드 이펙트 차단의 1 원칙

### 63.2 Branch by Abstraction
- 인터페이스로 추출 → 새 구현 추가 → 플래그로 전환 → 검증 후 구 구현 제거
- 기존 사용처는 인터페이스를 통해 그대로 작동

### 63.3 Parallel Run / Shadow
- 두 구현이 같은 입력에 같은 출력을 내는지 N 일 비교
- 차이 발견 즉시 알림 + 분석 (사용자 영향 0)

### 63.4 Test-First for Bug Fix (의무)
- 모든 버그 수정 PR 은 **회귀 테스트 먼저** 추가 (현재 코드에서 fail)
- 수정 → 테스트 pass 확인
- 테스트 없는 수정 PR 자동 거부

### 63.5 Diff Coverage 90% + Mutation 80%
- 변경된 줄 커버리지 ≥ 90%
- mutation kill rate ≥ 80% — 테스트가 결함을 진짜로 잡는지 검증

### 63.6 Bisect on Regression (자동)
- 회귀 발견 시 `git bisect run` 자동 스크립트로 원인 커밋 즉시 식별
- CI 가 직전 N 커밋 binary search 실행

### 63.7 Bug Bash + 회귀 카탈로그
- 분기 1 회 Bug Bash — 1 시간 동안 새 기능을 깨려고 시도
- 발견 버그 → 영구 회귀 테스트 추가 (회귀 카탈로그 누적)
- 한 번 발견된 버그는 두 번 발생하지 않게 봉인

### 63.8 Production Replay
- 실제 사용자 세션 (PII 제거) 녹화 → preview 환경에서 재생
- "어제 강남 검색한 사용자 100 명의 정확한 행동" 새 코드에 재생
- 결과 diff 0 일 때만 배포

### 63.9 Pre-commit / Pre-push / Pre-merge 다층 훅
```
pre-commit (Husky + lint-staged):
  ├─ 변경 파일만 lint + format
  ├─ tsc --noEmit (변경 영향만, 1 초 이내)
  └─ 변경 파일 단위 테스트
pre-push:
  ├─ 전체 unit + integration
  └─ secret 스캔 (gitleaks)
pre-merge (CI 게이트):
  └─ 5 층 방어 전부 + UI Guard + SEO Guard
```

### 63.10 CODEOWNERS 강제
- 필터 / 크롤러 / DB 스키마 / SEO 메타 / UI 토큰 영역별 소유자
- 영역 변경 PR 은 소유자 리뷰 필수

---

## 64. 자동 롤백 트리거 명세

| 트리거 | 조건 | 동작 |
|--------|------|------|
| 5xx 에러율 | 5 분간 > 0.5% | feature flag off + alert |
| p95 latency | 10 분간 > 300ms | flag off + alert |
| LCP/INP/CLS 회귀 | RUM 1h LCP +20% 등 | flag off |
| 매물 노출 카운트 | 5 분간 -30% | 즉시 alert + flag off |
| 필터 정확도 | 시간당 회귀 테스트 < 99.9% | 즉시 revert |
| 신규 에러 종류 | 새 메시지 100 건/h | flag off |
| 사용자 신고 | 1h 내 5 건 이상 | alert + 검토 |
| 검색 노출 (네이버/구글) | 일일 클릭 -30% (검색콘솔) | alert + SEO 회귀 분석 |

각 트리거의 **마지막 검증일** 기록 — 분기 1 회 카오스 테스트로 실제 발동 검증.

---

## 65. SEO 회귀 게이트 (검색 노출 보호)

> UI 회귀 / 데이터 회귀처럼 **SEO 회귀**도 게이트로 차단한다.
> 한 번 떨어진 검색 순위는 회복에 수개월 걸린다 — 떨어뜨리지 않는 게 최선.

### 65.1 SEO 회귀 검사 (PR 게이트)
- **메타 태그 snapshot** — title / description / OG / canonical 변경 의도 확인
- **구조화 데이터 검증** — schema.org Validator + Google Rich Results Test API
- **sitemap 매물 수** -10% 이상이면 알림 + 차단
- **noindex 의도치 않은 추가** 차단 (변경 시 명시 승인)
- **내부 링크 그래프** 변경 추적 (자체 크롤러)
- **robots.txt 변경** 자동 알림

### 65.2 SEO 모니터링 (지속 — 매일)
- **검색 콘솔 스크랩** — Google Search Console + 네이버 서치어드바이저 일일
- **인덱싱 카운트 추이** — 갑작스런 -X% 알림
- **순위 모니터링** — 핵심 키워드 100 개 (예: "강남 아파트 매매", "역삼 원룸",
  "공인중개사 매물") → SerpAPI Free / 자체 cron + Playwright
- **백링크 모니터링** — Ahrefs Webmaster Tools (자기 사이트 무료) + GSC
- **인덱싱 안 된 페이지** 매주 리스트 → 원인 분석

### 65.3 SEO Health Score (페이지별 0~100)
자동 산출 점수:
- 메타 태그 완전성 (title/desc/OG/canonical 유무)
- 구조화 데이터 유효성
- LCP / INP / CLS
- 내부 링크 깊이 (≤ 3 클릭이 이상적)
- 본문 단어 수 (≥ 300 단어)
- alt 텍스트 비율 (이미지 100% 커버)
- 모바일 친화

70 점 미만 페이지 → 자동 보강 큐 (LLM + 규칙)

### 65.4 검색 노출 SLO
- 핵심 키워드 100 개 평균 순위 — 분기 단위 비후퇴
- 인덱싱 비율 — 매물 페이지 95% 이상
- Core Web Vitals 통과율 — 75 percentile 90% 이상
- 위반 시 SEO 회귀 PR 자동 차단

---

## 66. v4 강화된 자기검증 8 줄 (PR 템플릿 첫 머리)

PR 작성자가 매번 직접 체크박스로 확인:

- [ ] **Discovery 없이는 코드 한 줄 안 고친다.** (PART III)
- [ ] **회귀 0 이 아니면 머지 안 한다.** (PART IV §37)
- [ ] **무료/OSS 가 가능한데 유료 안 쓴다.** (PART V §39)
- [ ] **만든 것은 부수지 않고 더 정교하게 만든다.** (PART IV §36)
- [ ] **UI 기본틀은 헌법이다 — 명시 승인 없이 단 한 픽셀도 안 바꾼다.** (PART XI §54)
- [ ] **네이버·구글이 매시간 와서 우리 매물을 좋아하게 만든다.** (PART XI §56-61)
- [ ] **5 층 방어를 모두 통과하지 못한 변경은 존재하지 않는다.** (§62)
- [ ] **반복하더라도 0 회귀가 될 때까지 머지하지 않는다.** (§63 + §65)

---

## 67. v4 통합 PR 게이트 매트릭스 (모든 게이트 한눈에)

PR 머지 전 자동 통과해야 하는 모든 게이트:

| # | 게이트 | 도구 | 통과 기준 |
|---|--------|------|----------|
| 1 | Type | tsc strict | 0 error |
| 2 | Lint | ESLint + Biome | 0 error |
| 3 | Format | Prettier/Biome | 차이 0 |
| 4 | Unit Test | Vitest | 100% pass |
| 5 | Integration | Vitest + msw | 100% pass |
| 6 | Contract | Pact / OpenAPI snapshot | 변경 의도분만 |
| 7 | Property | fast-check | 100 회 fuzz pass |
| 8 | Mutation | Stryker | kill rate ≥ 80% |
| 9 | Diff Coverage | c8 + diff-cover | ≥ 90% |
| 10 | E2E | Playwright | 핵심 flow 100% |
| 11 | Visual Regression | Argos / pixelmatch | diff 0 또는 승인분 |
| 12 | DOM Snapshot | Vitest snapshot | diff 0 또는 승인분 |
| 13 | Component API | api-extractor | breaking 0 |
| 14 | CSS Token Lock | scripts/check-tokens | 변경 시 RFC |
| 15 | Lighthouse CI | LHCI | LCP/INP/CLS 회귀 0 |
| 16 | SEO Meta | scripts/seo-snapshot | 변경 의도분만 |
| 17 | Schema.org | Rich Results API | valid |
| 18 | sitemap 매물 수 | scripts/sitemap-check | -10% 이내 |
| 19 | Filter Regression | 4 카테고리 × N × M | 100% pass |
| 20 | Behavior Snapshot | scripts/behavior-diff | unexpected diff 0 |
| 21 | DB Migration | supabase db diff | reversible 강제 |
| 22 | Security | OSV-Scanner / npm audit | critical 0 |
| 23 | Secret Scan | gitleaks | 0 |

23 개 게이트. 모두 통과 시에만 머지. **bypass 권한 없음**.

---

## 68. v4 한 줄 비전 (최종)

> "고객이 말하면, 네이버·구글이 우리 매물을 가장 먼저 보여주고,
> AI 가 이해하고, 시스템이 100ms 안에 정확히 응답하며,
> UI 는 어제와 똑같이 안정적이고,
> 5 층 방어를 통과한 변경만이 살아남는 — 한국 1 등 부동산 플랫폼."

---

이 v4 가 거버넌스·UI·SEO·무회귀 축의 결정판이다.
하지만 **필터 본연의 정교함**은 PART XII 가 결정한다.

---
---

# PART XII — Filter Craft 결정판 (필터 그 자체에 집중) — v5

> 정직한 자기 평가: PART I~XI 는 넓은 거버넌스·UI·SEO·무회귀를 깔았다.
> 그러나 "필터 작업의 정밀도" 자체로 좁히면 일반론에 머물렀다.
> 이 PART 는 필터 그 자체만 본다 — 한국 부동산 도메인 특수성, 의미론
> 엣지케이스, 거대 조합 공간 검증, 1M 매물 50ms 성능, 지오 정밀,
> 숨겨진 가치 필터, 사이드 이펙트 원천 차단을 위한 단일 출처(SSOT).

## 69. 정직한 자기 평가 (왜 PART XII 가 필요한가)

PART I §3 (필터 인벤토리) 는 "표를 만들라" 까지였다. 실제 작업자에겐
부족하다. 다음이 추가로 결정되어야 작업이 산다:

- **단위 / enum 표준** — ㎡ vs 평, 만원 vs 억, '월세' 표기, '남남동' 정규화
- **의미론 엣지케이스** — NULL / 범위 / 다중 선택 OR vs AND / 무효 조합
- **거대 조합 공간** — 4 cat × 30+ filter × 5 value = 사실상 무한, 어떻게 검증할지
- **성능** — 1M 매물에서 p95 50ms 달성 인덱스 전략
- **지오** — 행정구역 / 폴리곤 / 반경 / Isochrone / 지도 viewport 동기화
- **숨겨진 가치** — 침수 / 범죄 / 학군 / 소음 / 대기질 — 경쟁사 미보유 차별화
- **단일 출처 (SSOT)** — "한 곳 고치면 다른 곳 터지는" 사이드 이펙트의 원천 차단

## 70. 한국 부동산 필터 단위 / enum 표준화

### 70.1 단위 표준 (저장 형식 ↔ UI 형식 명확 분리)

| 항목 | DB 저장 | UI 표시 | 변환 |
|------|--------|--------|------|
| 면적 | ㎡ (numeric) | 평 (정수) | 1 평 = 3.3058 ㎡ |
| 매매가 | 원 (bigint) | "5억 2,000" | 100,000,000 / 1,000,000 분할 |
| 월세 | "1000/50" 형식 (보증금만, 월세만 분리 컬럼) | "1,000 / 50" | 모달 분리 |
| 층 | 정수 (current_floor, total_floor) | "5/15" 또는 "저/중/고" | 1~3=저, 4~7=중, 8~=고 (총층 대비 비율) |
| 방/욕실 | numeric (0.5 허용) | "1.5룸 / 욕 1" | "1.5" 그대로 |
| 관리비 | 원 (정수) | "10만원" | /10000 |

UI 라벨과 DB 컬럼은 **반드시 변환 함수**를 거친다. 직접 비교 절대 금지.

### 70.2 표준 enum (실제 데이터 분포로 검증 후 확정)

```ts
// 잠정안 — Discovery Step 4 (Section 29.3) 결과로 최종 확정
const ENUMS = {
  deal_type: ['매매','전세','월세','단기'] as const,
  listing_type_residential: [
    '아파트','빌라','원룸','투룸','쓰리룸이상',
    '오피스텔','단독','다가구','다세대','주택'
  ] as const,
  listing_type_commercial: [
    '상가','사무실','창고','공장','점포',
    '빌딩일부','빌딩전체','지식산업센터'
  ] as const,
  listing_type_land: [
    '대지','임야','농지','공장용지','잡종지','과수원'
  ] as const,
  direction: [
    '남','남동','남서','동','서','북','북동','북서','확인필요'
  ] as const,
  option: [
    '에어컨','세탁기','냉장고','김치냉장고','전자레인지','가스레인지',
    '인덕션','오븐','TV','책상','의자','침대','옷장','신발장',
    '식탁','식기세척기','전자도어락','비디오폰','인터폰','CCTV',
    '베란다','발코니','다용도실','드레스룸','펜트리'
  ] as const,
  maintenance_includes: [
    '전기','수도','가스','난방','인터넷','TV','청소','경비','주차','공용관리'
  ] as const,
  status: ['공개','거래완료','보류','삭제','광고만료'] as const,
  // ...
} satisfies Record<string, readonly string[]>;
```

크롤러 / API / UI 모두 이 enum 외 값을 절대 채우지 않는다. 변형(`남남동`,
`monthly`, `2.5룸` 등) 은 normalize 단에서 흡수, enum 으로 강제. enum 변경 시
`migration + crawler patch + UI patch` 가 한 PR 에 묶인다 (Section 23.2).

## 71. 필터 의미론 엣지케이스 카탈로그 (모든 필터에 명시 필수)

각 필터 정의에 다음 명시 필수:

### 71.1 빈 필터의 의미
- **빈 필터 (사용자 미입력)** = 모든 매물 (단 status='공개' AND is_published=true 만)
- **모두 선택** ≠ **빈 필터** — UI 단에서 분리 (모두 선택 = 명시 표현)

### 71.2 다중 선택 결합 규칙
- **다른 카테고리 간**: AND (예: 매물유형 + 가격 + 위치 → 모두 만족)
- **같은 카테고리 내 다중**: OR (예: 매물유형 [아파트, 빌라] → 둘 중 하나)
- **반대극 동시 선택 (불가능 조합)**: UI 단에서 차단
  - 매매 + 월세
  - 전세 + 보증금 0
  - 풀옵션 + 옵션 없음

### 71.3 NULL 처리 정책 (필터별 명시 필수)

| 필터 | 사용자 미선택 시 | 사용자 ON 시 | NULL 매물 처리 |
|------|--------------|-----------|------------|
| 반려동물 OK | 모든 매물 통과 | pet_allowed=true 만 | NULL 제외 |
| 풀옵션 | 모든 매물 통과 | option_level='full' 만 | NULL 제외 |
| 가격 ≤ 5억 | 모든 매물 통과 | price ≤ 500000000 | NULL 제외 (가격 모르는 매물 노출 X) |
| 가격 비공개 보기 | 모든 매물 통과 | price IS NULL | 별도 토글 (선택형) |
| 옵션 항목 (다중) | 모든 매물 통과 | options @> 선택값 | NULL → 빈 배열 normalize 후 비교 |
| 융자 없음만 | 모든 매물 통과 | loan=false 만 | NULL 제외 (안전 우선) |
| 입주 가능일 ≤ X | 모든 매물 통과 | move_in_date ≤ X | NULL 제외 |

원칙: **사용자가 명시한 조건은 그 조건이 확실히 충족된 매물만**. NULL 은
"몰라서 못 보여줌" 으로 취급. 단 별도 "정보 비공개도 보기" 토글 가능.

### 71.4 범위 처리
- **양방향 (a~b)**: a ≤ x ≤ b (양 끝 inclusive)
- **하한만 (a 이상)**: x ≥ a inclusive
- **상한만 (b 이하)**: x ≤ b inclusive
- **a > b 입력**: UI 단 자동 swap + 토스트
- **음수 / 0 / NaN**: UI 단 차단

### 71.5 빈 결과 처리
"조건에 맞는 매물이 없습니다" + 다음을 동시 제시:
- 가장 가까운 조건 완화 제안 (LLM): *"가격을 7억까지 늘리면 12 건"*
- 인접 지역 (gu 폴리곤 인접) 결과 N 건
- 저장된 검색 등록 유도 — 신규 매물 시 알림
- 자연어 입력으로 재시도 유도

## 72. 거대 조합 공간 검증 — 4 단계 매트릭스

전수 검증은 불가능 (조합 ≈ ∞). 다음 4 단계로 **실용적 100% 도달**:

### 72.1 Layer A — Golden Cases (50 개, 매 PR 의무)
손으로 작성한 핵심 사용자 시나리오. 절대 깨지면 안 되는 보장 라인.

```yaml
# tests/golden/g001.yaml
name: 강남 아파트 매매 5억 이하 반려동물 OK
input:
  category: 주거
  listing_type: [아파트]
  deal_type: [매매]
  price_max: 500000000
  pet_allowed: true
  gu: [강남구]
expected_min_count: 5      # 최소 이만큼은 나와야
expected_max_count: 1000   # 이보다 많으면 어딘가 새는 중
must_include_id: [12345, 67890]   # 알려진 정답 매물
must_exclude_id: [99999]          # 절대 섞이면 안 되는 매물
sql_oracle: |              # 직접 SQL 결과와 비교
  SELECT id FROM listings
  WHERE category='주거' AND listing_type='아파트'
    AND deal_type='매매' AND price <= 500000000
    AND pet_allowed=true AND gu='강남구'
    AND status='공개' AND is_published=true
```

50 개 중 어느 하나라도 fail → 머지 차단.

### 72.2 Layer B — Pairwise Combinatorial (~200, 매 PR)
**Allpairs 알고리즘** — "어떤 두 필터의 어떤 두 값 조합도 한 번은 검증".
도구: `pict` (마이크로소프트 OSS) 또는 `allpairs` (Python).

```
pict combinations.txt > test_cases.csv
# 30 필터 × 평균 5 값 → ~200 케이스로 모든 pair 커버
```

각 케이스 → API vs SQL oracle 차집합 0 검증.

### 72.3 Layer C — Property-based Fuzz (5K random, 매 PR)
fast-check 로 무작위 입력 fuzz:

```ts
fc.assert(fc.property(
  fc.record({
    category: fc.constantFrom('주거','상가','토지','투자'),
    price_min: fc.option(fc.integer(0, 10_000_000_000)),
    price_max: fc.option(fc.integer(0, 10_000_000_000)),
    deal_type: fc.subarray(['매매','전세','월세','단기']),
    // ...
  }),
  async (filter) => {
    const apiResult = await callFilterApi(filter);
    const sqlResult = await directSqlOracle(filter);
    expect(symmetricDiff(apiResult, sqlResult)).toEqual([]);
  }
), { numRuns: 5000 });
```

랜덤 입력 + 자동 shrinking 으로 **사람이 생각 못한 엣지** 잡음.

### 72.4 Layer D — Production Replay (실 사용자 1K, 야간 + PR)
실제 사용자 쿼리 (PII 제거된 익명 로그) 를 preview 환경에서 재생.
- 어제 발생한 쿼리 1,000 개 샘플
- 신구 코드 응답 diff 0 검증
- 차이 발생 시 즉시 알림 + 머지 차단

→ 합성 + 실 사용자 쿼리 = 실용적 100% 보장.

## 73. 필터 성능 — 1M 매물 p95 < 50ms

### 73.1 인덱스 전략 (Postgres 기준)
- **Composite Index** — 자주 같이 쓰이는 필터 묶음
  ```sql
  CREATE INDEX listings_search_idx
  ON listings (status, is_published, source_site, deal_type, gu, listing_type, price)
  WHERE status='공개' AND is_published=true;
  ```
- **GIN** — text[] (옵션, 관리비 포함)
  ```sql
  CREATE INDEX listings_options_gin ON listings USING GIN (options);
  ```
- **GiST / SP-GiST** — 지오 (PostGIS)
  ```sql
  CREATE INDEX listings_geo_gist ON listings USING GiST (location);
  ```
- **Partial Index** — 자주 쿼리되는 부분집합
- **BRIN** — 시간순 (created_at, updated_at) 대용량
- **Expression Index** — `lower(name)` 같은 정규화 컬럼

### 73.2 EXPLAIN ANALYZE 회귀 테스트
핵심 쿼리 N 개의 실행계획 (`EXPLAIN (ANALYZE, BUFFERS, FORMAT JSON)`) 을
스냅샷으로 저장 → 변경 시 plan 회귀 자동 감지 (Seq Scan 등장 = 즉시 알림).

### 73.3 Materialized View — 인기 필터 사전계산
```sql
CREATE MATERIALIZED VIEW mv_popular_filters AS
SELECT gu, deal_type, listing_type, price_bucket,
       array_agg(id ORDER BY created_at DESC) ids,
       count(*) cnt
FROM listings WHERE status='공개' AND is_published=true
GROUP BY gu, deal_type, listing_type, price_bucket;

-- pg_cron 5 분마다 갱신
SELECT cron.schedule('refresh_mv', '*/5 * * * *',
  $$REFRESH MATERIALIZED VIEW CONCURRENTLY mv_popular_filters$$);
```

### 73.4 쿼리 캐시 (정규화 키 기반)
- 필터 객체 → 정렬·정규화 → SHA-256 → Redis key
- TTL 60s (신규 매물 등록 시 invalidate)
- Cache hit ratio 추적 (목표 > 80%)

### 73.5 Connection Pool + Read Replica
- PgBouncer (Supabase 내장) — `transaction` mode
- 읽기 부하 → read replica (Supabase Pro 또는 자체 streaming replica)
- 쓰기는 primary, 필터 읽기는 replica

### 73.6 성능 회귀 게이트
- `pg_stat_statements` 로 매주 Top 20 slow query 추출
- 매 PR: 핵심 쿼리 latency 회귀 ≥ 20% → 머지 차단
- p95 SLO: 50ms (단일 필터), 80ms (복합 필터), 150ms (지오 + 복합)

## 74. 지오 필터 — 한국 부동산 정밀

### 74.1 행정구역 다중 선택
- 시 / 구 / 동 / 읍 / 면 / 리 (행안부 도로명주소 API 데이터)
- "강남구" 선택 = 강남구 폴리곤 ST_Within
- 자치구 (수원시 장안구 등) 우선 (이미 onhouse 적용, 공실클럽 미적용)

### 74.2 폴리곤 직접 그리기
- Mapbox / Leaflet draw plugin → polygon → ST_Within 쿼리
- 사용자가 "이 동네만" 그린 영역 매물

### 74.3 반경 검색
- 현재 위치 (HTML5 Geolocation) + 1/3/5/10km
- ST_DWithin (PostGIS) — 빠른 GiST 인덱스 활용

### 74.4 Isochrone (도보 / 대중교통 N 분 이내)
- OSRM self-host 또는 OpenRouteService Free
- 결과 polygon 캐시 (자주 쓰이는 출발지: 강남역 / 시청 등)

### 74.5 지하철역 / 학교 / POI 기반
- 지하철역 도보 5/10 분 이내 — POI 인리치먼트 (§17.3)
- 초·중·고 배정 폴리곤 (학세권) — 교육청 데이터
- 한국 특유: *"역세권"*, *"초품아"*, *"숲세권"*, *"몰세권"*

### 74.6 지도 viewport 동기화 (map-search 모드)
- 사용자가 지도 이동 → viewport bounds = 자동 필터
- debounce 300ms — 과도한 요청 방지
- URL 동기화 — 공유 가능

### 74.7 H3 클러스터링 (성능)
- 줌 레벨 → H3 res 동적 (Z6 → res 6, Z14 → res 9)
- 같은 셀 매물을 묶어서 마커 1 개로 표시 (지도 과밀 방지)
- 클러스터 클릭 → 줌 인 + 분리

## 75. 숨겨진 가치 필터 (경쟁사 미보유 — 차별화)

> 무료 공공 데이터 + 외부 API 결합으로, "사용자가 말하지 못한 가치" 까지
> 필터화. 한 번 enrichment 하면 매물별 영구 보존.

| 필터 | 데이터 소스 | 무료 여부 |
|------|-----------|---------|
| 침수 이력 | 환경부 / 행안부 침수흔적도 | 무료 (공공) |
| 범죄율 | 경찰청 통계 (지역별) | 무료 (공공) |
| 학군 / 배정학교 | 교육청 학구도 + 학업성취도 | 무료 (공공) |
| 도로 소음 | 도로 거리 PostGIS 계산 | 무료 |
| 철로 소음 | 철도 거리 PostGIS 계산 | 무료 |
| 대기질 | 에어코리아 측정소 + 평균 농도 | 무료 (공공) |
| 일조량 | 위도 + 향 + 주변 건물 높이 (간이) | 무료 (계산) |
| 인구 통계 | 통계청 행정동 단위 | 무료 (공공) |
| 1인가구 비율 | 통계청 | 무료 |
| 상권 활성도 | 카카오 POI 밀도 | 무료 한도 내 |
| 평균 시세 대비 | 국토부 실거래가 | 무료 (공공) |
| 매물 거래 회전율 | 자체 sold_at 통계 | 무료 |
| 단지 정보 (아파트) | 국토부 + KB | 무료 한도 |

각 필드는 매물 등록 시 enrichment worker 가 자동 채움. UI 토글 1 개씩
점진 추가 (PART IV §34 7 단계 프로토콜 준수).

## 76. 필터 텔레메트리 — 데이터로 우선순위 정하기

PostHog Free Cloud 또는 자체 Supabase 이벤트 테이블에 다음 이벤트 누적:

```ts
type FilterEvent =
  | { type: 'filter_applied'; filter: string; value: any; result_count: number; latency_ms: number }
  | { type: 'filter_zero_result'; filter_combo: object }
  | { type: 'filter_abandoned'; filter: string; previous_value: any }   // 토글하다 끔
  | { type: 'filter_to_inquiry'; filter_combo: object; listing_id: string }
  | { type: 'search_query_text'; raw: string /* PII 제거 */ };
```

매주 자동 보고 (Claude 가 로그 요약):
- "이번 주 결과 0 인 필터 조합 Top 10" → 데이터 보강 큐 자동 등록
- "토글 빈도 vs 정확도 미스매치 (자주 쓰는데 결과 이상)" → PR 큐
- "신규 필터 후보 (자연어 검색에서 발견된 의도, 현재 미지원)" → RFC 큐
- "필터 → 문의 전환율 Top 10 / Bottom 10" → 마케팅·UX 백로그

이 텔레메트리 자체가 **다음 PR 의 우선순위를 자동으로 결정**한다. 추측 X.

## 77. 필터 정의 단일 출처 (Single Source of Truth — 사이드 이펙트 차단의 결정타)

> "한 곳 고치면 다른 곳 터지는" 모든 사이드 이펙트의 근본 원인은
> **정의가 여러 곳에 흩어져 있기 때문**이다. 단일 출처가 답이다.

### 77.1 SSOT 파일 구조

```ts
// src/filters/registry.ts (단일 출처)
import { z } from 'zod';
import { sql } from '@/db';

export const FILTERS = {
  deal_type: {
    label: '거래 유형',
    label_en: 'Deal Type',
    category: 'common',
    type: 'multi-select',
    enum: ['매매','전세','월세','단기'] as const,
    schema: z.array(z.enum(['매매','전세','월세','단기'])).optional(),
    db_column: 'deal_type',
    db_type: 'text',
    indexed: true,
    null_policy: 'exclude' as const,   // NULL 매물은 결과에서 제외
    sql: (vals: string[]) => sql`deal_type = ANY(${vals})`,
    ui_widget: 'chip-multi',
    ui_order: 1,
    test_golden: ['g001','g002','g015'],
    crawler_source: {
      onhouse: 'normalizeRow.deal_type',
      gongsilclub: 'normalizeRow.deal_type',
    },
    last_verified_at: '2026-04-29',
  },
  price: {
    label: '가격',
    type: 'range',
    unit_db: 'KRW',
    unit_ui: '만원',
    convert_db_to_ui: (v: number) => v / 10000,
    convert_ui_to_db: (v: number) => v * 10000,
    db_column: 'price',
    db_type: 'bigint',
    indexed: true,
    null_policy: 'exclude' as const,
    sql: ({ min, max }: { min?: number; max?: number }) => {
      const conds = [];
      if (min) conds.push(sql`price >= ${min}`);
      if (max) conds.push(sql`price <= ${max}`);
      return conds.length ? sql.join(conds, sql` AND `) : sql`true`;
    },
    // ...
  },
  // ... 30 개 필터 모두
} as const;
```

### 77.2 SSOT 로부터 자동 생성되는 것 (코드젠)

이 한 파일이 다음을 모두 만들어낸다:

1. **API 스키마** — Zod schema → API 입력 검증
2. **SQL WHERE 절** — runtime 에서 `sql()` 함수 호출
3. **UI 컴포넌트** — `<FilterPanel filters={FILTERS} />` 가 자동 렌더
4. **테스트 매트릭스** — golden + pairwise 자동 생성
5. **문서** — `docs/FILTER_SPEC.md` 자동 빌드
6. **타입** — `type FilterInput = z.infer<typeof InputSchema>`
7. **i18n 라벨** — `label`, `label_en`, ...
8. **마이그레이션 검증** — `db_column` 이 실제 DB 에 있는지 lint

### 77.3 SSOT 위반 자동 차단 (Lint Rule)
ESLint custom rule:
- `listings.<col>` 직접 SQL 작성 금지 (FILTERS[*].sql 만 허용)
- UI 컴포넌트가 FILTERS 외 라벨 사용 금지
- 새 필터 추가 시 11 개 필드 (label, type, enum/range, db_column, sql,
  null_policy, ui_widget, test_golden, crawler_source, last_verified_at,
  indexed) 모두 채워야 통과

→ "한 곳만 고치면 끝" 강제. 사이드 이펙트 원천 차단.

### 77.4 SSOT 의 마이그레이션 안전성
- DB 컬럼 추가 ↔ FILTERS 항목 추가가 같은 PR
- 한 PR 안에 migration + crawler patch + UI patch + 테스트 모두
- expand-contract (Section 35) 강제

## 78. 필터 PR 의 최소 요건 (DoD §50 의 필터 전용 강화판)

필터 추가/수정 PR 은 다음을 모두 갖춰야 머지:

- [ ] FILTERS registry 에 정의 추가/변경 (단일 출처)
- [ ] db migration (필요 시) — expand-contract
- [ ] crawler normalize 양쪽 (onhouse + gongsilclub) 동기화
- [ ] golden case ≥ 3 개 추가 (정상 / 경계 / 엣지)
- [ ] property-based fuzz 통과 (5K runs)
- [ ] pairwise 자동 케이스 통과
- [ ] EXPLAIN ANALYZE 회귀 0
- [ ] p95 latency < 50ms (단일) / 80ms (복합) / 150ms (지오 복합)
- [ ] NULL 정책 명시 (table 71.3 갱신)
- [ ] 텔레메트리 이벤트 추가 (filter_applied 등)
- [ ] 텔레메트리 대시보드에서 신규 필터 보임 확인
- [ ] 문서 자동 생성 결과 검토
- [ ] PART XI §54 UI 불변 게이트 통과

## 79. 절대 안티패턴 — 필터 한정 (PART X §52 보강)

PART X 의 15 개 외 필터 작업 한정 추가 안티패턴:

16. **enum 외 값 직접 비교** — `deal_type = '월세 '` 같은 raw 비교 X. 정규화 후 enum.
17. **단위 무시 비교** — 평 ↔ ㎡ 직접 비교 절대 X. converter 만 사용.
18. **NULL 정책 미명시** — `WHERE col >= 0` 같은 무심한 조건 → NULL 매물 자동 제외, 의도 명시 안 됨.
19. **SSOT 우회 SQL** — FILTERS registry 안 거치고 listings.<col> 직접 쿼리 X.
20. **golden case 없이 fix** — 회귀 테스트 안 된 수정 X.
21. **단일 사이트만 대응** — onhouse 만 고치고 gongsilclub 미동기화 X (사용자 명시 원칙).
22. **단위 표시 없는 UI** — "5,000" 만 표시 (만원? 원? 평?) 절대 X.
23. **무한 스크롤로 누락 가림** — 결과가 잘렸는데 사용자 모르게 하는 UX X.
24. **자치구 vs 시 혼동** — gu 컬럼 정책 일관성 (이미 onhouse 자치구 우선 적용).
25. **거래완료 매물 노출** — status='거래완료' 가 결과에 섞이면 즉시 SEV2.

## 80. v5 한 줄 비전 (필터 전용)

> "필터의 진실은 단일 출처(§77)에 있고,
> 정확도는 4 단계 매트릭스(§72)로 증명되며,
> 1M 매물에서 50ms 안에 응답하고(§73),
> 사용자가 말하지 못한 가치(§75)까지 찾아준다."

---

이 v5 가 결정판이다. 거버넌스(I~XI) 위에 필터 본연의 정교함(XII)이 얹혀,
**프로세스도 단단하고 작업물도 정밀**하다.

"이 정도면 정말 최선이야?" 의 답: 필터에 한정해서는 v5 가 최선이다.
이보다 더 정교해지려면 도메인 데이터를 직접 보면서 §70.2 enum / §73.1
인덱스 / §75 숨겨진 가치 필터 후보를 실측 기반으로 확정하는 단계로
넘어가야 한다 — 즉, **다음은 코드베이스/DB mount + Discovery 실행**이다.

---
---

# PART XIII — 타겟 페르소나 + JTBD (사장님 결단 2026-04-29) — v6

> v5 까지는 엔지니어링 헌법. v6 는 **누구를 위해 만드는가** 를 헌법화한다.
> 이 PART 가 없으면 필터 100% 정확해도 사용자가 안 온다.

## 79. 사장님이 명시한 타겟 (3 페르소나, 종합부동산)

WISHES 는 **종합 부동산** — 주거 + 상가/사무실 + 토지/투자 통합.
첫 6 개월 핵심 페인을 풀어야 할 사용자 3 명:

### 79.1 페르소나 A — "사회초년생" (1인 가구, 25-30대)
- **JTBD**: *"부모집에서 독립하고 싶다. 처음이라 무엇부터 봐야 할지 모르겠다."*
- **핵심 페인**: 깡통전세 사기, 보증금 보호 (HUG 가입), 첫 자취 체크리스트, 출퇴근 1순위, 예산 한도 ≤ 1억/전세 또는 ≤ 보증금 1천 + 월세 70
- **거래 유형**: 월세 (압도) + 전세 (소수)
- **매물 유형**: 원룸 / 투룸 / 오피스텔
- **WISHES 가 풀어야 할 것**:
  - HUG 가능 매물 자동 라벨 (전세 보증보험 가입 가능 매물 표시)
  - 출퇴근 직장 입력 → Isochrone 도보/대중교통 N분 (이미 인프라 있음 §74.2)
  - 첫 자취 체크리스트 + 매물별 자동 점검 (창문/방음/곰팡이/누수/주차/CCTV)
  - 깡통전세 위험도 (`auto_detect_jeonse_risk()` 이미 정의됨 — trigger 등록만)
  - 시세 대비 ±% 자동 표시 (rtms_avg_price 컬럼 이미 있음, 데이터 채움 필요)

### 79.2 페르소나 B — "신혼부부" (2인 + 미래 자녀, 28-35대)
- **JTBD**: *"우리 부부 출퇴근 + 미래 아이 학군 + 부부 합산 대출 한도 = 어디서 시작?"*
- **핵심 페인**: 학군 (초/중) 비교 어렵, 출퇴근 2 명 동시 만족 어렵, 미래 가치 (재개발/신축), 부부 합산 대출 계산
- **거래 유형**: 전세 + 매매
- **매물 유형**: 빌라 / 아파트 / 오피스텔 / 신축 우선
- **WISHES 가 풀어야 할 것**:
  - 학군 점수 (school_zone_score 컬럼 있음, 데이터 채움 — 교육청 학구도 + 학업성취도)
  - **출퇴근 2 직장 동시 isochrone** — 부부 각자 직장 입력 → 교집합 영역만 표시 (한국 부동산 사이트 어디에도 없는 기능 ★)
  - 학교/어린이집/병원 카운트 (이미 컬럼 있음: school_count, daycare_count, hospital_count, academy_count)
  - 시세 대비 + 미래 가치 (재개발/리모델링 정보)
  - 대출 계산기 (이미 `/calculator` 페이지 존재 — 검증 필요)

### 79.3 페르소나 C — "사업자" (B2B, 30-50대, 상가/사무실)
- **JTBD**: *"내 사업에 맞는 자리. 권리금 합리적이고, 업종 변경 가능, 상권 활성."*
- **핵심 페인**: 권리금 적정성 평가, 업종 제한 / 변경 가능성, 화장실·주차·엘레베이터 핵심, 상권 분석 (유동인구, 경쟁점)
- **거래 유형**: 월세 (압도) + 매매 (소수, 빌딩)
- **매물 유형**: 상가 / 사무실 / 점포 / 지식산업센터
- **WISHES 가 풀어야 할 것**:
  - 권리금 시세 (동/업종별 평균 — 자체 데이터 누적)
  - 업종 제한 / 변경 가능 / 추천 업종 명시 (DB 에 컬럼 이미 있음: business_type, previous_business, recommended_business, restricted_business)
  - 상권 활성도 (commercial_score 컬럼 있음, 데이터 채움 — 카카오 POI 밀도 + 유동인구)
  - 화장실 / 주차 / 엘레베이터 / 정화조 / 가스 / 환기 / 24시간 운영 가능 / 사업자 등록 가능
  - **이전 업종 → 위험 신호** (예: 음식점 폐업 후 같은 자리 = 상권 약화 가능성)

## 80. 페르소나 × 필터 우선순위 매트릭스 (작업 순서 결정)

| 필터 | 사회초년생 | 신혼부부 | 사업자 | 통합 우선순위 |
|------|---------|--------|------|-------------|
| 거래유형 (월/전/매) | ★★★ | ★★★ | ★★ | **P0** |
| 가격 (보증금/월세/매매가) | ★★★ | ★★★ | ★★★ | **P0** |
| 면적 (평/㎡) | ★★ | ★★★ | ★★★ | **P0** |
| 위치 (구/동/폴리곤) | ★★★ | ★★★ | ★★★ | **P0** |
| 매물 유형 (원/투/오/아파트/상가) | ★★★ | ★★★ | ★★★ | **P0** |
| 출퇴근 isochrone | ★★★ | ★★★ (2인) | ★ | **P1** |
| 학군 / 학교 카운트 | ★ | ★★★ | - | **P1** |
| HUG 가입 가능 라벨 | ★★★ | ★ | - | **P1** |
| 깡통전세 위험도 | ★★★ | ★★ | - | **P1** |
| 권리금 시세 / 적정성 | - | - | ★★★ | **P1** |
| 업종 제한 / 변경 가능 | - | - | ★★★ | **P1** |
| 상권 활성도 | - | - | ★★★ | **P1** |
| 시세 대비 ±% (rtms) | ★★ | ★★★ | ★★ | **P1** |
| 옵션 (풀옵션/주차/엘베/반려) | ★★★ | ★★ | ★★ | **P1** |
| 방수 / 욕실수 | ★★★ | ★★★ | - | **P1** |
| 층 (저/중/고) | ★★ | ★★ | ★★★ | **P2** |
| 방향 | ★ | ★★ | - | **P2** |
| 미세먼지 / 소음 | ★ | ★★★ | - | **P2** |
| 범죄 안전 | ★★ | ★★★ | - | **P2** |

→ **PR-A SSOT registry 의 필터 11 종 (deal/type/price/area/location/options/...) 가 P0**.
→ 페르소나별 차별화 필터 (HUG, 출퇴근 2인 isochrone, 권리금 시세, 업종 제한) 이 P1.
→ 데이터 enrichment (학군/공기/소음/시세) 가 P1 의 데이터 측 작업.

## 81. JTBD 검증 - 5 사용자 인터뷰 (실행 의무)
프롬프트가 추측이 되지 않으려면 6 개월 안에 페르소나당 최소 5 명 인터뷰 필수.
- 사회초년생 5 명 — 첫 자취 후 6 개월 이내
- 신혼부부 5 명 — 신혼집 거래 후 6 개월 이내
- 사업자 5 명 — 매장 임차 / 매매 후 6 개월 이내

질문 핵심 5 개 (절대 변경 금지 — 비교 가능):
1. "이 집/매물 결정에 가장 큰 어려움은 무엇이었나요?"
2. "어떤 사이트들을 비교했나요? 왜 결국 그곳을 선택했나요?"
3. "검색 시 가장 자주 검색에 실패한 조건은?"
4. "허위매물을 본 적이 있나요? 어떻게 알아차렸나요?"
5. "WISHES 가 무엇을 더 해주면 다시 오시겠나요?"

→ 인터뷰 결과를 quarterly 백로그 우선순위에 반영.

---

# PART XIV — UVP 헌법: 100% 실매물 보증 (사장님 명령)

> "직방엔 있고 WISHES 엔 절대 없는 한 가지 — 가짜."
> 이 한 문장이 WISHES 의 비교불가 핵심. 마케팅 카피가 아닌 **시스템 헌법**.

## 82. "100% 실매물" 의 정의 (법적 + 운영적)

### 82.1 약속의 정확한 범위
- ✅ 등록 시점에 실제로 거래 가능한 매물만 노출
- ✅ 거래 완료 후 즉시 비공개 처리 (자동)
- ✅ 가격 / 면적 / 주소 / 사진 모두 사실 (광고 표시 의무 §40 준수)
- ✅ 사진은 그 매물의 실제 사진 (다른 매물 도용 X)
- ⚠️ "갑자기 나가는 매물" 은 인정 — 동시 다중 문의로 거래된 경우 (사장님 명령), 단 **24시간 내 비공개 처리 의무**.

### 82.2 약속이 깨질 수 있는 3 시나리오 + 차단 시스템
1. **거래 완료된 매물이 노출** (가장 흔한 허위)
   - 차단: `fn_sunset_listings(5)` (이미 매일 18시) + 사용자 신고 1 건이라도 → 즉시 비공개 + 24h 내 검증
2. **존재하지 않는 매물** (낚시 / 미끼 매물)
   - 차단: 신규 등록 시 KISO 14항 자동 검증 (이미 trigger ON), 사진 perceptual hash 중복 탐지, 시세 대비 ±3σ 이상치 자동 problematic 마킹
3. **잘못된 정보** (가격/면적/주소 다름)
   - 차단: `auto_detect_jeonse_risk()` + 사용자 신고 + 자동 KISO 검증 + 매물별 trust_score 표시

## 83. 100% 보증 시스템 (자동화 헌법)

### 83.1 등록 시점 자동 검증 (이미 trigger 있음 — 강화 필요)
- KISO 14항 검증: ✅ 이미 `kiso_validate_listing_tr` BEFORE I/U
- 주소 정규화: ✅ 이미 `listings_normalize_address`
- 중복 탐지: ✅ 이미 `listings_set_fingerprint`
- 사진 perceptual hash: 🚧 추가 필요 (다른 매물 도용 차단)
- 시세 이상치: 🚧 추가 필요 (rtms_avg_price 데이터 채워진 후)

### 83.2 운영 중 자동 검증 (Sunset + Cron)
- miss_count ≥ 5 → 거래완료 (이미 `wishes_sunset_daily` cron)
- 30일 거래완료 매물 아카이브 (이미 `wishes_archive_daily`)
- 신규: **사용자 신고 → 24h 내 자동/사람 검증**
- 신규: **trust_score < 50 매물 자동 검토 큐**

### 83.3 사용자 가시 신뢰 신호 (UI — RFC 필요, §54.3)
매물 카드에 다음을 항상 표시 (UI 헌법 §54 변경이므로 RFC):
- ✅ "마지막 확인: N시간 전" (last_verified_at / last_crawled_at)
- ✅ "100% 실매물 보증" 배지 (모든 공개 매물)
- ✅ trust_score 점수 (0~100, 75 이상만 표시 권장)
- ✅ "wishes 자체 촬영" 라벨 (has_wishes_media=true)
- ⚠️ "이 매물에 문제가 있나요?" 신고 버튼 (1-tap)

### 83.4 사용자 신고 처리 SLA (헌법)
- 신고 접수 → **15 분 내 자동 분류** (LLM Groq Free)
- 자동 분류 결과:
  - "거래 완료" → **즉시 비공개** + 중개사 통보
  - "정보 오류" → 24h 내 사람 검토 + 수정 또는 비공개
  - "사진 도용" → 즉시 보류 + 사람 검토
  - "사기 의심" → 즉시 비공개 + 즉각 사람 검토
- 신고자에게 24h 내 처리 결과 통보 (이메일)
- 신고 누적 데이터로 분류기 fine-tune

### 83.5 허위매물 발생 시 사용자 보상 (선언적 차별화)
- 사용자가 wishes 매물을 보고 방문했는데 허위였음을 증명하면:
  - **방문 교통비 보상** (서울 1만원 / 경기 2만원, 카카오페이 즉시)
  - **사과 + 같은 조건 매물 직접 추천** (사람 큐레이션)
- 비용은 적지만 신뢰의 임팩트는 큼. 이게 비교불가의 핵심.

### 83.6 마케팅 카피 (UX 텍스트 SoT)
- 메인 페이지: *"100% 실매물 보증. 직방엔 있고 WISHES 엔 절대 없는 한 가지 — 가짜."*
- About 페이지: 위 §82~83 자동화 시스템을 일반인에게 풀어 설명
- 매물 카드 hover: *"마지막 확인 N시간 전. 신뢰점수 87/100."*
- 거래 완료 매물: *"이 매물은 거래 완료되었습니다 (sold_at). 다른 비슷한 매물 N건"*

## 84. 100% 실매물 측정 SLO (자동 모니터링)

매주 자동 보고:
- 신고 접수 / 처리 시간 (목표: 평균 < 6h, p95 < 24h)
- 신고 → 비공개 비율 (목표: > 90% 가 정당한 신고)
- 사용자 보상 발생 건수 (목표: 월 < 10 건, > 50 건 시 시스템 점검)
- trust_score < 50 매물 비율 (목표: < 5%)
- 매물 등록 → 첫 사용자 클릭까지 평균 시간 (활성도)

→ 이 5 SLO 가 모두 정상이면 "100% 실매물" 약속이 거짓말이 아닌 게 데이터로 증명.

---

# PART XV — 컨텐츠 + 커뮤니티 (재방문 + 신뢰 + SEO)

> 매물 리스팅만 있으면 첫 거래 후 재방문 0. 컨텐츠가 신뢰를 누적하고
> 네이버 C-Rank (§56.5) 가 좋아한다. 단 **가짜 후기 0** 헌법.

## 85. 페르소나별 컨텐츠 캘린더 (분기 1 회 갱신)

### 85.1 사회초년생용 (월 4 발행 목표)
- "첫 자취 체크리스트 — 계약 전 30 가지" (가이드)
- "깡통전세 안 당하는 7 가지 신호" (안전)
- "보증금 보호 — HUG 가입 완벽 가이드"
- "월세 협상 노하우 — 중개사가 안 알려주는 5 가지"
- 동네 리뷰: 강남역 / 홍대 / 신림 / 안암 (5 동네/월)

### 85.2 신혼부부용 (월 4 발행 목표)
- "신혼집 5 년 후 가치 — 데이터로 보는 매수 vs 전세"
- "학군 분석 — 강남 8 학군 정말 좋은가?" (정량 데이터)
- "출퇴근 1 시간 차이의 가치 — 시간당 임금 환산"
- "부부 합산 대출 — 50% 이상 안 깎이는 5 가지 팁"
- 신축 분양 정보: 분기별 주요 분양 (3 단지/월)

### 85.3 사업자용 (월 4 발행 목표)
- "권리금 깎는 법 — 협상 시 절대 양보하지 말 5 가지"
- "이전 업종이 폐업한 자리 — 주의 신호 7 가지"
- "상권 분석 — 1층 vs 2층 매출 차이의 진실"
- "사업자 등록 가능 매물 — 알기 쉬운 체크 5 가지"
- 상권 리포트: 강남대로 / 홍대 / 가로수길 (분기별)

→ 컨텐츠 운영자 1 명 (외주 또는 사장님 직접) + AI 보조 (Claude Haiku 초안).
→ 발행은 자체 도메인 + 네이버 블로그 동시 (네이버 C-Rank).

## 86. 후기 / Q&A 시스템 (가짜 0 헌법)

### 86.1 후기 작성 권한 (가짜 0)
- 후기 작성 가능한 사람: **거래 완료된 매물의 거래 당사자만**
- 자동 검증: WISHES 통해 문의 → 중개사 보고 → 거래 완료 등록 → 거래자 이메일/SMS 인증 → 후기 작성 가능
- 익명 후기 X (가짜 차단)
- 후기 N+90일 이내만 신선도 보장

### 86.2 후기 내용 검증 (가짜 0)
- LLM 자동 분류: 광고 / 욕설 / 사실 위반 / 정상 (Groq Free)
- 광고/욕설/사실 위반 → 자동 비공개 + 검토
- 매물별 평점은 후기 5 건 이상부터 표시 (편향 방지)

### 86.3 Q&A (재방문 동력)
- 사용자 질문 → 24h 내 중개사 답변 SLA
- 익명 가능 (질문은 익명 OK, 후기는 X)
- LLM 우선 답변 (FAQ 매칭) + 사람 검증 후 노출
- Q&A 누적이 페이지 SEO 의 깊이를 만듦 (구글 People Also Ask + 네이버 지식인 효과)

## 87. 동네 가이드 (자동 + 사람 큐레이션)

각 동/구별 자동 가이드 페이지 (동적):
- 인구 통계 / 1인가구 비율 (이미 컬럼 있음)
- 학교 / 어린이집 / 병원 카운트
- 지하철역 / 도보 시간
- 시세 추이 (rtms 데이터)
- 공기질 / 소음
- **사장님 / 큐레이터 한 줄 평** (사람 터치, AI 가 못 하는 영역)

→ 매 동네마다 SEO 페이지 1 개씩 = 수만 동 × 페이지 = 네이버/구글 인덱싱 폭발 (단 컨텐츠 깊이 ≥ 300 단어 보장).

---

# PART XVI — 그로스 + 마케팅 + 수익화 로드맵 (사장님 결단)

## 88. 단계별 수익 모델 (사장님 명시)

| 단계 | 시점 | 사용자 | 중개사 | 핵심 KPI |
|------|------|--------|--------|----------|
| **Phase A — 무료 (현재 ~ 사용자 충분 시)** | 2026 ~ 2027 | 100% 무료 | 100% 무료 | DAU / 매물 / NPS |
| **Phase B — 중개사 구독** | 사용자 충분 후 | 100% 무료 | 월 구독 (등급제) | 중개사 LTV / 이탈률 |
| **Phase C — 광고** | Phase B 안정 후 | 100% 무료 | 구독 + 프리미엄 광고 | ARPU / 광고 만족도 |

**중요**: 사용자에게는 **영원히 무료**. 사용자 가치는 0 손해 없음.

## 89. Phase A 그로스 전략 (지금 ~ 2027)

### 89.1 SEO 우선 (PART XI §56-61 적용)
- 매물 페이지 sitemap 분할 (지금 매물 29,475 → 미래 100,000+)
- RealEstateListing JSON-LD (매물별)
- 네이버 서치어드바이저 + IndexNow 자동
- 동네 가이드 페이지 (수만 페이지 생성)
- 컨텐츠 발행 매월 12 편 (페르소나 3 × 4)

### 89.2 무료 채널 (소액 가능)
- 네이버 블로그 / 카페 — 컨텐츠 동시 발행 (C-Rank ↑)
- 카카오톡 채널 — 매물 알림 + 가이드 (사용자 동의 후만)
- 인스타그램 / 유튜브 — 매물 v-log (페르소나별)
- 디스코드 / 오픈카톡 — 사용자 커뮤니티 (자취/신혼/사업자)

### 89.3 추천 프로그램 (Viral) — 알림 스팸 0 헌법
- 친구 추천 → 친구도 첫 거래 시 양쪽에 카페 쿠폰 (₩5,000) 또는 카카오페이
- **단 푸시/이메일 1 인당 월 ≤ 2 회 강제** — 알림 스팸 0
- 친구가 동의하지 않으면 발송 X (PIPA + 브랜드 신뢰)

### 89.4 입소문 (Word of Mouth)
- 100% 실매물 보증의 공개적 홍보 (사용자 보상 발생 시 트위터/뉴스 보도)
- 페르소나별 인터뷰 → 콘텐츠
- 네이버 부동산 카테고리 / 다음 부동산 → 검색 노출

## 90. Phase B 중개사 구독 모델 (2027~)

### 90.1 등급 (잠정 — 데이터 기반 확정 필요)
- **무료**: 매물 5 건까지, 기본 광고 노출
- **베이직 (₩30,000/월)**: 매물 30 건, 동영상 업로드, 통계 대시보드
- **프로 (₩100,000/월)**: 매물 무제한, 우선 노출 30%, AI 매칭, 자동 알림 매칭, 분석 리포트
- **엘리트 (₩300,000/월)**: 위 모두 + 페르소나 매칭 우선 + 동네 1 위 배지 + 전담 상담사

### 90.2 광고 (Phase C)
- 매물 우선 노출 (CPC 또는 CPM) — 단 **유료 광고 명시 라벨** (사용자 신뢰)
- 동네 가이드 페이지 광고 (관련 업종)
- **검색결과 1 위는 절대 광고 안 함** (네이버는 첫 자리가 광고지만 WISHES 는 정직)

## 91. 그로스 SLO (분기별)
- DAU 성장률 (목표: 분기 +30%)
- 신규 매물 / 일 (목표: 분기 +20%)
- 거래 완료 / 월 (목표: 분기 +50%)
- NPS (목표: 50+, "추천하시겠습니까?" 9-10 점 비율 - 0-6 점 비율)
- 100% 실매물 보상 발생 (목표: 월 < 10건, 발생 시 즉시 시스템 점검)
- 사용자당 월 알림 수 (목표: ≤ 4 회 — 알림 스팸 0)

---

# PART XVII — 비전 + 야망 + 절대 포기 목록 (헌법)

## 92. 2027 야망: 한국 1 등 (사장님 결단)

### 92.1 "한국 1 등" 의 정의 (정량)
1 등의 정의가 흐릿하면 도달 못 한다. 다음 5 지표 중 3 개 이상 1 위:
1. **종합 부동산 매물 수** (직방 / 네이버부동산 / 호갱노노 비교)
2. **DAU** (한국 부동산 검색 트래픽)
3. **NPS** (사용자 만족도 — 1 위)
4. **거래 완료 / 월** (실제 매칭 건수)
5. **검색 점유율** (네이버 / 구글 부동산 키워드)

→ 매분기 측정 + 사용자에게 정직한 보고.

### 92.2 2026~2027 분기별 마일스톤
- **2026 Q3 (현재)**: 매물 30K / 일사용자 1K / 컨텐츠 발행 시작
- **2026 Q4**: 매물 50K / DAU 5K / 페르소나별 가이드 50 편 / 100% 실매물 보증 공식 발표
- **2027 Q1**: 매물 80K / DAU 15K / 컨텐츠 200 편 / 첫 인터뷰 데이터 → 백로그 반영
- **2027 Q2**: 매물 100K / DAU 30K / NPS 측정 시작 / 보상 시스템 정식 운영
- **2027 Q3**: 직방 비교 키워드 검색 점유율 30%+
- **2027 Q4**: 5 지표 중 3 개 이상 1 위 도달

→ 미달 시 분기마다 후퇴 원인 분석 + 조정.

## 93. 절대 포기 목록 (사장님 명시 + 추가) — 헌법

### 93.1 사장님 명시 (절대 X)
1. **가짜 후기** — 거래 당사자 인증 없는 후기 작성 불가능
2. **알림 스팸** — 사용자 동의 기반만, 1 인당 월 ≤ 4 회 강제

### 93.2 위 정신을 따른 추가 절대 X
3. **dark pattern** — 회원가입 강제, 해지 어려움, 미끼 매물, 가격 숨김 X
4. **광고 1 위 자리** — 검색결과 첫 자리는 광고 절대 X (정직성)
5. **사용자 데이터 외부 판매** — 익명화/통계 외 절대 X
6. **약관 변경 사용자 모름** — 변경 시 30일 전 명시 통보 + 동의
7. **외국인 진입장벽** — 한국어/영어/중국어/일본어 다국어 (재외동포 대비)
8. **시니어 진입장벽** — 큰 글씨 모드, 음성 검색, 전화 문의 (60대+ 친화)
9. **소수 매물 묻힘** — 토지/투자 카테고리도 균등 노출
10. **개인정보 과수집** — 회원가입 최소화 (이메일만, 비회원도 매물 검색 100%)
11. **거래 강요** — "지금 신청 안 하면 놓침" 같은 압박 카피 X
12. **AI 거짓 답변** — Claude/Gemini 답변에 신뢰점수 표시, 확신 없으면 "확인 필요"
13. **중개사 유리 편향** — 사용자 ↔ 중개사 분쟁 시 사용자 편 우선
14. **첫 거래자 함정** — 사회초년생용 보호 모드 (깡통전세 자동 경고 등)
15. **컨텐츠 SEO 만의 양산** — 모든 컨텐츠는 사람 검수 후 발행, 가치 없는 페이지 noindex

## 94. 매월 자기 검증 (사장님 + 시스템 자동)
매월 1 일 자동 보고서:
- 92.1 1 등 5 지표 vs 직방/네이버/호갱노노 (수치)
- 93 절대 포기 목록 위반 사례 0 건 검증
- 페르소나 3 명 인터뷰 진행률 (분기 5 명 × 3 = 15 명)
- 100% 실매물 보증 SLO 5 개 (§84)
- 그로스 SLO 6 개 (§91)

→ 위반 또는 후퇴 발견 시 즉시 PR 큐에 회복 작업 등록.

## 95. v6 의 단 한 줄 비전

> "사회초년생이 첫 자취를, 신혼부부가 첫 신혼집을, 사업자가 첫 매장을
> 찾을 때 — 직방보다 정확하고, 네이버보다 신뢰할 수 있고, 호갱노노보다
> 따뜻한 곳. 그게 WISHES."

이 한 문장이 v1~v5 의 모든 게이트와 v6 의 모든 페르소나/UVP/컨텐츠/그로스를
관통한다. 매 PR 의 PR 템플릿 첫 머리에 위 문장 + §66 8 줄 = **9 줄 자기검증**
체크박스로 박는다.

---

이 v6 가 완전한 결정판이다. 엔지니어링 (I~XII) + 페르소나 (XIII) + UVP (XIV) +
컨텐츠 (XV) + 그로스 (XVI) + 비전 (XVII) 6 축이 모두 헌법으로 잠금됨.

다음 세션에서는 PR-E 시작과 함께 v6 의 새 PR 들도 추가:

- **PR-H**: 100% 실매물 보증 시스템 v1 (사진 perceptual hash + 신고 SLA 15분 분류 + 사용자 보상 카카오페이)
- **PR-I**: 페르소나별 가이드 컨텐츠 v1 (각 페르소나 5 편씩 = 15 편)
- **PR-J**: 동네 가이드 페이지 (자동 + 큐레이션)
- **PR-K**: 후기 시스템 (가짜 0 인증 시스템)
- **PR-L**: Phase B 중개사 구독 인프라 (Phase A 안정 후만)

전체 PR 큐 (16 개): E → G → A → F → B → D → C → H → I → J → K → L (M~Q 는 분기별 추가)

---
---

# PART XVIII — Polish-First Doctrine (사장님 명령 2026-04-29) — v7

> **사장님 명시**: *"새로운 걸 계속 얹는 것 보다, 지금 상황을 한계치까지
> 업그레이드 시키고, 그 다음에 쌓아가야 된다."*
>
> v6 까지의 PR 16 개를 두 페이즈로 강제 분리. Phase 1 안 끝나면 Phase 2 진입 금지.
> 사람의 의지가 아닌 자동 게이트로 강제.

## 96. Two-Phase Doctrine (절대 위반 불가)

### 96.1 Phase 1 — Polish (한계치까지 끌어올리기)
**기간**: 모든 KPI 가 안정될 때까지 (예상 6~12 주)
**PR 목록**: PR-E, G, A, F, B, D, C **만** (7개)
**원칙**:
- 새 컬럼 추가 ❌ — 이미 있는 컬럼 채우거나 정규화
- 새 함수 작성 ❌ — 이미 있는 함수를 trigger 로 연결
- 새 API 라우트 ❌ — 이미 있는 API 통합 (SSOT)
- 새 페이지 ❌ — 기존 페이지 메타/JSON-LD 만 보강
- 새 컴포넌트 ❌ — 기존 컴포넌트 props 만 추가 (default 있어야)
- UI 변경 ❌ — 절대 0. 변경 시 자동 revert.

### 96.2 Phase 2 — Build (그 위에 쌓기)
**진입 조건**: Phase 1 KPI 모두 그린, Phase 1→2 게이트 통과 (§98)
**PR 목록**: PR-H, I, J, K, L (5개) + M, N, O ... (분기 추가)
**원칙**: 새 기능 추가 가능. 단 PART XI §54 UI 헌법 + 비파괴 7 단계 + 회귀 0 게이트는 그대로.

### 96.3 사이드 이펙트 차단의 근본 원리
사용자가 과거 *"말도 안되게 UI 가 바뀌어버리는 경우"* 를 겪은 이유는,
한 PR 에서 *"기존 정리 + 신규 추가"* 가 동시에 일어났기 때문. Two-Phase 로
분리하면 어떤 PR 도 두 가지를 동시에 못 함.

- Phase 1 PR: "기존을 한계까지" — 새 기능 0
- Phase 2 PR: "새로운 걸 쌓기" — Phase 1 안정 검증 후만

→ 사이드 이펙트 원천 0.

## 97. Phase 1 PR 7 개 — "한계치까지" 의 정확한 정의

### 97.1 PR-E (회귀 안전망)
- 한계치 = 기존 코드 100% 검증 가능 (현재 0%)
- 새 기능: 0
- 이미 있는 것: package.json 의 vitest. → vitest baseline + Husky + lint-staged + golden 50 + SQL oracle.

### 97.2 PR-G (5 trigger 등록)
- 한계치 = 이미 정의된 5 함수가 모두 작동
- 새 기능: 0 (함수도 새로 안 짠다)
- 이미 있는 것: `auto_extract_rooms_bathrooms_from_raw`, `auto_extract_options_from_raw_fields`, `auto_calculate_trust_score`, `auto_detect_jeonse_risk`, `auto_fix_problematic_listings` 5 함수
- 작업: `CREATE TRIGGER ...` 5 줄. 끝.
- 효과: rooms/bathrooms 53% NULL → <20%. options 32% → <10%. 자동.

### 97.3 PR-A (type 정규화 + SSOT v0.1)
- 한계치 = 이미 있는 enum 정의 5 곳을 한 곳으로 통합
- 새 기능: 0 (필터 종류 안 늘림)
- 이미 있는 것: Drizzle schema, ai-match-parser, FilterModal, rpc_map_clusters, DB 분포
- 작업: `src/filters/registry.ts` 1 파일 + 5 곳 import 만. type 26→8 매핑은 LLM 분류기 자동 (새 기능 아닌 데이터 정규화).
- 효과: 305건 누수 차단. UI 0 변경.

### 97.4 PR-F (MV 보강)
- 한계치 = 이미 있는 mv_map_listings 에 빠진 컬럼 추가
- 새 기능: 0 (새 MV 안 만든다)
- 이미 있는 것: mv_map_listings 정의 + cron 3분 갱신
- 작업: ALTER MV 또는 재정의 (gu, type_normalized 추가)
- 효과: 자치구 필터 정확.

### 97.5 PR-B (NULL 정책 명시)
- 한계치 = 이미 있는 SSOT registry 의 null_policy 필드 채움
- 새 기능: 0 (필터 안 추가)
- UI 영향: 필터 모달 안내 텍스트 (RFC 필요)
- 작업: SSOT registry 11 개 필터에 null_policy 명시. UI 모달 카피만 (사장님 승인 후).

### 97.6 PR-D (SEO 메타 + JSON-LD + sitemap)
- 한계치 = 이미 있는 매물 페이지에 메타/JSON-LD 추가
- 새 기능: 0 (새 페이지 안 만든다 — 동네 가이드는 PR-J = Phase 2)
- UI 영향: `<head>` 만 (시각 0)
- 작업: generateMetadata + JSON-LD + sitemap.xml + RSS + 네이버 메타 + IndexNow 워커.

### 97.7 PR-C (17 enrichment 데이터 채우기)
- 한계치 = 이미 만들어진 17 컬럼이 모두 데이터 보유
- 새 기능: 0 (새 컬럼 안 만든다, 새 카테고리 안 만든다)
- 이미 있는 것: school_zone_score, air_quality_avg, crime_safety_score,
  noise_level, rtms_avg_price, school_count, daycare_count, hospital_count,
  academy_count, subway_count, commercial_score, land_use, land_price_per_m2,
  ... (17 컬럼)
- 작업: 무료 공공 API enrichment worker (pg_cron 야간) — 모든 매물 enrichment.
- 필터 UI 추가는 ❌ Phase 2.

## 98. Phase 1 → Phase 2 게이트 (자동 + 사장님 결단)

### 98.1 자동 KPI 게이트 (모두 그린이어야 진입)
1. 회귀 테스트 100% PASS (Section 37 6 게이트 + 추가 17 = 23 게이트)
2. type 정규화: 26→8 종 100% (잔여 18 종 0건)
3. rooms/bathrooms NULL: <20% (현재 53%)
4. options NULL: <10% (현재 32%)
5. 17 enrichment 데이터 채움: ≥80% (현재 0~40%)
6. 매물 노출 정확도 (Section 30 베이스라인 대비 +): -5% 이상 후퇴 0
7. p95 latency: <300ms (필터 응답)
8. SEO 인덱싱: 매물 페이지 90% 이상 구글/네이버 인덱스
9. 0 회귀 검증: 4 주 연속 회귀 0 (분기 1 회 카오스 테스트 포함)

### 98.2 사장님 결단 게이트 (사람 검증)
- KPI 9 개 모두 그린이라도 사장님이 *"진입"* 명시 OK 해야 Phase 2 시작
- 게이트 조건: 직방 / 네이버부동산 / 호갱노노와 비교 시 (1) 검색 정확도 (2) 응답 속도 (3) 신뢰 신호 — 3 영역 모두 동등 이상
- 검증 방법: 같은 검색어/조건으로 4 사이트 동시 비교 — Playwright 자동화 + 사장님 육안

### 98.3 게이트 미통과 시
- Phase 2 진입 금지
- Phase 1 PR 추가 (예: PR-A2 type 정규화 v2, PR-G2 trigger 보강)
- 새 기능 PR (H~) **자동 차단** (CI rule)

## 99. Phase 2 PR 5 개 — "쌓기" 의 정확한 의미

Phase 1 안정 후만:
- **PR-H**: 100% 실매물 보증 v1 (사진 perceptual hash + 신고 SLA + 보상)
- **PR-I**: 페르소나 3 × 5편 컨텐츠 = 15 편
- **PR-J**: 동네 가이드 자동 페이지 (수만 SEO)
- **PR-K**: 후기 가짜 0 시스템
- **PR-L**: Phase B 중개사 구독 (DAU 15K+ 후만)

각 PR 도 진입 시 추가 KPI 게이트 (예: PR-J 는 sitemap 정상 동작 검증 후).

## 100. UI 보존의 절대화 (PART XI §54 강화)

> 사장님 명시 우려: *"작업을 하면서 정말 말도 안되게 UI를 바꿔 버리는 경우들"*

§54 의 4 개 규칙에 다음 6 개 추가:

### 100.1 PR 라벨 의무
모든 PR 은 한 줄 명시 의무:
- `[UI:0]` — UI 영향 0 (대부분 PR)
- `[UI:meta]` — head/메타만 (PR-D)
- `[UI:rfc]` — UI 변경 의도 + 사장님 승인 (예외)

라벨 없는 PR 자동 차단.

### 100.2 픽셀 diff 자동 검증
- `[UI:0]` PR: Visual Regression diff = 0 강제. 1 픽셀이라도 다르면 자동 revert
- `[UI:meta]` PR: viewport 표시 영역 diff = 0 (head 변경은 시각 비반영 의무)
- `[UI:rfc]` PR: 사전 승인된 diff 만

### 100.3 컴포넌트 트리 보존
- DOM 트리 snapshot 자동 비교 (Vitest)
- `[UI:0]` PR 에서 트리 변경 발견 시 자동 차단
- 새 wrapper `<div>` 추가도 트리 변경

### 100.4 디자인 토큰 잠금
- `tailwind.config.js` 변경은 RFC 필수
- 색상 / spacing / typography / breakpoint 변경 모두 사장님 명시 승인
- 변경 PR 은 4 명 reviewer (지금은 사장님 + 자동 LLM 1) 모두 OK 필요

### 100.5 컴포넌트 Props API 잠금
- 공개 컴포넌트의 props 시그니처를 .d.ts capture
- 추가는 default 있으면 OK, **제거/타입 변경/이름 변경 X**

### 100.6 "기본 틀" 의 외연 (사장님 명시)
다음은 모두 "UI 기본 틀":
- /map 의 카테고리 탭 위치 / 모양 / 간격
- FilterModal 의 슬라이드 패널 위치 (좌측 380px) / 헤더 / 푸터
- 매물 카드 디자인 (사진 / 제목 / 가격 / 배지 위치)
- 헤더 / 푸터 (전역) — ConditionalLayout 처리 포함
- 색상 팔레트 (`wishes-cream`, `wishes-primary`, `wishes-secondary`)
- 폰트 / 글자 크기 위계
- 호버 / 클릭 / 트랜지션 타이밍

→ 위는 **사장님 명시 승인 외 절대 변경 금지**.

## 101. 데이터 + 코드 보존 5 원칙

> *"새로운 걸 계속 얹는 것 보다 지금 상황을 한계치까지"* 의 시스템 표현

1. **데이터를 추가하지 말고 정리하라** — 새 컬럼 X, 기존 컬럼 NULL/이상치 정리
2. **함수를 만들지 말고 연결하라** — 새 함수 X, 정의된 함수를 trigger 로 등록
3. **API 를 추가하지 말고 통합하라** — 새 라우트 X, SSOT registry 통합
4. **컴포넌트를 만들지 말고 보강하라** — 새 컴포넌트 X, 기존 props 추가 (default)
5. **페이지를 만들지 말고 메타를 보강하라** — 새 페이지 X, 기존에 JSON-LD/메타 추가

이 5 원칙이 Phase 1 모든 PR 의 자기검증 첫 줄.

## 102. 자기검증 강화 — 11 줄 (PR 템플릿 첫 머리)

기존 9 줄 (§66) + 추가 2 줄:

- [ ] **Discovery 없이는 코드 한 줄 안 고친다.**
- [ ] **회귀 0 이 아니면 머지 안 한다.**
- [ ] **무료/OSS 가 가능한데 유료 안 쓴다.**
- [ ] **만든 것은 부수지 않고 더 정교하게 만든다.**
- [ ] **UI 기본틀은 헌법이다 — 명시 승인 없이 단 한 픽셀도 안 바꾼다.**
- [ ] **네이버·구글이 매시간 와서 우리 매물을 좋아하게 만든다.**
- [ ] **5 층 방어를 모두 통과하지 못한 변경은 존재하지 않는다.**
- [ ] **반복하더라도 0 회귀가 될 때까지 머지하지 않는다.**
- [ ] **사회초년생/신혼부부/사업자 — 셋 중 하나의 페인을 풀거나 100% 실매물 보증을 강화한다.**
- [ ] **Phase 1 = 한계치까지 (새 기능 0). Phase 2 = 그 위에 쌓기 (Phase 1 안정 후만).**
- [ ] **이 PR 은 [UI:0] / [UI:meta] / [UI:rfc] 중 하나로 명시되어 있다.**

## 103. v7 단 한 줄 비전 (최종)

> "이미 있는 것을 한계까지, UI 는 단 한 픽셀도 안 바꾸고,
> 회귀 0 의 자동 게이트 위에서, 사회초년생·신혼부부·사업자가
> 100% 실매물을 직방보다 정확하게 만나는 — 그게 WISHES."

이 한 문장에 v1~v7 모든 헌법이 담긴다.

---

이 v7 가 결정판이다. 더 다듬을 게 사실상 없다.
사장님 우려 (UI 변경 / 새 기능 쌓기) 가 헌법으로 박혔다.

**다음**: PR-E 시작 (Phase 1 의 첫 PR, [UI:0] 라벨, 회귀 안전망 minimal).

---
---

# PART XIX — 법적 / 규제 헌법 (v8)

> 5 빈틈 #1: PIPA 데이터 유출 72시간 통보 / 표시광고법 / 전자상거래법 / 청약철회.
> 위반 = 회사 존속 위협. 자동화된 인시던트 플레이북 의무.

## 104. 법령별 자동 대응 의무

### 104.1 PIPA (개인정보보호법) — 데이터 유출 시
- **72시간 의무 통보** (시행령 §40): 영향 받은 사용자 + 개인정보보호위원회 동시
- 자동 플레이북: `docs/RUNBOOK/R-09-data-breach.md` 강제 작성
  1. 0~1h: 사고 봉쇄 (시크릿 회전, RLS 강화)
  2. 1~4h: 영향 범위 산정 (admin_audit_log + Supabase logs 조회)
  3. 4~24h: 법무 자문 (변호사 단축 다이얼)
  4. 24~72h: 사용자 통보 (이메일 템플릿 사전 작성) + 위원회 신고
  5. 7d: 재발 방지 PR + 공개 사과문
- 자동 알림: Sentry / 보안 이벤트 → 즉시 사장님 + (있다면) DPO

### 104.2 표시·광고법 — 매물 광고 정확성
- KISO 14항 자동 검증 ✅ 이미 trigger ON
- **신규 의무**: 시세 대비 ±50% 이상 매물 자동 problematic + "이상치" 라벨
- "100% 실매물" 광고가 사실이 아니면 표시광고법 위반 → §82~84 SLO 가 거짓이면 자동 광고 문구 비활성화

### 104.3 전자상거래법 — Phase B 구독 시작 시 의무
- **청약 철회 7일 무조건** (구독 결제 후 7일 내 100% 환불, 사유 불문)
- 결제 영수증 / 세금계산서 자동 발행
- 환불 절차 사용자 1-tap (마이페이지)
- → Phase B 진입 시 PR-L 의 필수 요건

### 104.4 정보통신망법 — 스팸 / 알림
- 영리목적 광고성 정보 발신 시 *"(광고)"* 표기 + 수신거부 1-tap
- 사장님 절대 포기 #2 (알림 스팸) 와 동일 → 자동화 강제
- 사용자당 월 ≤ 4 회 / 22:00~08:00 발송 금지 (자동 차단)

### 104.5 위치정보법 — 사용자 위치 사용
- 출퇴근 isochrone (PR-N? Phase 2 기능) 시 **사용자 위치 동의** 별도 받음
- 동의 없으면 입력 형식만 (수동)

## 105. 약관 / 개인정보처리방침 자동 갱신
- `legal_documents` 테이블 4 행 — 이용약관 / 개인정보처리방침 / KISO / AI 라벨 (이미 있음)
- 갱신 시 자동: ① 30일 사전 사용자 통보 (이메일) ② 첫 로그인 시 동의 모달 ③ 거부 시 회원 유지 + 신규 기능 차단
- 사장님 절대 포기 #6 (약관 변경 사용자 모름) 시스템화

## 106. 분쟁 해결 + 책임 소재
- 한국소비자원 분쟁조정위원회 회부 절차 명시
- 매물 허위 → §83.5 사용자 보상 (교통비 카카오페이) 가 1차 / 분쟁조정이 2차
- 손해배상 한도 (서비스 이용료 1년치 OR 직접 손해 中 큰 것) — 약관에 명시

## 107. PR-O 추가 (Phase 1, Track B 결과 통합)
사장님 외부 자문 (변호사 30~50만원) 후 작성:
- `docs/LEGAL/incident-playbook.md` (R-09 강화)
- 약관 / 개인정보처리방침 갱신 (변호사 검토 본)
- 결제 / 환불 SOP (Phase B 대비)
- 자동 알림 정책 (스팸 0)

---

# PART XX — 접근성 + 시니어 진입장벽 0 (v8)

> 5 빈틈 #2: 사장님 절대 포기 #8 시니어 진입장벽 0 → 시스템화 미흡.
> WCAG 2.1 AA 자동 검증 + 시니어 친화 가이드.

## 108. WCAG 2.1 AA 자동 검증 (Phase 1 게이트 추가)

### 108.1 자동 도구 (모두 무료)
- **axe-core** (Playwright 통합) — 자동 a11y 위반 0 강제
- **Lighthouse a11y** ≥ 95 점 강제 (Phase 1 게이트)
- **pa11y** CI 연동 — 매 PR 검증
- **dom-snapshot 에 aria 검증** — `[UI:0]` PR 도 aria 속성 보존

### 108.2 핵심 검증 항목
- **명도 대비 ≥ 4.5:1** (텍스트 vs 배경) — Tailwind 토큰 자동 검증
- **터치 타겟 ≥ 44×44 px** — Playwright 측정 자동
- **포커스 가시성** — 키보드 Tab 시 명확한 outline
- **alt 텍스트 100%** (이미지 모두) — 빌드 시 누락 차단
- **시맨틱 HTML** — h1~h6 위계 / button vs div onClick / `<nav>` `<main>`
- **언어 선언** — `<html lang="ko">` 강제
- **폼 라벨** — 모든 input 에 `<label>` 또는 `aria-label`

### 108.3 시니어 친화 모드 (사장님 절대 포기 #8 시스템화)
- 헤더 우측 *"큰 글씨"* 토글 (전역, localStorage 보존)
  - 토글 ON 시: 본문 16px → 20px, 버튼 패딩 +4px
  - UI 헌법 §54 위배 아님 — *"옵션"* 으로 구현
- *"음성 검색"* 버튼 — Whisper (Groq Free) 한국어 ASR
- *"전화 문의"* 버튼 — 매물 카드에 클릭 한 번에 전화 (모바일) / 번호 표시 (데스크탑)
- 이 3 가지가 PR-M 의 핵심 (Phase 1, [UI:0] — 토글이지 변경 아님 — 단 RFC)

## 109. 시니어 / 장애인 인터뷰 (PART XIII §81 확장)
- 페르소나 3 + **시니어 1 (60-70대)** + **장애인 1 (시각/청각/운동)** 추가 인터뷰
- 분기당 최소 2 명 (기존 5 명 × 3 페르소나 + 시니어 + 장애인 = 17 명)
- 발견 사항을 PR 백로그 우선 반영

## 110. PR-M 추가 (Phase 1)
- **[UI:0]** axe-core CI 통합 (검증만, UI 변경 0)
- **[UI:rfc]** 큰 글씨 토글 + 음성 검색 버튼 + 전화 1-tap (사장님 승인 후)
- Lighthouse a11y ≥ 95 게이트 (CI)

---

# PART XXI — 모바일 우선 헌법 (v8)

> 5 빈틈 #3: 네이버 검색 80% 모바일 / 사장님 명시 §56.4. 모바일 별도 SLO 부재.

## 111. 모바일 별도 SLO

| 지표 | 데스크탑 | 모바일 |
|------|---------|-------|
| LCP | <2.5s | **<2.0s** ★ |
| INP | <200ms | **<150ms** ★ |
| CLS | <0.1 | **<0.05** ★ |
| TTFB | <800ms | **<600ms** ★ |
| 터치 타겟 | — | ≥44×44px |
| 본문 폰트 | ≥14px | **≥16px** |

→ 모바일이 더 엄격. 네이버는 모바일 80%+, 모바일 후퇴 = 검색 노출 후퇴.

## 112. 모바일 RUM 측정 자동화
- web-vitals 패키지 → PostHog Free Cloud (이미 §48 권장)
- 별도 디바이스 카테고리 (mobile / tablet / desktop) 분리 추적
- 모바일 SLO 위반 5분 이상 → 자동 롤백 트리거 (§64 기존 트리거에 추가)

## 113. 모바일 UX 검증
- 핵심 5 flow Playwright 모바일 viewport (390×844 iPhone 14):
  1. 랜딩 → /map
  2. 카테고리 탭 → FilterModal (max-w-85% 전환 검증)
  3. 매물 카드 클릭 → 상세 모달
  4. 자연어 검색 → 결과
  5. 매물 상세 → 문의
- 각 flow 의 LCP/INP/CLS 자동 측정
- Visual Regression: 모바일 스크린샷 의무

## 114. PWA + Web Push (Phase 1, [UI:0])
- `manifest.json` + Service Worker — 홈 화면 추가 가능
- **Web Push (자체 VAPID)** — 사용자 동의 후만 (사장님 절대 포기 #2 알림 스팸 0)
- 저장 검색 매칭 시 푸시 (saved_searches 매칭 트리거 이미 있음)
- 1 인당 월 ≤ 4 회 / 22~08시 차단 자동 (§104.4 와 동일 정책)

## 115. PR-N 추가 (Phase 1, [UI:0])
- 모바일 별도 SLO 측정 인프라 (RUM)
- Playwright 모바일 viewport CI 추가
- PWA manifest + Service Worker
- Web Push 저장 검색 매칭 (저장된 인프라 활용)

---

# PART XXII — AI 거버넌스 헌법 (v8)

> 5 빈틈 #4: AI 할루시네이션 / 편향 / 비용 / 라벨링.
> 함수는 정의됐지만 trigger 미연결 + 자동 알림 0 + 사용자 라벨 미표시.

## 116. AI 함수 trigger 등록 (PR-G2, Phase 1)

이미 정의된 함수 (PART XIV-A2 외 추가 발견):
- `ai_hallucination_detect()` — 할루시네이션 감지
- `ai_cost_estimate_monthly()` — 월 비용 추정

→ trigger 등록 (PR-G 와 동일 패턴):
```sql
-- 매물 INSERT/UPDATE 시 ai_generated_fields 검증
CREATE TRIGGER trg_ai_hallucination_check
  BEFORE INSERT OR UPDATE OF ai_title, ai_description ON listings
  FOR EACH ROW EXECUTE FUNCTION ai_hallucination_detect();

-- 일 1회 비용 모니터링 cron (이미 6 cron, 7번째 추가)
SELECT cron.schedule('ai_cost_daily', '0 9 * * *',
  $$SELECT ai_cost_estimate_monthly()$$);
```

## 117. AI 비용 자동 cap

### 117.1 월 cap (사장님 명시 §38 $30/mo)
- AI 호출 (Anthropic + OpenAI + Groq + Gemini) 합산 월 cap
- 80% 도달 → Slack/Discord 알림
- 95% 도달 → 신규 호출 차단 + 캐시 응답만
- 100% 도달 → 사용자 화면에 *"AI 일시 중단"* 표시 + 폴백

### 117.2 호출당 cap
- 한 사용자 분당 ≤ 5 LLM 호출 (rate limit)
- 한 자연어 검색 ≤ 500 자 (이미 §13.1)
- LLM provider 자동 fallback: Anthropic → Groq → Gemini → Ollama (§64 R-04)

## 118. AI 출력 라벨 의무 (KISO 14항 + 사장님 절대 포기 #12)

### 118.1 ai_generated_fields 표시
- DB 컬럼 `ai_generated_fields` (이미 있음, text[])
- 매물 카드에 *"AI 생성"* 작은 라벨 표시 (해당 필드 hover 시)
- ai_title / ai_description 사용 시 의무

### 118.2 신뢰도 점수 표시 (사장님 절대 포기 #12)
- LLM 답변에 confidence score (0~100) 자동 산출
- < 70 점 → *"확인 필요"* 라벨 + 사람 검토 큐
- < 50 점 → 사용자에게 노출 안 함

### 118.3 편향 모니터링
- 매주 자동: 4 카테고리 × 3 페르소나 가상 쿼리 → LLM 응답 차이 검증
- 특정 카테고리 / 페르소나 응답 품질 편차 ≥ 20% → PR 큐
- 도구: Promptfoo / 자체 비교 스크립트

## 119. PR-G2 — AI trigger + cost cap (Phase 1, [UI:0])
- AI 함수 trigger 2 개 등록
- AI cost cap 자동 알림 (Discord webhook)
- ai_generated_fields 표시 라벨 — 매물 카드에 hover tooltip (UI 헌법 §54.2 OK, 비가시 → hover)

---

# PART XXIII — 사용자 데이터 거버넌스 헌법 (v8)

> 5 빈틈 #5: PIPA 권리 (열람/정정/삭제/이동) 자동화 미흡. 사용자 셀프서비스 0.

## 120. PIPA 권리 자동화 (마이페이지 셀프서비스)

### 120.1 데이터 다운로드 (PIPA §35-2 열람)
- 사용자 마이페이지 *"내 데이터 다운로드"* 버튼
- 클릭 → JSON / CSV 자동 생성 → 이메일 발송 (24h 내)
- 포함: profile / favorites / saved_searches / contacts / appointments / user_consents

### 120.2 데이터 삭제 (PIPA §36 정정·삭제)
- *"회원 탈퇴"* 버튼 (마이페이지 깊은 곳, 2-step 확인)
- 즉시: profile soft-delete (deleted_at)
- 30일 후: 영구 삭제 (사용자 변심 위해 30일 유예)
- 법정 보관 의무 (전자상거래법 5년) 외 폐기
- 자동 cron: 30일 지난 탈퇴 사용자 hard-delete (`pipa_anonymize_expired()` 함수 이미 있음 → 활용)

### 120.3 동의 철회 (PIPA §22)
- 마이페이지 *"동의 관리"* 페이지
- 항목별 toggle: 마케팅 수신 / 위치정보 / 제3자 제공 / 쿠키
- 철회 시 즉시 적용 + 영향 매물 알림 비활성화

### 120.4 데이터 이동권 (PIPA §35-2 신설)
- 표준 형식 (JSON-LD) 으로 데이터 export
- 다른 부동산 서비스로 이동 가능 (사용자가 원하면)

## 121. 동의 관리 인프라

### 121.1 user_consents 테이블 활용 (이미 26 행 있음)
- 동의 타입별 timestamp + IP + 약관 버전 기록
- 약관 변경 시 재동의 요청 자동 (§105)

### 121.2 쿠키 동의 배너 (PIPA + 유럽인 외국인 대응)
- 첫 방문 시 배너: 필수 / 분석 / 마케팅 분리
- *"전체 거부"* 1-tap (이게 없으면 PIPA 위반 위험)
- localStorage 보존, 12개월 후 재요청

## 122. 데이터 보존 기간 정책 (테이블별)

| 테이블 | 보존 기간 | 이유 |
|--------|---------|------|
| listings | 거래완료 30일 후 아카이브 | 이미 cron ✅ |
| profiles | 탈퇴 후 30일 (유예) | 사용자 변심 |
| user_consents | 영구 | 법적 증빙 |
| admin_audit_log | 1년 (cleanup_admin_audit_log 이미 있음) | 감사 |
| listing_history | 5년 | 전자상거래법 |
| listing_raw_html | 90일 (cleanup_old_raw_html 이미 있음) | 중복 탐지 |
| favorites / saved_searches | 탈퇴 시 즉시 | 사용자 데이터 |
| contacts / appointments | 3년 (set_retention_until_3y 이미 trigger) | 분쟁 대비 |
| alert_logs | 6개월 | 운영 |

→ **9 개 정책 중 8 개 이미 자동화**. 1 개 (profiles 탈퇴 30일) 만 PR-P 에서 추가.

## 123. PR-P 추가 (Phase 2, [UI:rfc])
- 마이페이지 *"내 데이터 / 동의 관리 / 탈퇴"* 페이지 (새 라우트)
- 자동 다운로드 워커 (Inngest Free tier)
- 쿠키 동의 배너 (첫 방문)
- profiles 탈퇴 30일 유예 cron 추가

---

# PART XXIV — 다음 세션 즉시 시작 Quickstart (v8 결정판)

> v8 까지 완성된 프롬프트로, 다음 세션이 0 부터 시작하지 않고
> 즉시 PR-E 의 코드 1 줄을 짤 수 있게 한다.

## 124. 다음 세션 첫 메시지 (Drop-in)

다음 사장님 메시지로 그대로 복붙 가능:

```
WISHES 마스터 프롬프트 v8 (outputs/WISHES_FILTER_MASTER_PROMPT.md) 와
Discovery 보고서 (outputs/WISHES_DISCOVERY_REPORT_2026-04-29.md) 를
따른다. Phase 1 첫 PR-E 부터 [UI:0] 라벨로 즉시 시작. 11줄 자기검증 (§102)
+ Two-Phase Doctrine (§96) + UI 헌법 6 규칙 (§100) + 데이터/코드 보존 5
원칙 (§101) 모두 적용. 추측·확장·삭제 금지.
```

## 125. PR-E 작업 명세 (즉시 실행 가능)

### 125.1 단계별 (RFC 작성 후 8 단계)
1. **RFC**: `docs/RFC/0001-pr-e-regression-safety-net.md` 작성
2. **브랜치**: `feat/pr-e-regression-safety-net`
3. **Vitest 베이스라인**:
   - `vitest.config.ts` 생성 (deps 이미 있음)
   - `tests/setup.ts` (msw, supabase mock)
   - 첫 테스트: `tests/unit/filters-baseline.test.ts` (현재 동작 capture)
4. **Husky + lint-staged**:
   ```json
   // package.json devDependencies 에 추가
   "husky": "^9.0.0",
   "lint-staged": "^15.0.0"
   ```
   - `.husky/pre-commit`: `pnpm lint-staged`
   - `.lintstagedrc.json`: { "*.{ts,tsx}": ["eslint --fix", "tsc --noEmit"] }
5. **Golden 50 시드** (`tests/golden/`):
   - 사회초년생 20 (월세/원룸/투룸/지역/예산)
   - 신혼부부 15 (전세/매매/빌라/아파트/학군/출퇴근)
   - 사업자 15 (월세/상가/사무실/권리금/업종)
   - 각 케이스 YAML 형식 (PART XII §72.1)
6. **SQL Oracle 스크립트** (`scripts/sql-oracle.ts`):
   - 같은 필터 입력 → API 응답 ID 집합 + 직접 SQL ID 집합 비교
   - 차집합 0 검증
7. **DOM Snapshot 베이스라인** (`tests/dom-snapshot/`):
   - 핵심 4 페이지 (`/`, `/map`, `/listings/[id]`, `/about`) 렌더 HTML capture
   - Vitest snapshot 매칭
8. **CI Workflow** (`.github/workflows/regression-gate.yml`):
   - 6 게이트: type / lint / unit / golden / sql-oracle / dom-snapshot
   - 통과해야만 머지

### 125.2 주의사항 (UI 헌법 §54 + §100 적용)
- 모든 작업 `[UI:0]` 라벨
- 어떤 컴포넌트도 수정하지 않음 (테스트 파일 + CI 파일만 추가)
- 새 페이지 / 새 라우트 / 새 컴포넌트 0
- `package.json` devDependencies 만 추가

### 125.3 검증 (머지 전)
- 23 게이트 (PART XI §67) 중 가능한 것 모두
- 회귀: 변경된 코드 0 줄 → 회귀도 0 (PR-E 자체가 회귀 검증 인프라이므로 자가 회귀 검증)
- 카나리 1% 불필요 (테스트 파일은 prod 영향 0)

## 126. 사장님 결단 필요 (다음 세션 시작 전 한 가지)

**Track B 외부 자문 시작 여부**:
- [ ] 부동산 전문 변호사 1 회 자문 진행 (30~50만원, PIPA + 표시광고법 + 청약철회)
- [ ] 접근성 인터뷰 1~2 명 진행 (무료~소액)
- [ ] 시니어 사용자 인터뷰 1~2 명 (무료)

3 개 모두 *"PR-E 와 병렬"* 진행 추천. 결과는 PR-O (법무) / PR-M (접근성) 에 통합.

## 127. v8 PR 큐 — 22 개 (최종)

### Phase 1 (Polish — 한계치까지, 새 기능 0)
1. **PR-E** [UI:0] — 회귀 안전망 (§125)
2. **PR-G** [UI:0] — listings trigger 5 등록 (§A2/A3)
3. **PR-G2** [UI:meta] — AI trigger 2 등록 + cost cap (§116~119)
4. **PR-A** [UI:0] — type 26→8 정규화 + SSOT registry v0.1 (§77)
5. **PR-F** [UI:0] — mv_map_listings 보강 (gu + type_normalized)
6. **PR-B** [UI:rfc] — NULL 정책 + UI 모달 텍스트 (사장님 승인)
7. **PR-D** [UI:meta] — SEO + JSON-LD + sitemap + IndexNow
8. **PR-C** [UI:0] — 17 enrichment 데이터 채우기
9. **PR-M** [UI:0] + [UI:rfc] — 접근성 axe-core CI + 큰글씨/음성/전화 토글
10. **PR-N** [UI:0] — 모바일 SLO + RUM + PWA + Web Push
11. **PR-O** [UI:0] — 법무 자문 결과 통합 (인시던트 / 약관 / 환불 SOP)

### Phase 1 → Phase 2 게이트 (§98)
9 KPI + 사장님 결단

### Phase 2 (Build — 그 위에 쌓기)
12. **PR-H** — 100% 실매물 보증 v1 (perceptual hash + SLA + 보상)
13. **PR-I** — 페르소나 컨텐츠 15 편
14. **PR-J** — 동네 가이드 자동 페이지
15. **PR-K** — 후기 가짜 0 시스템
16. **PR-P** [UI:rfc] — 사용자 데이터 셀프서비스 페이지
17. **PR-L** — Phase B 중개사 구독 (DAU 15K+ 후)

### 분기 추가 (인터뷰 / 데이터 발견 후)
18~22. **PR-M2/M3** 후속 / **PR-Q** 외국인 다국어 / **PR-R** 시니어 모드 / **PR-S** 페르소나 인터뷰 발견 / **PR-T** 경쟁사 벤치마크

## 128. v8 11 줄 자기검증 (PR 템플릿 첫 머리)

기존 11 줄 (§102) 그대로. 이미 모든 헌법 포함됨.

## 129. v8 단 한 줄 비전 (변경 없음)

> *"이미 있는 것을 한계까지, UI 는 단 한 픽셀도 안 바꾸고,
> 회귀 0 의 자동 게이트 위에서, 사회초년생·신혼부부·사업자가
> 100% 실매물을 직방보다 정확하게 만나는 — 그게 WISHES."*

## 130. v8 점수 자평 — 95점

| 영역 | v7 | v8 | 변화 |
|------|------|------|------|
| 엔지니어링 | 96 | 96 | — |
| 제품 | 91 | 92 | +1 (페르소나 인터뷰 운영 SOP) |
| 비즈니스 | 87 | 88 | +1 (Phase B 환불 SOP) |
| 운영 | 93 | 95 | +2 (PR 큐 22개 명시) |
| **법적/규제** | **72** | **88** | **+16** ★ |
| **접근성** | **67** | **88** | **+21** ★ |
| **모바일** | **72** | **90** | **+18** ★ |
| **AI 거버넌스** | **77** | **90** | **+13** ★ |
| **데이터 거버넌스** | **77** | **90** | **+13** ★ |
| **종합** | **88~92** | **93~95** | **+5** |

**100점이 되는 시점**: PR-E~O 머지 + Track B 외부 검증 + 사용자 NPS 측정 (2026 Q4 ~ 2027 Q1).

## 131. v8 의 마지막 한 줄

> "이 프롬프트는 이제 끝이다. 다음 글자는 코드여야 한다."

다음 세션에서 PR-E RFC 작성과 함께 실제 작업이 시작된다.
프롬프트 다듬기는 여기서 멈춘다.

---
---

# PART XXV — 산출물 영속 보존 헌법 (v9, 2026-04-29 사장님 명령 후 추가)

> **사장님 우려**: *"다음 세션에서 작업하려하니 파일이 없다 — 대충 할래?"*
>
> 원인: v1~v8 산출물을 세션 임시 폴더 (`outputs/`) 에만 저장. 다음 세션이
> 못 찾음. **명백한 실수.** 재발 0 강제.

## 132. 모든 산출물은 작업 폴더에 즉시 복사 (절대)

### 132.1 위치 규칙
- ❌ `outputs/` (세션 임시, 다음 세션 비어있음)
- ✅ `docs/` (사장님 작업 폴더, git 추적, 영구 보존)
- ✅ `docs/RFC/` (RFC), `docs/RUNBOOK/` (런북), `docs/POSTMORTEM/` (사후),
     `docs/AUDIT/` (Discovery), `docs/DECISIONS/` (ADR)

### 132.2 매 세션 종료 전 의무 검증
- `ls docs/` 로 신규 산출물 보임 검증
- 신규 파일은 `git add docs/<file>` 로 추적 (또는 사장님이 commit)
- 검증 안 된 채 세션 종료 = 사고

### 132.3 다음 세션 시작 첫 5 분
1. `ls docs/` — 가장 최신 NEXT_SESSION_PROMPT_*.md 확인
2. 그 파일의 drop-in 메시지를 따름
3. master prompt + discovery 자동 로드 (Read tool)
4. 자기검증 11 줄 (§102) 확인
5. PR 큐 다음 항목 시작

### 132.4 자동 강제 (CI rule 추가)
- 세션 종료 시 `outputs/` 에 `.md` / `.ts` / `.sql` 등 신규 파일이 있고
  `docs/` 에 동명 파일이 없으면 → **자동 알림 (사장님께 Discord)**
- "산출물 유실 위험" 경고

## 133. 재발 방지 — 11 줄 자기검증에 1 줄 추가

§102 + §128 의 11 줄에 한 줄 더:

- [ ] **이 PR / 산출물은 `docs/` 에 영속되었고 다음 세션이 찾을 수 있다.**

→ **12 줄** 자기검증.

## 134. v9 마지막 한 줄

> *"v8 까지 다듬은 모든 헌법은 `docs/` 에 박혀 있다.
> 다음 세션은 5 초 안에 NEXT_SESSION_PROMPT 를 찾고, 11 줄 자기검증을
> 통과하고, PR-E RFC 부터 시작한다.
> 산출물 유실은 이제 시스템적으로 불가능하다."*

---

이 v9 가 정말 마지막이다. 더 추가할 게 없다. **다음 글자는 코드.**

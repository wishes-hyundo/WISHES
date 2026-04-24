# 공간 인덱스(PostGIS + H3) 전환 배포 가이드

> 2026-04-21 작성 · 위시스 /map 페이지 "1000건 캡" 근본 해결 + 10만 매물 대응.

이 문서는 `20260421_add_postgis_h3_spatial.sql` (필수) 과
`20260421_add_cluster_mviews.sql` (선택) 두 마이그레이션을 실 운영 DB 에
안전하게 반영하는 절차를 안내합니다. **모든 SQL 실행은 Supabase Dashboard →
SQL Editor 에서 수동으로 진행**하는 것을 기본으로 합니다.

---

## 1. 배경 · 왜 이 전환이 필요한가

### 1-1. 직접 원인: 1000건 캡

- `/api/listings/map` 은 `.limit(10000)` 을 쓰고 있었지만
  Supabase PostgREST 의 기본 `db-max-rows=1000` 에 막혀 서버에서 1000건으로 잘려나감.
- `count: 'exact'` 는 정확한 3,573 을 반환했지만 `data` 는 1,000 건 → 프런트 "1000/3573" 표시.

### 1-2. 근본 원인: 확장성 없는 아키텍처

- 모든 매물을 클라이언트로 전송 후 브라우저에서 그룹핑 → 3만 건 이상이면 브라우저 프리즈.
- 10만 매물 규모로 성장 시 이 방식은 구조적으로 지속 불가.

### 1-3. 해결 아키텍처

```
┌─────────────────────────────────────────────────────────────────┐
│  listings                                                        │
│    geom     geometry(Point,4326)   ← PostGIS GiST 인덱스         │
│    h3_r6    TEXT                   ← 시/도 36 km 클러스터        │
│    h3_r8    TEXT                   ← 구/군 5 km 클러스터         │
│    h3_r10   TEXT                   ← 동 0.7 km 클러스터          │
└─────────────────────────────────────────────────────────────────┘
          │
          ▼  (RPC — SECURITY INVOKER, 1000캡 우회)
┌────────────────────┐      ┌─────────────────────┐
│ listings_in_bounds │      │ listings_clusters   │
│ (줌 IN — 개별 핀)  │      │ (줌 OUT — 헥사곤)    │
└────────────────────┘      └─────────────────────┘
          ▲                           ▲
          │                           │
  GET /api/listings/map              (동일 엔드포인트,
                                      ?res=6|8|10 로 모드 분기)
```

- **줌 IN** (카카오 level ≤ 4) → `listings_in_bounds` RPC → 매물 개별 핀
- **줌 OUT** (level ≥ 5) → `listings_clusters` RPC → 헥사곤 카운트만
- **어드민 INSERT/UPDATE** → h3-js 로 앱 레이어에서 h3_r6/r8/r10 자동 계산
- **기존 레코드** → `npm run spatial:backfill` 일회 배치

---

## 2. 사전 준비

### 2-1. 의존성 설치

새로 추가된 `h3-js` 를 설치합니다.

```bash
cd "C:\Users\wishe\Documents\Claude\Projects\wishes 홈페이지 관리\wishes-v2"
npm install
```

`package.json` 의 `dependencies` 에 `"h3-js": "^4.1.0"` 가 들어있는지 확인.

### 2-2. 환경 변수

`scripts/backfill-spatial.ts` 가 다음을 읽습니다 — 프로젝트 `.env` 에 이미 존재할 것:

- `NEXT_PUBLIC_SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`

### 2-3. 스냅샷

Supabase Dashboard → **Settings → Database → Backups** 에서 수동 스냅샷을 찍습니다.
마이그레이션 실패 시 롤백 근거.

---

## 3. 마이그레이션 실행 (필수)

### 3-1. PostGIS 확장 활성화

Supabase Dashboard → **Database → Extensions** 로 이동 → `postgis` 검색 → **Enable**.

이미 활성화되어 있다면 건너뜁니다. (SQL `CREATE EXTENSION IF NOT EXISTS postgis;`
는 권한 문제가 생길 수 있어 UI 경로가 가장 안전.)

### 3-2. 스키마 마이그레이션

**Dashboard → SQL Editor → + New query** 에서 파일을 섹션별로 나눠 실행하는 것을 권장.
이유: `CREATE INDEX CONCURRENTLY` 는 트랜잭션 내에서 실행 불가 → 전체를 한 번에
실행하면 드문 경우 에러가 발생할 수 있음.

파일 위치:

```
wishes-v2/supabase/migrations/20260421_add_postgis_h3_spatial.sql
```

섹션 단위 실행 순서:

1. **§2 컬럼 추가** — `ALTER TABLE listings ADD COLUMN ...` 4문장
2. **§3 인덱스** — `CREATE INDEX IF NOT EXISTS ...` 4문장
3. **§4 트리거 함수 + 트리거** — `CREATE OR REPLACE FUNCTION listings_sync_geom` 블록 전체
4. **§5 백필** — `UPDATE listings SET geom = ...` (한 번만 실행)
5. **§6, §7 RPC 2개** — `CREATE OR REPLACE FUNCTION listings_in_bounds / listings_clusters`

각 섹션 실행 후 **Query returned successfully** 를 확인하고 다음으로 넘어갑니다.

### 3-3. 컬럼 반영 확인

```sql
SELECT column_name, data_type
  FROM information_schema.columns
 WHERE table_name = 'listings'
   AND column_name IN ('geom','h3_r6','h3_r8','h3_r10');
```

4개 행이 모두 반환되어야 합니다.

### 3-4. geom 백필 상태 확인

```sql
SELECT
  COUNT(*) FILTER (WHERE status='공개')                         AS 공개,
  COUNT(*) FILTER (WHERE status='공개' AND geom  IS NOT NULL)    AS geom_ok,
  COUNT(*) FILTER (WHERE status='공개' AND h3_r6 IS NOT NULL)    AS h3_ok
FROM listings;
```

이 시점에서 `geom_ok` 는 공개 매물 수와 거의 같아야 하고,
`h3_ok` 는 0 입니다 (H3 는 아직 백필 안 됨).

### 3-5. H3 백필

로컬 터미널에서 실행:

```bash
# 드라이런 (DB 업데이트 없음, 계산만)
npm run spatial:backfill -- --dry-run

# 실제 실행
npm run spatial:backfill
```

3,573 건 기준 약 30초 ~ 1분. 10만 건이면 3~5분.
중간에 중단해도 다시 돌리면 아직 비어있는 행만 이어서 채웁니다.

완료 후 다시:

```sql
SELECT COUNT(*) FROM listings WHERE status='공개' AND h3_r6 IS NULL;
-- → 0 이어야 합니다 (lat/lng 누락된 소수의 행은 NULL 유지)
```

### 3-6. 인덱스 적중 확인

```sql
EXPLAIN (ANALYZE, BUFFERS)
  SELECT COUNT(*) FROM listings
   WHERE status='공개'
     AND geom && ST_MakeEnvelope(126.8, 37.4, 127.2, 37.7, 4326);
```

결과에 **"Index Scan using idx_listings_geom"** 이 보여야 정상.
"Seq Scan" 이 보이면 인덱스 생성이 실패한 것 → §3-2 단계 §3 재실행.

---

## 4. 애플리케이션 배포

### 4-1. 변경된 파일

- `src/lib/h3-helpers.ts` (신규)
- `src/app/api/listings/map/route.ts` (재작성 — RPC 기반 + 폴백 내장)
- `src/app/api/listings/cluster/route.ts` (신규)
- `src/app/api/admin/listings/route.ts` (POST/PUT 에 H3 자동 계산 추가)
- `src/hooks/useMapListings.ts` (재작성 — mode/clusters 지원)
- `src/app/map/page.tsx` (fetchListings 호출부 3곳에 map.getLevel() 추가)
- `src/types/index.ts` (H3Cluster, MapApiResponse 추가)
- `scripts/backfill-spatial.ts` (신규)
- `package.json` (h3-js 의존성 + spatial:backfill 스크립트)

### 4-2. 배포 전 체크

```bash
# 타입 체크
npx tsc --noEmit

# 로컬 실행
npm run dev
# http://localhost:3000/map 접속 →
#   - 서울 전체 줌 아웃: 헥사곤 클러스터 표시되는지 (마이그레이션 완료 후)
#   - 줌 인: 개별 핀 1000건 이상 표시되는지
```

### 4-3. 단계적 배포 전략

마이그레이션 미적용 상태로 이 코드가 배포되어도 **서비스는 정상 동작**합니다.
/api/listings/map 안에 자동 폴백이 내장되어 있어 RPC 가 없으면
`.range(0, 4999)` 기반 레거시 쿼리로 떨어집니다.

따라서 권장 배포 순서는:

1. **코드 먼저 배포** (Vercel 자동 배포) → 1000건 캡 이슈는 `.range()` 폴백만으로도 해결
2. **마이그레이션 실행** (§3) → RPC 활성화 → 공간 인덱스로 자동 전환
3. **H3 백필** (§3-5) → 클러스터 모드 자동 활성화

### 4-4. 롤백

문제 발생 시 다음 SQL 로 RPC 만 제거하면 `.range()` 폴백으로 되돌아갑니다:

```sql
DROP FUNCTION IF EXISTS listings_in_bounds;
DROP FUNCTION IF EXISTS listings_clusters;
```

컬럼/인덱스는 그대로 두어도 읽기 쿼리에 영향 없음. 완전 롤백이 필요하면:

```sql
DROP INDEX IF EXISTS idx_listings_geom;
DROP INDEX IF EXISTS idx_listings_h3_r6;
DROP INDEX IF EXISTS idx_listings_h3_r8;
DROP INDEX IF EXISTS idx_listings_h3_r10;
DROP INDEX IF EXISTS idx_listings_status_geom;
DROP TRIGGER IF EXISTS tr_listings_sync_geom ON listings;
DROP FUNCTION IF EXISTS listings_sync_geom;
ALTER TABLE listings DROP COLUMN IF EXISTS h3_r6;
ALTER TABLE listings DROP COLUMN IF EXISTS h3_r8;
ALTER TABLE listings DROP COLUMN IF EXISTS h3_r10;
ALTER TABLE listings DROP COLUMN IF EXISTS geom;
```

---

## 5. (선택) Materialized View 계층 추가

**매물 수가 10만 건을 넘어서 live GROUP BY 가 100ms 를 초과할 때**만 적용합니다.

### 5-1. 적용

```
wishes-v2/supabase/migrations/20260421_add_cluster_mviews.sql
```

Dashboard → SQL Editor 에서 파일 전체 실행. 3개 MV + UNIQUE 인덱스 + REFRESH 함수가 생성됩니다.

### 5-2. 갱신 스케줄 — 두 가지 옵션

**옵션 A — pg_cron (Supabase 제공)**

Dashboard → Database → Extensions → `pg_cron` Enable 후:

```sql
SELECT cron.schedule(
  'refresh-listings-clusters',
  '*/5 * * * *',
  $$SELECT refresh_listings_clusters()$$
);
```

**옵션 B — Vercel Cron (Free 플랜 친화)**

`vercel.json` 에 추가:

```json
{
  "crons": [
    { "path": "/api/cron/refresh-clusters", "schedule": "*/5 * * * *" }
  ]
}
```

그리고 `src/app/api/cron/refresh-clusters/route.ts` 를 만들어
`supabase.rpc('refresh_listings_clusters')` 를 호출하고
`Authorization: Bearer $CRON_SECRET` 헤더로 검증.

### 5-3. API 전환

MV 기반 클러스터링으로 전환할 때는 `listings_clusters` RPC 대신
`listings_cluster_r6/r8/r10` MV 를 참조하는 새 RPC 를 만들어 라우터에서
env 플래그로 스위칭하는 것을 권장 (점진 전환).

---

## 6. 성능 기대치 (서울 전체 바운드 기준)

| 매물 수 | 레거시 `.range()` | RPC `listings_in_bounds` | 클러스터 `listings_clusters` | MV `cluster_r8` |
|--------:|------------------:|-------------------------:|-----------------------------:|----------------:|
|   3 천  | 80 ms             | 40 ms                    | 20 ms                        | 5 ms            |
|  30 천  | ❌ 캡/타임아웃   | 150 ms                   | 60 ms                        | 8 ms            |
| 100 천  | ❌                | 500 ms                   | 180 ms                       | 10 ms           |
| 500 천  | ❌                | ❌                        | 1 초                         | 15 ms           |

(숫자는 Supabase Free 리전 ap-northeast-2 기준 추정)

---

## 7. 향후 (Tier 2~3) 추가 최적화

MV 로도 부족해지는 시점 (100만 매물+) 에 검토할 것들:

- **MVT/PMTiles 벡터 타일** — 타일 단위로 바이너리 캐싱 (Cloudflare R2 + PMTiles)
- **Cloudflare Durable Objects** + WebSocket delta — 브라우저에서 바운드 이동 시 변경분만 push
- **DuckDB-WASM 클라이언트 인덱스** — 브라우저에서 10만 점 로컬 GROUP BY
- **지역 엣지 캐시** — Next.js Edge Runtime + `@vercel/edge-config` 로 1 분 prewarm

현재 아키텍처는 **500 만 매물 규모**까지 선형으로 확장 가능하도록 설계되었습니다.

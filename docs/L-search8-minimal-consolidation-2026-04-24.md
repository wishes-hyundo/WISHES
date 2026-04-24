# L-search8 — /api/admin/listings 호출 경로 minimal 단일화 + RPC 제안

**세션:** 2026-04-24 세션 4
**컨텍스트:** 세션 3 핸드오프의 남은 이슈 — "Cache key 관리", "/api/admin/listings non-minimal 경로" 정리.

---

## 1. 이미 배포된 변경 (L-search8 commit)

### 1-1. `src/app/api/admin/listings/route.ts`
- `selectFields` 에 `'updated_at'` 추가 — `admin/listings` 페이지의 "수정됨" 배지용
- `cacheKey` 를 `listings-minimal-v7` → `listings-minimal-v8` 로 bump (schema 변경 시 필수)
- v7 잔재 0건 확인

### 1-2. `src/app/admin/page.tsx` (dashboard)
- `adminFetch('/api/admin/listings', …)` → `adminFetch('/api/admin/listings?fields=minimal', …)`
- 이 페이지가 쓰는 모든 컬럼 (id, title, address, area_m2, bathrooms, created_at, deal, deposit, floor_current, floor_total, monthly, price, rooms, status, type) 모두 minimal 에 포함됨 — 안전.

### 1-3. `src/app/admin/listings/page.tsx`
- 같은 minimal 전환.
- 이 페이지가 쓰는 `updated_at` 이 1-1 에서 minimal 에 추가되었으므로 안전.

### 왜 중요한가
세션 3 핸드오프 미해결 이슈 #8 — non-minimal 경로가 cold-start 에서 timeout 위험:
> 현재 `.select('*, listing_images(*)')` JOIN 사용. 자주 호출 안 되지만 같은 문제 재현 가능

실제로 이 경로를 호출하던 두 GET 콜사이트 (admin 대시보드·listings 페이지) 가 있었으며, 6,204행 × 107 컬럼 × listing_images JOIN 을 PAGE_SIZE 1000 sequential 로 pagination 하는 구조였다. minimal 로 전환함으로써:
- `unstable_cache` 60초 공유
- sequential IN 쿼리로 이미지 분리 fetch (L-search7 기법)
- ETag + 304 Not Modified
- `maxDuration = 30s`
- 불필요 컬럼 제거

...모든 최적화를 공유받게 된다.

---

## 2. 다음 단계 (권장) — RPC 단일 쿼리

현재 minimal 경로도 7회 sequential pagination (PAGE_SIZE 1000) + listing_images IN 쿼리 → cold ~5s.

이를 RPC 함수 1번 호출로 축소하면 cold 1-2s 기대.

### 2-1. Supabase SQL 제안

```sql
-- L-search9 후보: admin listings minimal RPC 단일화
-- 실행 권장 시점: 다음 세션 또는 사용자 검증 후

CREATE OR REPLACE FUNCTION public.rpc_admin_listings_minimal(
  p_scope_uid uuid DEFAULT NULL,
  p_limit     int  DEFAULT 10000
)
RETURNS TABLE (
  id bigint,
  title text,
  type text,
  deal text,
  status text,
  deposit numeric,
  monthly numeric,
  price numeric,
  maintenance_fee numeric,
  maintenance_includes text,
  area_m2 numeric,
  area_supply_m2 numeric,
  floor_current text,
  floor_total text,
  rooms int,
  bathrooms int,
  direction text,
  address text,
  address_detail text,
  dong text,
  building_name text,
  lat double precision,
  lng double precision,
  available_date date,
  built_year text,
  parking bool,
  elevator bool,
  pet bool,
  balcony bool,
  full_option bool,
  loan_available bool,
  business_type text,
  goodwill_fee numeric,
  station_name text,
  station_distance text,
  created_at timestamptz,
  created_by uuid,
  last_verified_at timestamptz,
  source_site text,
  updated_at timestamptz,
  first_image_url text
)
LANGUAGE sql STABLE AS $$
  SELECT
    l.id, l.title, l.type, l.deal, l.status,
    l.deposit, l.monthly, l.price,
    l.maintenance_fee, l.maintenance_includes,
    l.area_m2, l.area_supply_m2,
    l.floor_current, l.floor_total,
    l.rooms, l.bathrooms, l.direction,
    l.address, l.address_detail, l.dong,
    l.building_name,
    l.lat, l.lng,
    l.available_date, l.built_year,
    l.parking, l.elevator, l.pet, l.balcony,
    l.full_option, l.loan_available,
    l.business_type, l.goodwill_fee,
    l.station_name, l.station_distance,
    l.created_at, l.created_by,
    l.last_verified_at, l.source_site,
    l.updated_at,
    (
      SELECT url
      FROM listing_images li
      WHERE li.listing_id = l.id
      ORDER BY sort_order ASC NULLS LAST
      LIMIT 1
    ) AS first_image_url
  FROM listings l
  WHERE p_scope_uid IS NULL OR l.created_by = p_scope_uid
  ORDER BY l.created_at DESC
  LIMIT p_limit;
$$;

-- service_role 만 실행 가능하게 (ANON 차단)
REVOKE EXECUTE ON FUNCTION public.rpc_admin_listings_minimal FROM anon, authenticated;
GRANT  EXECUTE ON FUNCTION public.rpc_admin_listings_minimal TO service_role;
```

### 2-2. route.ts 사용 전환 (L-search9 배포 시)

```ts
// sequential pagination + IN 쿼리 블록을 교체
const { data: allData } = await supabase.rpc('rpc_admin_listings_minimal', {
  p_scope_uid: scope === 'mine' ? scopeUid : null,
  p_limit: 10000,
});
```

기대 효과:
- 7 round-trips → 1 round-trip
- Cold ~5s → ~1.5s
- cacheKey bump: v8 → v9

### 2-3. 위험 요소

- `rpc_admin_listings_minimal` 의 subquery (`SELECT url FROM listing_images ... LIMIT 1`) 가 per-row lateral 이므로 `listing_images (listing_id, sort_order)` composite index 가 필수. 현재 인덱스 확인 필요:
  ```sql
  SELECT indexname, indexdef FROM pg_indexes
  WHERE tablename='listing_images';
  ```
  없으면:
  ```sql
  CREATE INDEX IF NOT EXISTS idx_listing_images_lid_sort
    ON listing_images (listing_id, sort_order);
  ```

- RPC 는 Supabase PostgREST 가 1 statement 당 60s 기본 timeout. 문제없음.

---

## 3. 모니터링 제안 (세션 3 핸드오프 LOW #7 대응)

unstable_cache poisoned 감지용 가벼운 metric:
- `/api/admin/listings?fields=minimal` 응답에 `X-Cache-Generated-At: <ISO>` 헤더 추가
- 프론트에서 > 60초 초과면 콘솔 경고
- 현재 구현된 L-search7 의 `allData.length < 6000` 의심 상황 로그와 연계 가능

---

## 4. 남은 이슈 (다음 세션 인수인계)

| 이슈 | 우선 | 비고 |
|---|---|---|
| MV/RPC 로 cold 단축 | M | 본문 2절 SQL 실행 필요 |
| 모바일 실기기 검수 | M | 사용자 피드백 대기 |
| stale crawl 403 브라우저-scale 측정 | L | Worker log 없이는 정확 불가. intersection observer 로 실패율 집계 가능 |
| content.js size (701KB) | L | 분할 배포 리팩터링 여지 |
| docs/ 삭제 상태 파일 정리 | L | 사용자 결정 대기 |

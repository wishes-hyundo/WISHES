# L-rls1 — Supabase RLS 전환 정책

_Owner: 보안 / Date: 2026-04-23 / Status: draft_

## 배경

현재 wishes-v2 는 모든 DB 접근을 **service_role_key** 로 수행한다.
즉 RLS 를 전혀 활용하지 않고, API route 레이어에서 권한 체크 (L-sec112 IDOR
+ L-sec136 PATCH 등) 로 방어한다.
문제점:

- service_role 키가 한번만 유출되면 RLS 안전망이 없어 전 레코드 탈취 가능
- 매번 새로운 route 를 추가할 때마다 IDOR 가드를 수동 심어야 함 (L-sec91/94/96/112/136 전부 사후 발견)
- realtime subscription / direct PostgREST 호출 은 사실상 사용 불가

## 목표

1. anon key 로도 안전한 핵심 4테이블 RLS 활성화: `listings`, `admin_users`, `contacts`, `appointments`
2. 공개 조회 경로 (/api/listings 등) 는 `anon` role 로 전환 → service_role 키 노출 표면 축소
3. admin 뮤테이션은 `authenticated` role + `admin_users` lookup 정책
4. SSR 페이지는 anon 으로 읽기 (status='공개' + 지정 컬럼만)

## 정책 초안

### listings

```sql
ALTER TABLE listings ENABLE ROW LEVEL SECURITY;

-- 공개 읽기 (SSR + 공개 API)
CREATE POLICY listings_public_read ON listings
  FOR SELECT
  USING (status = '공개');

-- agent 본인 매물 읽기 (관리자 포털 + scope=mine)
CREATE POLICY listings_owner_read ON listings
  FOR SELECT
  USING (auth.uid() = created_by);

-- agent 본인 매물 쓰기
CREATE POLICY listings_owner_write ON listings
  FOR UPDATE USING (auth.uid() = created_by)
  WITH CHECK (auth.uid() = created_by);

CREATE POLICY listings_owner_delete ON listings
  FOR DELETE USING (auth.uid() = created_by);

CREATE POLICY listings_owner_insert ON listings
  FOR INSERT WITH CHECK (auth.uid() = created_by);

-- master / superadmin / crawler_bridge 는 모든 행 (별도 role SQL 함수)
CREATE OR REPLACE FUNCTION is_admin_unlimited() RETURNS boolean
  LANGUAGE sql STABLE SECURITY DEFINER AS $$
    SELECT EXISTS (
      SELECT 1 FROM admin_users
      WHERE id = auth.uid()
      AND role IN ('master', 'superadmin', 'crawler_bridge')
    );
  $$;

CREATE POLICY listings_admin_all ON listings
  USING (is_admin_unlimited())
  WITH CHECK (is_admin_unlimited());
```

### admin_users

```sql
ALTER TABLE admin_users ENABLE ROW LEVEL SECURITY;

-- 본인 행만 읽기
CREATE POLICY admin_users_self_read ON admin_users
  FOR SELECT USING (auth.uid() = id);

-- master / superadmin 는 전체 읽기/쓰기
CREATE POLICY admin_users_admin_all ON admin_users
  USING (EXISTS (SELECT 1 FROM admin_users WHERE id=auth.uid() AND role IN ('master','superadmin')))
  WITH CHECK (EXISTS (SELECT 1 FROM admin_users WHERE id=auth.uid() AND role IN ('master','superadmin')));

-- anon 으로는 읽기 불가 (정책 미존재 == deny)
```

### contacts

```sql
ALTER TABLE contacts ENABLE ROW LEVEL SECURITY;

-- 공개 INSERT (문의 폼) - anon 허용, 본인 행 조회 불가
CREATE POLICY contacts_public_insert ON contacts
  FOR INSERT WITH CHECK (true);

-- 해당 listing 의 owner 만 읽기/수정
CREATE POLICY contacts_listing_owner_read ON contacts
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM listings l WHERE l.id = contacts.listing_id AND l.created_by = auth.uid())
    OR is_admin_unlimited()
  );

CREATE POLICY contacts_listing_owner_update ON contacts
  FOR UPDATE USING (
    EXISTS (SELECT 1 FROM listings l WHERE l.id = contacts.listing_id AND l.created_by = auth.uid())
    OR is_admin_unlimited()
  )
  WITH CHECK (true);
```

### appointments

```sql
ALTER TABLE appointments ENABLE ROW LEVEL SECURITY;

CREATE POLICY appointments_public_insert ON appointments
  FOR INSERT WITH CHECK (true);

CREATE POLICY appointments_listing_owner_all ON appointments
  USING (
    EXISTS (SELECT 1 FROM listings l WHERE l.id = appointments.listing_id AND l.created_by = auth.uid())
    OR is_admin_unlimited()
  )
  WITH CHECK (
    EXISTS (SELECT 1 FROM listings l WHERE l.id = appointments.listing_id AND l.created_by = auth.uid())
    OR is_admin_unlimited()
  );
```

## Next.js 측 변경

현재 `src/lib/supabase.ts` 는 createClient(url, SERVICE_ROLE_KEY). RLS 전환 후:

1. `createAnonClient()` — anon key, 공개 SSR/API 용 (status='공개' 만 보임)
2. `createUserClient(accessToken)` — 사용자 JWT 주입, agent 본인 매물/상담 접근용
3. `createServiceClient()` — 기존 service_role. **오직 admin 배치/크론에서만 사용**

```ts
export function createUserClient(accessToken: string) {
  return createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    global: { headers: { Authorization: `Bearer ${accessToken}` } },
    auth: { persistSession: false },
  });
}
```

## 롤아웃 (블루-그린)

Phase 0 — 관찰

- `ALTER TABLE ... ENABLE ROW LEVEL SECURITY;` 대신 `FORCE ROW LEVEL SECURITY`
  를 스테이징에서 먼저 적용하고 fallback log 2주

Phase 1 — listings 공개 읽기만 anon 으로

- /api/listings (공개), /api/listings/[id] (status='공개' 만)
- SSR /listings 페이지
- 실패율 Sentry (L-observe1) 로 모니터링

Phase 2 — admin 포털 authenticated 전환

- /api/admin/listings (GET 에서 scope=mine) 을 createUserClient 로 전환
- service_role 은 admin 뮤테이션 (POST/PUT/DELETE) 에만

Phase 3 — contacts/appointments 전환

- 공개 POST 은 anon (정책 허용)
- admin GET/PATCH 은 createUserClient

Phase 4 — service_role 사용처 전수 감사

- grep 'SUPABASE_SERVICE_ROLE_KEY' → cron/배치 외 전부 제거 목표
- Vercel 에서 Runtime env 로만 노출 (Build env 에서 제거)

## 리스크

- RLS 토글 시 status != '공개' 매물이 SSR 에서 사라짐 → 관리자용 프리뷰는 authenticated 로 우회
- crawler_bridge 는 JWT 발급 플로우가 없음 → service_role 유지하되 IP 화이트리스트 강화
- Supabase functions/트리거 는 SECURITY DEFINER 로 RLS 우회 확인 필요
- `created_by` 가 NULL 인 레거시 매물 존재 → backfill script 필요 (master 업로드분은 master uid 로)

## 체크리스트

- [ ] `is_admin_unlimited()` helper 함수 작성
- [ ] 4테이블 RLS + 정책 SQL (staging 적용 2주)
- [ ] `createUserClient` 팩토리 추가
- [ ] /api/listings 공개 GET anon 전환 (스모크)
- [ ] SSR /listings, /listings/[id] anon 전환
- [ ] /api/admin/listings scope=mine authenticated 전환
- [ ] contacts/appointments 전환
- [ ] service_role 사용처 감사 → cron 만 남기
- [ ] created_by NULL backfill
- [ ] runbook: RLS 정책 롤백 절차


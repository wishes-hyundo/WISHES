-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
-- short_urls — wishes.me/xxx 단축 URL 저장소
-- (v7 핸드오프 §5 URL 딥링크 — Phase 1 Backend)
--
-- 설계
--   code        base62 6~8자리 unique. 충돌 시 8자리로 재시도.
--   target_url  공유된 전체 경로 (scheme+host 제외, 예: /map?cat=...)
--   context     'map' | 'search' | 'admin'  — 어느 페이지에서 생성됐는지
--   scope       'all' | 'mine' | null       — (중개인) 내매물 필터링 스코프
--   created_by  nullable(비로그인 허용), auth.users.id 참조
--   created_at  timestamptz
--   expires_at  nullable — null = 영구, default 90d
--   clicks      해석 시 +1 (비동기 업데이트, 누락 허용)
--   last_clicked_at  nullable
--
-- 인덱스
--   code 는 PRIMARY KEY UNIQUE. BTREE 로 O(log n) 역방향 조회.
--   created_at DESC  — 최근 생성 내역 페이지네이션용.
--
-- RLS
--   anon/auth 모두 SELECT 허용(code로 조회해야 하므로).
--   INSERT 는 anon 허용 (비로그인 단축URL). clicks 만 service_role update.
-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

create table if not exists public.short_urls (
  code          text primary key check (length(code) between 4 and 12),
  target_url    text not null check (length(target_url) <= 2048),
  context       text check (context in ('map','search','admin','other')),
  scope         text check (scope in ('all','mine')),
  created_by    uuid references auth.users(id) on delete set null,
  created_at    timestamptz not null default now(),
  expires_at    timestamptz default (now() + interval '90 days'),
  clicks        integer not null default 0,
  last_clicked_at timestamptz
);

create index if not exists short_urls_created_at_idx
  on public.short_urls (created_at desc);

create index if not exists short_urls_created_by_idx
  on public.short_urls (created_by)
  where created_by is not null;

-- ─── RLS ─────────────────────────────────────────
alter table public.short_urls enable row level security;

-- anon/auth: 조회 허용 (단축코드로 역검색)
drop policy if exists "short_urls: public read" on public.short_urls;
create policy "short_urls: public read"
  on public.short_urls
  for select
  using (expires_at is null or expires_at > now());

-- anon/auth: 삽입 허용 (비로그인 단축URL 공유 허용)
drop policy if exists "short_urls: public insert" on public.short_urls;
create policy "short_urls: public insert"
  on public.short_urls
  for insert
  with check (true);

-- auth: 본인 것만 삭제
drop policy if exists "short_urls: owner delete" on public.short_urls;
create policy "short_urls: owner delete"
  on public.short_urls
  for delete
  using (created_by = auth.uid());

-- clicks 업데이트는 service_role 만 (RLS bypass)
-- (RLS 는 service_role 에 적용 안 됨 — 별도 정책 불필요)

-- ─── clicks 증분 RPC (RLS 우회, service_role 에서만 호출) ──
create or replace function public.increment_short_url_clicks(p_code text)
returns void
language sql
security definer
set search_path = public
as $$
  update public.short_urls
     set clicks = clicks + 1,
         last_clicked_at = now()
   where code = p_code;
$$;

revoke all on function public.increment_short_url_clicks(text) from public;
grant execute on function public.increment_short_url_clicks(text) to service_role;

-- ─── 주석 ────────────────────────────────────────
comment on table  public.short_urls             is 'wishes.me/xxx 단축 URL 저장소 (v7 §5)';
comment on column public.short_urls.code        is 'base62 6자리 공개 코드 (충돌 시 8자리)';
comment on column public.short_urls.target_url  is '리다이렉트 대상 경로 (예: /map?cat=residence&deals=전세)';
comment on column public.short_urls.context     is '생성 페이지 컨텍스트 — analytics 용';
comment on column public.short_urls.scope       is '(중개인) 내매물 필터 스코프 — v7 §4 scope 전파';
comment on column public.short_urls.expires_at  is 'NULL=영구, default now()+90d';
comment on function public.increment_short_url_clicks(text) is '리다이렉트 시 clicks+1 (fire-and-forget)';

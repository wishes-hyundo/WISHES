-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
-- T5-7: 저장된 검색 / 매물 알림 구독
--   고객이 검색 조건을 저장해두면 매칭되는 신규 매물 등록 시
--   이메일(+선택적 SMS)로 알림을 보내는 기능.
-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

create table if not exists public.saved_searches (
  id              bigserial primary key,

  -- 구독자 정보
  name            text,
  email           text not null,
  phone           text,

  -- 검색 조건 (단순 컬럼으로 분리 — 필터링 쿼리 효율)
  deal            text,               -- '전세' | '월세' | '매매' | null(=무관)
  type            text,               -- '원룸' | '아파트' | ... | null
  gu              text,               -- 자치구
  dong            text,               -- 법정동

  -- 예산 (만원)
  min_price       integer,
  max_price       integer,
  min_deposit     integer,
  max_deposit     integer,
  max_monthly     integer,

  -- 면적 (㎡)
  min_area_m2     numeric(6,2),
  max_area_m2     numeric(6,2),

  -- 보조 필터 JSON (방 수, 주차 여부 등 미래 확장)
  filters_extra   jsonb default '{}'::jsonb,

  -- 구독 상태
  active          boolean default true,
  unsub_token     text not null unique,     -- 구독해지 링크용 랜덤 토큰

  -- 발송 추적
  last_notified_at  timestamptz,
  total_sent        integer default 0,

  -- 메타
  source          text,                      -- 어떤 페이지에서 가입했는지 (/listings, /map, /chat 등)
  created_at      timestamptz default now(),
  updated_at      timestamptz default now()
);

create index if not exists idx_saved_searches_active        on public.saved_searches (active) where active = true;
create index if not exists idx_saved_searches_email         on public.saved_searches (email);
create index if not exists idx_saved_searches_unsub_token   on public.saved_searches (unsub_token);
create index if not exists idx_saved_searches_deal_type     on public.saved_searches (deal, type);
create index if not exists idx_saved_searches_gu_dong       on public.saved_searches (gu, dong);

-- updated_at 자동 갱신 트리거
create or replace function public.set_saved_searches_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

drop trigger if exists trg_saved_searches_updated_at on public.saved_searches;
create trigger trg_saved_searches_updated_at
  before update on public.saved_searches
  for each row execute function public.set_saved_searches_updated_at();

-- RLS — 공개 쓰기(구독 신청)만 허용, 읽기는 admin service_role
alter table public.saved_searches enable row level security;

drop policy if exists "saved_searches_public_insert" on public.saved_searches;
create policy "saved_searches_public_insert"
  on public.saved_searches for insert
  to anon, authenticated
  with check (true);

-- 조회/수정은 service_role만 (어드민 API 경유)
drop policy if exists "saved_searches_service_all" on public.saved_searches;
create policy "saved_searches_service_all"
  on public.saved_searches for all
  to service_role
  using (true) with check (true);

-- unsub_token 으로 본인 레코드만 update 가능 (구독 해지)
drop policy if exists "saved_searches_unsub" on public.saved_searches;
create policy "saved_searches_unsub"
  on public.saved_searches for update
  to anon, authenticated
  using (true)
  with check (true);

comment on table public.saved_searches is 'T5-7: 매물 알림 구독 — 검색조건 저장 + 신규 매물 매칭 시 이메일 발송';
comment on column public.saved_searches.unsub_token is '구독해지용 URL 토큰 (예: /unsub?t=...)';
comment on column public.saved_searches.last_notified_at is '마지막으로 알림 발송된 시각 (다음 배치는 이 시각 이후 생성 매물만)';

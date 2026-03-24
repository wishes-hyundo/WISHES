-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
-- Supabase 마이그레이션: 위시스부동산중개법인 데이터베이스 생성
-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

-- ─────────────────────────────────────────────────────────────
-- 매물(listings) 테이블 생성
-- ─────────────────────────────────────────────────────────────
CREATE TABLE listings (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,

  -- 기본 정보
  title TEXT NOT NULL,
  type TEXT NOT NULL, -- 원룸/투룸/쓰리룴/오피스텔/아파트/상가/사무실
  deal TEXT NOT NULL, -- 전세/월세/매매

  -- 가격 정보 (단위: 만원)
  deposit INTEGER NOT NULL DEFAULT 0,
  monthly INTEGER, -- 월세 (만원 단위)
  price INTEGER, -- 매매가 (만원 단위)
  maintenance_fee INTEGER DEFAULT 0, -- 관리비 (만원 단위)
  maintenance_includes TEXT[], -- 관리비 포함 항목

  -- 면적 정보
  area_m2 REAL NOT NULL, -- 전용면적 m²
  area_supply_m2 REAL, -- 공급면적 m²
  area_land_m2 REAL, -- 대지면적 m² (상가/사무실용)

  -- 층수 정보
  floor_current TEXT NOT NULL, -- 현재 층수
  floor_total TEXT, -- 총 층수

  -- 방/욕실 정보
  rooms INTEGER, -- 방 수
  bathrooms INTEGER, -- 화장실 수

  -- 방향 및 난방
  direction TEXT, -- 향: 남향/동향/서향/북향/남동향/남서향/북동향/북서향
  heating_type TEXT, -- 난방: 개별난방/중앙난방/지역난방

  -- 위치 정보
  address TEXT NOT NULL,
  address_detail TEXT, -- 상세주소
  dong TEXT NOT NULL, -- 동 이름
  lat DOUBLE PRECISION, -- 위도
  lng DOUBLE PRECISION, -- 경도

  -- 상세 정보
  description TEXT, -- 상세설명
  available_date TEXT, -- 입주가능일
  built_year TEXT, -- 준공연도

  -- 편의시설 및 옵션
  parking BOOLEAN DEFAULT FALSE,
  elevator BOOLEAN DEFAULT FALSE,
  pet BOOLEAN DEFAULT FALSE,
  balcony BOOLEAN DEFAULT FALSE,
  full_option BOOLEAN DEFAULT FALSE, -- 풀옵션 여부

  -- 대출 및 상태
  loan_available BOOLEAN DEFAULT TRUE, -- 대출가능여부
  status TEXT NOT NULL DEFAULT '가용', -- 가용/계약중/계약완료

  -- 조회수 및 타임스탐프
  views INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 인덱스 생성
CREATE INDEX idx_listings_dong ON listings(dong);
CREATE INDEX idx_listings_status ON listings(status);
CREATE INDEX idx_listings_type ON listings(type);
CREATE INDEX idx_listings_deal ON listings(deal);
CREATE INDEX idx_listings_created_at ON listings(created_at DESC);

-- ─────────────────────────────────────────────────────────────
-- 매물 이미지(listing_images) 테이블 생성
-- ─────────────────────────────────────────────────────────────
CREATE TABLE listing_images (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  listing_id BIGINT NOT NULL REFERENCES listings(id) ON DELETE CASCADE,
  url TEXT NOT NULL,
  alt TEXT,
  sort_order INTEGER DEFAULT 0,
  is_thumbnail BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_listing_images_listing_id ON listing_images(listing_id);

-- ─────────────────────────────────────────────────────────────
-- 매물 특징(listing_features) 테이블 생성
-- ─────────────────────────────────────────────────────────────
CREATE TABLE listing_features (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  listing_id BIGINT NOT NULL REFERENCES listings(id) ON DELETE CASCADE,
  feature TEXT NOT NULL
);

CREATE INDEX idx_listing_features_listing_id ON listing_features(listing_id);

-- ─────────────────────────────────────────────────────────────
-- 상담 문의(contacts) 테이블 생성
-- ─────────────────────────────────────────────────────────────
CREATE TABLE contacts (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  name TEXT NOT NULL,
  phone TEXT NOT NULL,
  email TEXT,
  message TEXT,
  listing_id BIGINT REFERENCES listings(id),
  status TEXT NOT NULL DEFAULT '접수', -- 접수/처리중/완료
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_contacts_status ON contacts(status);
CREATE INDEX idx_contacts_created_at ON contacts(created_at DESC);

-- ─────────────────────────────────────────────────────────────
-- 사이트 설정(site_settings) 테이블 생성
-- ─────────────────────────────────────────────────────────────
CREATE TABLE site_settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ─────────────────────────────────────────────────────────────
-- 자동 updated_at 갱신 트리거
-- ─────────────────────────────────────────────────────────────
CREATE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_listings_updated_at
  BEFORE UPDATE ON listings
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- ─────────────────────────────────────────────────────────────
-- Row Level Security (RLS) 정책 활성화
-- ─────────────────────────────────────────────────────────────

-- listings 테이블 RLS
ALTER TABLE listings ENABLE ROW LEVEL SECURITY;

CREATE POLICY listings_public_select ON listings
  FOR SELECT
  USING (status = '가용');

CREATE POLICY listings_service_role_all ON listings
  FOR ALL
  USING (auth.role() = 'service_role');

-- listing_images 테이블 RLS
ALTER TABLE listing_images ENABLE ROW LEVEL SECURITY;

CREATE POLICY listing_images_public_select ON listing_images
  FOR SELECT
  USING (
    listing_id IN (
      SELECT id FROM listings WHERE status = '가용'
    )
  );

CREATE POLICY listing_images_service_role_all ON listing_images
  FOR ALL
  USING (auth.role() = 'service_role');

-- listing_features 테이블 RLS
ALTER TABLE listing_features ENABLE ROW LEVEL SECURITY;

CREATE POLICY listing_features_public_select ON listing_features
  FOR SELECT
  USING (
    listing_id IN (
      SELECT id FROM listings WHERE status = '가용'
    )
  );

CREATE POLICY listing_features_service_role_all ON listing_features
  FOR ALL
  USING (auth.role() = 'service_role');

-- contacts 테이블 RLS
ALTER TABLE contacts ENABLE ROW LEVEL SECURITY;

CREATE POLICY contacts_public_insert ON contacts
  FOR INSERT
  WITH CHECK (TRUE);

CREATE POLICY contacts_service_role_all ON contacts
  FOR ALL
  USING (auth.role() = 'service_role');

-- site_settings 테이블 RLS
ALTER TABLE site_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY site_settings_public_select ON site_settings
  FOR SELECT
  USING (TRUE);

CREATE POLICY site_settings_service_role_all ON site_settings
  FOR ALL
  USING (auth.role() = 'service_role');

-- ─────────────────────────────────────────────────────────────
-- Storage 버킷 생성 (SQL로는 직접 생성 불가, admin panel에서 생성 필요)
-- 버킷 이름: listing-images
-- 공개 여부: 공개
-- ─────────────────────────────────────────────────────────────

-- 초기 사이트 설정 데이터
INSERT INTO site_settings (key, value) VALUES
  ('company_name', '위시스부동산중개법인'),
  ('company_phone', ''),
  ('company_email', ''),
  ('company_address', '');

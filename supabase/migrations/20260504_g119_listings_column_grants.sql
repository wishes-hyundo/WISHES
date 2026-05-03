-- G-119 (CRITICAL — 2026-05-04 사장님): listings 테이블 default-deny + 안전 컬럼 GRANT.
--
--   listings_public_select RLS USING (status='공개') 가 anon/authenticated 에 모든 row
--   노출.  PostgREST GET /rest/v1/listings?select=address_detail 호출 시 호수까지
--   모두 leak.  /api/listings/* 의 sanitizePublicListing 우회.
--
--   table-level SELECT 가 column-level REVOKE 우선이므로 default-deny 로 전환:
--     1) anon/authenticated 모든 권한 REVOKE
--     2) 안전 컬럼만 명시 GRANT (privacy 보호)
--
--   차단 컬럼 (GRANT 안 함):
--     - address, address_detail, building_name, title (호수/지번/단지명)
--     - contact, contacts, contacts_history (broker 연락처)
--     - raw_fields, embedding, fingerprint (내부 메타)
--     - ai_generated_fields, trust_score, score, score_breakdown
--     - source_url, source_id, last_crawled_at (크롤링 출처)
--     - building_dong, building_ho (호수)
--     - rtms_data, school_zone_data, air_quality_data 등 enrichment 원본
--     - created_by, problematic_*, area_measured_* (admin 메타)
--
--   service_role 영향 0 (server APIs 는 service_role 사용, BYPASS RLS).

REVOKE SELECT, INSERT, UPDATE, DELETE, REFERENCES, TRIGGER, TRUNCATE
  ON public.listings FROM anon, authenticated, PUBLIC;

GRANT SELECT (
  id, type, type_normalized, deal, deposit, monthly, price,
  maintenance_fee, maintenance_includes, maintenance_excludes,
  area_m2, area_supply_m2, area_land_m2, area_pyeong,
  rooms, bathrooms, floor_current, floor_total, total_floors, direction, heating_type, heating,
  lat, lng, dong, gu, status,
  ai_title, ai_description, description,
  parking, elevator, full_option, pet, balcony, vr_url,
  built_year, station_name, station_distance,
  features, options, photo_count,
  source_site, business_type, building_purpose,
  views, created_at, updated_at, available_date, available_from,
  goodwill_fee, vat_included, rights_fee, lease_period, price_per_pyeong,
  parking_spaces, parking_fee,
  ai_generated_at, registered_date, last_confirmed,
  loan_available, base_price,
  electric_capacity, signage_available, meeting_room,
  recommended_business, restricted_business, previous_business, previous_brand,
  has_wishes_media, wishes_photo_count, wishes_video_count
) ON public.listings TO anon, authenticated;

-- prod 검증 (2026-05-04):
--   - anon GET listings?select=address_detail → HTTP 401 permission denied
--   - anon GET listings?select=id,dong,deal → HTTP 200 OK
--   - /api/listings (service_role) → 정상 응답
--   - /api/listings/viewport (service_role) → 정상 응답

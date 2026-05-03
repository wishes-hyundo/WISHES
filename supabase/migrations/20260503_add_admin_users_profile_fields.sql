-- G-37 (2026-05-03): /admin/profile UI 가 사무소 정보 저장하지만 admin_users 에 컬럼 없음.
-- profiles 에 저장되어 I-AUTH-1 위반. ADD COLUMN IF NOT EXISTS — 비파괴.

ALTER TABLE public.admin_users
  ADD COLUMN IF NOT EXISTS office_phone varchar(30),
  ADD COLUMN IF NOT EXISTS office_address varchar(200),
  ADD COLUMN IF NOT EXISTS registration_no varchar(60),
  ADD COLUMN IF NOT EXISTS career_years int,
  ADD COLUMN IF NOT EXISTS avatar_url varchar(500);

COMMENT ON COLUMN public.admin_users.office_phone IS '사무소 대표 전화 (중개사 프로필).';
COMMENT ON COLUMN public.admin_users.office_address IS '사무소 주소.';
COMMENT ON COLUMN public.admin_users.registration_no IS '공인중개사 등록번호.';
COMMENT ON COLUMN public.admin_users.career_years IS '중개 경력 (년).';
COMMENT ON COLUMN public.admin_users.avatar_url IS '프로필 사진 URL (R2/CDN).';

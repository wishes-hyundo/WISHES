-- G-62 (2026-05-03): G-61 후속 — 남은 12 개 RLS 정책 auth() 래핑 완료.
-- 결과: 45 → 0 unwrapped (100% 완료).

-- See prod migration. 영향: appointments, contacts, push_subscriptions,
-- short_urls, user_consents, building_registry_cache, reports, registry_raw.

SELECT 'placeholder' AS note;

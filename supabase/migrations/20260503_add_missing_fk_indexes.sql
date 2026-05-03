-- G-53 (2026-05-03): FK 컬럼 3개에 index 누락 — JOIN 시 seq scan.

CREATE INDEX IF NOT EXISTS idx_appointments_contact_id ON public.appointments(contact_id) WHERE contact_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_contacts_listing_id ON public.contacts(listing_id) WHERE listing_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_listings_problematic_marked_by ON public.listings(problematic_marked_by) WHERE problematic_marked_by IS NOT NULL;

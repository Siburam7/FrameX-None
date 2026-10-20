-- The owner wants FrameX to approve every new shop product before it goes on sale (decided 2026-10-20). It is an
-- admin setting now (Admin -> Settings -> "Shop products need FrameX approval"); this switches it on once, so it
-- takes effect without touching the host's PRODUCT_MODERATION. An admin can switch it off again there.
-- Products already on sale stay on sale. Nothing else changes.
INSERT INTO platform_settings (key, value) VALUES ('productModeration', 'true'::jsonb) ON CONFLICT (key) DO NOTHING;

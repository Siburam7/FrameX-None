-- Review photos (owner, 2026-10-25): a customer may upload a large, high-quality photo with a review. The original is
-- kept as it is; FrameX makes one medium copy of it (WebP, longest side 1600 px) and that copy is what the website shows,
-- so a page with many review photos stays fast. Reviews from before this have no copy and keep showing the original.
ALTER TABLE reviews ADD COLUMN IF NOT EXISTS photo_view_key text UNIQUE;

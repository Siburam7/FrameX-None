-- HEIC / HEIF and AVIF customer photos (owner, 2026-10-25). iPhones and many Android phones save HEIC, which browsers
-- and print software can't open. The original is kept exactly as uploaded (format heic / avif) and FrameX makes one
-- full-quality JPEG copy of it (print_key): the copy is what is shown and printed, the original can be downloaded.
-- Only widens what is allowed and adds two columns; existing photos are unchanged (no copy: they are JPG / PNG / WebP).
ALTER TABLE uploads DROP CONSTRAINT uploads_format_check;
ALTER TABLE uploads ADD CONSTRAINT uploads_format_check CHECK (format IN ('jpeg', 'png', 'webp', 'heic', 'avif'));
ALTER TABLE uploads ADD COLUMN IF NOT EXISTS print_key text UNIQUE;
ALTER TABLE uploads ADD COLUMN IF NOT EXISTS print_bytes bigint CHECK (print_bytes > 0);

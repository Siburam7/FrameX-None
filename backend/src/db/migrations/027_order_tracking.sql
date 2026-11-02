-- Courier and tracking number of an order (owner, 2026-11-02). FrameX books the parcel (NimbusPost's dashboard today,
-- its API later) and types the courier, the tracking number (AWB) and, if there is one, the tracking link on the
-- admin order page. The customer sees them on the order page and in the "shipped" email / WhatsApp.
-- Only new, empty columns: nothing existing changes.
ALTER TABLE orders ADD COLUMN IF NOT EXISTS courier text;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS tracking_number text;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS tracking_url text;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS tracking_added_at timestamptz;

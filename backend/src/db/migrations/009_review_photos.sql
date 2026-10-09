/* ==========================================================================
   A review can carry one photo (the customer's framed picture at home).

   The rule for reviews does not change: only a customer whose order or
   painting was delivered can write one. The photo belongs to that review,
   is public only while the review is published, and is removed with it.
   Nothing existing is changed.
   ========================================================================== */
ALTER TABLE reviews ADD COLUMN photo_key text;
ALTER TABLE reviews ADD COLUMN photo_mime text;
CREATE INDEX reviews_published_idx ON reviews (created_at DESC) WHERE status = 'PUBLISHED';

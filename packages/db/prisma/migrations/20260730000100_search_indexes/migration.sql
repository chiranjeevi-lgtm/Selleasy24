-- Indexes that Prisma's schema language cannot express (GIN operator classes,
-- partial predicates, expression indexes). Hand-written and reviewed.

-- ---------------------------------------------------------------------------
-- Fuzzy address matching for duplicate-listing detection.
--
-- Buyers' most common complaint about incumbent portals is duplicate listings
-- of the same property with minor spelling variations. A trigram GIN index makes
-- similarity() and ILIKE '%...%' lookups fast enough to run on every submission.
-- ---------------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS "properties_address_trgm_idx"
  ON "properties" USING GIN ("address" gin_trgm_ops);

-- ---------------------------------------------------------------------------
-- Hot path: the public search endpoint lists approved + verified listings,
-- newest first. A partial index covers only publicly visible rows, so it stays
-- small even as drafts, rejections and archived listings accumulate.
--
-- Mirrors PUBLIC_LISTING_WHERE in packages/db/src/index.ts. If that filter
-- changes, this predicate must change with it.
-- ---------------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS "listings_public_recent_idx"
  ON "listings" ("firstListedAt" DESC)
  WHERE "status" = 'APPROVED' AND "isVerified" = true;

-- ---------------------------------------------------------------------------
-- Keyword search over title and description ("3 BHK flat Gachibowli").
--
-- The query must use this exact expression to hit the index. English stemming
-- is imperfect for Indian place names but earns its keep on ordinary property
-- vocabulary (apartment/apartments, furnished/furnishing).
-- ---------------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS "listings_fts_idx"
  ON "listings" USING GIN (
    to_tsvector('english', "title" || ' ' || "description")
  );

-- ---------------------------------------------------------------------------
-- Verification queue: pending listings, oldest first, against a 24-hour SLA.
-- Partial index because the queue is a small slice of the table.
-- ---------------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS "listings_pending_queue_idx"
  ON "listings" ("submittedAt" ASC)
  WHERE "status" = 'PENDING_REVIEW';

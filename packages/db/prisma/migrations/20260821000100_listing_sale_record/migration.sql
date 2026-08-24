-- The sale record, and the reason a listing was paused.
--
-- Separate from the migration that added PAUSED and SOLD because the CHECK
-- constraints below reference those values, and Postgres will not let a new
-- enum value be used until the transaction that created it has committed.

ALTER TABLE "listings" ADD COLUMN "soldAt" TIMESTAMP(3);

-- Optional, and asked for one reason: every price on this platform is an asking
-- price, so a locality median built from them measures what sellers hope for
-- rather than what homes are worth. Nobody has to answer, and it is never shown
-- against their listing.
ALTER TABLE "listings" ADD COLUMN "soldPrice" DECIMAL(14,2);

-- Whether the buyer came from here — the honest measure of whether the platform
-- did its job, and unknowable unless we ask.
ALTER TABLE "listings" ADD COLUMN "soldThroughPlatform" BOOLEAN;

ALTER TABLE "listings" ADD COLUMN "pausedReason" TEXT;

-- A sold listing must carry the date, and a listing that is not sold must carry
-- no sale record at all. Without these a row could claim SOLD with nothing
-- recorded, or advertise itself while holding a sale price — either of which
-- would make every figure derived from these columns untrustworthy.
ALTER TABLE "listings"
  ADD CONSTRAINT "listing_sold_has_date"
  CHECK ("status" <> 'SOLD' OR "soldAt" IS NOT NULL);

ALTER TABLE "listings"
  ADD CONSTRAINT "listing_sale_details_need_sold"
  CHECK (
    "status" = 'SOLD'
    OR ("soldAt" IS NULL AND "soldPrice" IS NULL AND "soldThroughPlatform" IS NULL)
  );

ALTER TABLE "listings"
  ADD CONSTRAINT "listing_sold_price_positive"
  CHECK ("soldPrice" IS NULL OR "soldPrice" > 0);

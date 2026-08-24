-- Site visit requests (PRD Phase 1, feature 16).
--
-- A buyer asking to see a property in person. `buyerId` is NOT NULL, unlike on
-- leads: arranging to meet a stranger at a property is a real commitment on
-- both sides, so both parties are accounts rather than one being an anonymous
-- phone number.

-- CreateEnum
CREATE TYPE "SiteVisitStatus" AS ENUM ('REQUESTED', 'CONFIRMED', 'RESCHEDULED', 'DECLINED', 'CANCELLED', 'COMPLETED');

-- CreateTable
CREATE TABLE "site_visit_requests" (
    "id" UUID NOT NULL,
    "listingId" UUID NOT NULL,
    "buyerId" UUID NOT NULL,
    "preferredAt" TIMESTAMP(3) NOT NULL,
    "proposedAt" TIMESTAMP(3),
    "confirmedAt" TIMESTAMP(3),
    "status" "SiteVisitStatus" NOT NULL DEFAULT 'REQUESTED',
    "note" TEXT,
    "sellerNote" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "site_visit_requests_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "site_visit_requests_listingId_createdAt_idx" ON "site_visit_requests"("listingId", "createdAt");

-- CreateIndex
CREATE INDEX "site_visit_requests_buyerId_createdAt_idx" ON "site_visit_requests"("buyerId", "createdAt");

-- AddForeignKey
ALTER TABLE "site_visit_requests" ADD CONSTRAINT "site_visit_requests_listingId_fkey" FOREIGN KEY ("listingId") REFERENCES "listings"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "site_visit_requests" ADD CONSTRAINT "site_visit_requests_buyerId_fkey" FOREIGN KEY ("buyerId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;


-- A confirmed visit must have a time attached, and a proposed alternative only
-- makes sense while the seller is actually proposing one. Without this a row
-- could claim CONFIRMED with nothing agreed, and both sides would turn up on
-- different days — or on none.
ALTER TABLE "site_visit_requests"
  ADD CONSTRAINT "site_visit_confirmed_has_time"
  CHECK ("status" <> 'CONFIRMED' OR "confirmedAt" IS NOT NULL);

ALTER TABLE "site_visit_requests"
  ADD CONSTRAINT "site_visit_rescheduled_has_proposal"
  CHECK ("status" <> 'RESCHEDULED' OR "proposedAt" IS NOT NULL);

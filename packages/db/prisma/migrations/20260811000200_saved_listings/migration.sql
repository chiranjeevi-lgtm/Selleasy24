-- Saved Properties (PRD Phase 1, feature 13).
--
-- A buyer's shortlist, held server-side so it survives across sessions and
-- devices as the PRD requires. Creates one new table and touches nothing
-- existing, so it applies cleanly to a database with live data.
--
-- The unique constraint on (userId, listingId) is what makes saving idempotent:
-- a double-click cannot create two rows, and the API relies on that rather than
-- doing a read-then-write that would race.

-- CreateTable
CREATE TABLE "saved_listings" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "listingId" UUID NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "saved_listings_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "saved_listings_userId_createdAt_idx" ON "saved_listings"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "saved_listings_listingId_idx" ON "saved_listings"("listingId");

-- CreateIndex
CREATE UNIQUE INDEX "saved_listings_userId_listingId_key" ON "saved_listings"("userId", "listingId");

-- AddForeignKey
ALTER TABLE "saved_listings" ADD CONSTRAINT "saved_listings_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "saved_listings" ADD CONSTRAINT "saved_listings_listingId_fkey" FOREIGN KEY ("listingId") REFERENCES "listings"("id") ON DELETE CASCADE ON UPDATE CASCADE;


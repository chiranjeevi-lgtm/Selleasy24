-- Title, sanctioning authority and area detail.
--
-- Drawn from the seller flows on 99acres and Housing, which are what Telangana
-- sellers already expect to fill in. Every column is nullable, so this applies
-- cleanly to a table with existing rows and needs no backfill.

-- CreateEnum
CREATE TYPE "OwnershipType" AS ENUM ('FREEHOLD', 'LEASEHOLD', 'CO_OPERATIVE_SOCIETY', 'POWER_OF_ATTORNEY');

-- CreateEnum
CREATE TYPE "ApprovingAuthority" AS ENUM ('GHMC', 'HMDA', 'DTCP', 'OTHER');

-- AlterTable
ALTER TABLE "properties"
  ADD COLUMN "carpetAreaSqft"     INTEGER,
  ADD COLUMN "balconies"          INTEGER,
  ADD COLUMN "ownership"          "OwnershipType",
  ADD COLUMN "approvingAuthority" "ApprovingAuthority";

-- Carpet area is the usable space inside the walls, so it is always smaller
-- than built-up. A listing quoting carpet >= built-up is either a data-entry
-- error or an attempt to make the price per sq ft look better than it is.
ALTER TABLE "properties"
  ADD CONSTRAINT "properties_carpet_area_below_builtup"
  CHECK ("carpetAreaSqft" IS NULL OR "carpetAreaSqft" < "areaSqft");

ALTER TABLE "properties"
  ADD CONSTRAINT "properties_balconies_non_negative"
  CHECK ("balconies" IS NULL OR "balconies" >= 0);

-- Filter support: buyers screen on sanctioning authority as a trust proxy.
CREATE INDEX "properties_approvingAuthority_idx" ON "properties"("approvingAuthority");
CREATE INDEX "properties_ownership_idx" ON "properties"("ownership");

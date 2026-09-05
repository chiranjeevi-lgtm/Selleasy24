-- CreateEnum
CREATE TYPE "ListingKind" AS ENUM ('SALE', 'RENT');

-- CreateEnum
CREATE TYPE "TenantPreference" AS ENUM ('ANY', 'FAMILY', 'BACHELOR_MALE', 'BACHELOR_FEMALE', 'COMPANY');

-- AlterTable
ALTER TABLE "listings" ADD COLUMN "kind" "ListingKind" NOT NULL DEFAULT 'SALE';
ALTER TABLE "listings" ADD COLUMN "monthlyRent" DECIMAL(10, 2);
ALTER TABLE "listings" ADD COLUMN "depositMonths" INTEGER;
ALTER TABLE "listings" ADD COLUMN "tenantPreference" "TenantPreference";
ALTER TABLE "listings" ADD COLUMN "petsAllowed" BOOLEAN;
ALTER TABLE "listings" ADD COLUMN "availableFrom" TIMESTAMP(3);
ALTER TABLE "listings" ADD COLUMN "leaseDurationMonths" INTEGER;
ALTER TABLE "listings" ADD COLUMN "zeroBrokerage" BOOLEAN NOT NULL DEFAULT false;

-- CreateIndex
-- Public search on the rent surface always filters by kind = RENT and
-- almost always orders by monthlyRent. This composite matches that path.
CREATE INDEX "listings_kind_status_monthlyRent_idx" ON "listings"("kind", "status", "monthlyRent");

-- Structured Property Data (PRD Phase 1, feature 4).
--
-- Adds the fixed field set the PRD requires so every listing shows the same
-- core facts in the same place, and so those facts can be filtered and compared.
--
-- `possession` is NOT NULL. Prisma's generated SQL would add it as NOT NULL in
-- one statement, which fails outright on a table that already holds rows. The
-- add / backfill / constrain sequence below is the safe form: it also works on
-- a live table with real listings in it, which the generated version does not.

-- CreateEnum
CREATE TYPE "FurnishingStatus" AS ENUM ('UNFURNISHED', 'SEMI_FURNISHED', 'FULLY_FURNISHED');

-- CreateEnum
CREATE TYPE "FacingDirection" AS ENUM ('NORTH', 'SOUTH', 'EAST', 'WEST', 'NORTH_EAST', 'NORTH_WEST', 'SOUTH_EAST', 'SOUTH_WEST');

-- CreateEnum
CREATE TYPE "PossessionStatus" AS ENUM ('READY_TO_MOVE', 'UNDER_CONSTRUCTION');

-- CreateEnum
CREATE TYPE "Amenity" AS ENUM ('LIFT', 'POWER_BACKUP', 'SECURITY', 'CCTV', 'GATED_COMMUNITY', 'GYM', 'SWIMMING_POOL', 'CLUBHOUSE', 'CHILDRENS_PLAY_AREA', 'PARK', 'WATER_SUPPLY_24_7', 'BOREWELL', 'RAINWATER_HARVESTING', 'SOLAR_WATER_HEATER', 'INTERCOM', 'FIRE_SAFETY', 'VISITOR_PARKING', 'MAINTENANCE_STAFF', 'WASTE_DISPOSAL', 'VAASTU_COMPLIANT');

-- CreateEnum
CREATE TYPE "ContactPreference" AS ENUM ('PHONE', 'WHATSAPP', 'EMAIL', 'ANY');

-- AlterTable: listings
ALTER TABLE "listings"
  ADD COLUMN "contactPreference" "ContactPreference" NOT NULL DEFAULT 'ANY';

-- AlterTable: properties — optional columns first, all nullable.
ALTER TABLE "properties"
  ADD COLUMN "floor"          INTEGER,
  ADD COLUMN "totalFloors"    INTEGER,
  ADD COLUMN "furnishing"     "FurnishingStatus",
  ADD COLUMN "facing"         "FacingDirection",
  ADD COLUMN "coveredParking" INTEGER,
  ADD COLUMN "openParking"    INTEGER,
  -- Prisma represents a scalar list as a NOT NULL array defaulting to empty,
  -- so "no amenities recorded" and "amenities recorded as none" are the same
  -- value. That is intended: an empty checklist carries no information.
  ADD COLUMN "amenities"      "Amenity"[] NOT NULL DEFAULT ARRAY[]::"Amenity"[];

-- possession: add nullable, backfill, then constrain.
ALTER TABLE "properties" ADD COLUMN "possession" "PossessionStatus";

-- Backfill from the only evidence already on the row. A property with no
-- construction year, or one dated in the future, is treated as under
-- construction; anything completed is ready to move.
UPDATE "properties"
   SET "possession" = CASE
         WHEN "yearBuilt" IS NULL THEN 'UNDER_CONSTRUCTION'::"PossessionStatus"
         WHEN "yearBuilt" > EXTRACT(YEAR FROM CURRENT_DATE) THEN 'UNDER_CONSTRUCTION'::"PossessionStatus"
         ELSE 'READY_TO_MOVE'::"PossessionStatus"
       END
 WHERE "possession" IS NULL;

ALTER TABLE "properties" ALTER COLUMN "possession" SET NOT NULL;

-- Guard rails the application layer also enforces, kept here so no path around
-- the API can write nonsense: a unit cannot sit above the top of its building,
-- and parking counts cannot be negative.
ALTER TABLE "properties"
  ADD CONSTRAINT "properties_floor_within_building"
  CHECK ("floor" IS NULL OR "totalFloors" IS NULL OR "floor" <= "totalFloors");

ALTER TABLE "properties"
  ADD CONSTRAINT "properties_parking_non_negative"
  CHECK (
    ("coveredParking" IS NULL OR "coveredParking" >= 0)
    AND ("openParking" IS NULL OR "openParking" >= 0)
  );

ALTER TABLE "properties"
  ADD CONSTRAINT "properties_total_floors_positive"
  CHECK ("totalFloors" IS NULL OR "totalFloors" >= 1);

-- CreateIndex
CREATE INDEX "properties_possession_idx" ON "properties"("possession");

-- CreateIndex
CREATE INDEX "properties_furnishing_idx" ON "properties"("furnishing");

-- CreateIndex: GIN over the amenity array so `amenities has X` is an index
-- lookup rather than a sequential scan once inventory grows.
CREATE INDEX "properties_amenities_idx" ON "properties" USING GIN ("amenities");

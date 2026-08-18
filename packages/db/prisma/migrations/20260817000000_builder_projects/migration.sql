-- Builder projects.
--
-- A project is a development containing many units. Kept separate from Listing
-- because a resale listing is one property with one price and one owner, while
-- a project has a price range, unsold inventory, a possession date and no owner
-- yet — forcing both through one table would leave half the columns null for
-- whichever kind a row was not.
--
-- Note on the enum additions below: Postgres allows ALTER TYPE ... ADD VALUE
-- inside a transaction from version 12, but forbids *using* the new value in
-- that same transaction. Nothing here writes the new values, so this is safe.

-- CreateEnum
CREATE TYPE "ProjectStage" AS ENUM ('PRE_LAUNCH', 'UNDER_CONSTRUCTION', 'NEARING_POSSESSION', 'READY_TO_MOVE', 'DELIVERED');

-- CreateEnum
CREATE TYPE "ProjectStatus" AS ENUM ('DRAFT', 'PENDING_REVIEW', 'APPROVED', 'REJECTED', 'ARCHIVED', 'SUSPENDED');

-- AlterEnum
ALTER TYPE "Role" ADD VALUE 'BUILDER';

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "VerificationCheckKind" ADD VALUE 'PROJECT_RERA_VALID';
ALTER TYPE "VerificationCheckKind" ADD VALUE 'PROJECT_PLAN_SANCTIONED';
ALTER TYPE "VerificationCheckKind" ADD VALUE 'PROJECT_COMMENCEMENT_CERTIFICATE';
ALTER TYPE "VerificationCheckKind" ADD VALUE 'PROJECT_LAND_TITLE_CLEAR';
ALTER TYPE "VerificationCheckKind" ADD VALUE 'PROJECT_OCCUPANCY_CERTIFICATE';

-- AlterTable
ALTER TABLE "verifications" ADD COLUMN     "projectId" UUID,
ALTER COLUMN "listingId" DROP NOT NULL;

-- CreateTable
CREATE TABLE "projects" (
    "id" UUID NOT NULL,
    "builderId" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "address" TEXT NOT NULL,
    "pincode" TEXT NOT NULL,
    "neighborhoodId" UUID NOT NULL,
    "stage" "ProjectStage" NOT NULL,
    "possessionDate" TIMESTAMP(3),
    "deliveredOn" TIMESTAMP(3),
    "reraNumber" TEXT NOT NULL,
    "approvingAuthority" "ApprovingAuthority",
    "totalTowers" INTEGER,
    "totalUnits" INTEGER,
    "landAreaAcres" DECIMAL(8,2),
    "amenities" "Amenity"[] DEFAULT ARRAY[]::"Amenity"[],
    "status" "ProjectStatus" NOT NULL DEFAULT 'DRAFT',
    "isVerified" BOOLEAN NOT NULL DEFAULT false,
    "firstListedAt" TIMESTAMP(3),
    "submittedAt" TIMESTAMP(3),
    "verifiedAt" TIMESTAMP(3),
    "verifiedById" UUID,
    "rejectionReason" TEXT,
    "revisionNote" TEXT,
    "viewsCount" INTEGER NOT NULL DEFAULT 0,
    "leadsCount" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "projects_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "project_units" (
    "id" UUID NOT NULL,
    "projectId" UUID NOT NULL,
    "bedrooms" INTEGER NOT NULL,
    "bathrooms" INTEGER NOT NULL,
    "balconies" INTEGER,
    "areaSqft" INTEGER NOT NULL,
    "carpetAreaSqft" INTEGER,
    "priceFrom" DECIMAL(14,2) NOT NULL,
    "totalUnits" INTEGER,
    "availableUnits" INTEGER,
    "floorPlanKey" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "project_units_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "project_photos" (
    "id" UUID NOT NULL,
    "projectId" UUID NOT NULL,
    "storageKey" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "isRender" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "project_photos_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "project_documents" (
    "id" UUID NOT NULL,
    "projectId" UUID NOT NULL,
    "kind" "DocumentKind" NOT NULL,
    "storageKey" TEXT NOT NULL,
    "originalFilename" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "sizeBytes" INTEGER NOT NULL,
    "encryptionIv" TEXT NOT NULL,
    "encryptionTag" TEXT NOT NULL,
    "uploadedById" UUID NOT NULL,
    "deletedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "project_documents_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "projects_status_firstListedAt_idx" ON "projects"("status", "firstListedAt");

-- CreateIndex
CREATE INDEX "projects_builderId_status_idx" ON "projects"("builderId", "status");

-- CreateIndex
CREATE INDEX "projects_neighborhoodId_idx" ON "projects"("neighborhoodId");

-- CreateIndex
CREATE INDEX "projects_stage_idx" ON "projects"("stage");

-- CreateIndex
CREATE INDEX "project_units_projectId_idx" ON "project_units"("projectId");

-- CreateIndex
CREATE INDEX "project_units_bedrooms_idx" ON "project_units"("bedrooms");

-- CreateIndex
CREATE INDEX "project_units_priceFrom_idx" ON "project_units"("priceFrom");

-- CreateIndex
CREATE INDEX "project_photos_projectId_sortOrder_idx" ON "project_photos"("projectId", "sortOrder");

-- CreateIndex
CREATE INDEX "project_documents_projectId_idx" ON "project_documents"("projectId");

-- CreateIndex
CREATE INDEX "verifications_projectId_createdAt_idx" ON "verifications"("projectId", "createdAt");

-- AddForeignKey
ALTER TABLE "projects" ADD CONSTRAINT "projects_builderId_fkey" FOREIGN KEY ("builderId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "projects" ADD CONSTRAINT "projects_verifiedById_fkey" FOREIGN KEY ("verifiedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "projects" ADD CONSTRAINT "projects_neighborhoodId_fkey" FOREIGN KEY ("neighborhoodId") REFERENCES "neighborhoods"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "project_units" ADD CONSTRAINT "project_units_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "project_photos" ADD CONSTRAINT "project_photos_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "project_documents" ADD CONSTRAINT "project_documents_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "project_documents" ADD CONSTRAINT "project_documents_uploadedById_fkey" FOREIGN KEY ("uploadedById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "verifications" ADD CONSTRAINT "verifications_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;


-- A verification decision targets exactly one thing.
--
-- Prisma cannot express this: both columns are nullable in the schema, so
-- without it a row could reference a listing AND a project, or neither, and the
-- audit trail would silently mean nothing.
ALTER TABLE "verifications"
  ADD CONSTRAINT "verifications_one_target"
  CHECK (num_nonnulls("listingId", "projectId") = 1);

-- A project cannot advertise without a RERA registration, so an empty string
-- must not pass for one.
ALTER TABLE "projects"
  ADD CONSTRAINT "projects_rera_number_present"
  CHECK (length(btrim("reraNumber")) > 0);

-- Unsold inventory cannot exceed what was built, and neither can be negative.
ALTER TABLE "project_units"
  ADD CONSTRAINT "project_units_available_within_total"
  CHECK (
    ("availableUnits" IS NULL OR "availableUnits" >= 0)
    AND ("totalUnits" IS NULL OR "totalUnits" >= 0)
    AND ("availableUnits" IS NULL OR "totalUnits" IS NULL OR "availableUnits" <= "totalUnits")
  );

-- Carpet area is the usable space inside the walls, so always smaller than
-- built-up. Same rule as on resale properties.
ALTER TABLE "project_units"
  ADD CONSTRAINT "project_units_carpet_below_builtup"
  CHECK ("carpetAreaSqft" IS NULL OR "carpetAreaSqft" < "areaSqft");

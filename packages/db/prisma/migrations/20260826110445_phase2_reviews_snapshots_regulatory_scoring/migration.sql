-- CreateEnum
CREATE TYPE "RegulatoryAuthority" AS ENUM ('TSRERA', 'HMDA', 'GHMC');

-- CreateEnum
CREATE TYPE "RegulatoryStatus" AS ENUM ('ACTIVE', 'EXPIRED', 'REVOKED', 'UNDER_REVIEW', 'NOT_FOUND');

-- CreateEnum
CREATE TYPE "LocalityReviewStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED');

-- AlterTable
ALTER TABLE "listings" ADD COLUMN     "investmentScore" INTEGER,
ADD COLUMN     "investmentScoreComputedAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "projects" ADD COLUMN     "investmentScore" INTEGER,
ADD COLUMN     "investmentScoreComputedAt" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "regulatory_registrations" (
    "id" UUID NOT NULL,
    "authority" "RegulatoryAuthority" NOT NULL DEFAULT 'TSRERA',
    "registrationNumber" TEXT NOT NULL,
    "projectName" TEXT NOT NULL,
    "promoterName" TEXT NOT NULL,
    "towerPhases" VARCHAR(500),
    "totalUnits" INTEGER,
    "registeredOn" DATE NOT NULL,
    "expiresOn" DATE,
    "status" "RegulatoryStatus" NOT NULL DEFAULT 'ACTIVE',
    "approvalNotes" VARCHAR(1000),
    "syncedById" UUID,
    "syncedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "regulatory_registrations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "locality_snapshots" (
    "id" UUID NOT NULL,
    "neighborhoodId" UUID NOT NULL,
    "snapshotDate" DATE NOT NULL,
    "medianPricePerSqft" DECIMAL(12,2),
    "listingCount" INTEGER NOT NULL,
    "sampleSize" INTEGER NOT NULL,
    "avgDaysOnMarket" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "locality_snapshots_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "locality_reviews" (
    "id" UUID NOT NULL,
    "neighborhoodId" UUID NOT NULL,
    "authorId" UUID NOT NULL,
    "rating" INTEGER NOT NULL,
    "pros" VARCHAR(500) NOT NULL,
    "cons" VARCHAR(500) NOT NULL,
    "tenureYears" INTEGER,
    "status" "LocalityReviewStatus" NOT NULL DEFAULT 'PENDING',
    "moderatedById" UUID,
    "moderatedAt" TIMESTAMP(3),
    "moderationNote" VARCHAR(500),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "locality_reviews_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "regulatory_registrations_registrationNumber_key" ON "regulatory_registrations"("registrationNumber");

-- CreateIndex
CREATE INDEX "regulatory_registrations_status_idx" ON "regulatory_registrations"("status");

-- CreateIndex
CREATE INDEX "regulatory_registrations_authority_status_idx" ON "regulatory_registrations"("authority", "status");

-- CreateIndex
CREATE INDEX "locality_snapshots_neighborhoodId_snapshotDate_idx" ON "locality_snapshots"("neighborhoodId", "snapshotDate");

-- CreateIndex
CREATE INDEX "locality_snapshots_snapshotDate_idx" ON "locality_snapshots"("snapshotDate");

-- CreateIndex
CREATE UNIQUE INDEX "locality_snapshots_neighborhoodId_snapshotDate_key" ON "locality_snapshots"("neighborhoodId", "snapshotDate");

-- CreateIndex
CREATE INDEX "locality_reviews_neighborhoodId_status_createdAt_idx" ON "locality_reviews"("neighborhoodId", "status", "createdAt");

-- CreateIndex
CREATE INDEX "locality_reviews_status_createdAt_idx" ON "locality_reviews"("status", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "locality_reviews_authorId_neighborhoodId_key" ON "locality_reviews"("authorId", "neighborhoodId");

-- AddForeignKey
ALTER TABLE "regulatory_registrations" ADD CONSTRAINT "regulatory_registrations_syncedById_fkey" FOREIGN KEY ("syncedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "locality_snapshots" ADD CONSTRAINT "locality_snapshots_neighborhoodId_fkey" FOREIGN KEY ("neighborhoodId") REFERENCES "neighborhoods"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "locality_reviews" ADD CONSTRAINT "locality_reviews_neighborhoodId_fkey" FOREIGN KEY ("neighborhoodId") REFERENCES "neighborhoods"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "locality_reviews" ADD CONSTRAINT "locality_reviews_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "locality_reviews" ADD CONSTRAINT "locality_reviews_moderatedById_fkey" FOREIGN KEY ("moderatedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

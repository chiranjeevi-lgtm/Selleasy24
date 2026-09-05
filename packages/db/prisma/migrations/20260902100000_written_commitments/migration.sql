-- CreateEnum
CREATE TYPE "CommitmentType" AS ENUM (
  'DISCOUNT',
  'CASHBACK',
  'REFUND',
  'CALLBACK',
  'SERVICE_PROMISE',
  'PRICE_HOLD',
  'OTHER'
);

-- CreateEnum
CREATE TYPE "CommitmentStatus" AS ENUM (
  'ACTIVE',
  'HONORED',
  'SUPERSEDED',
  'EXPIRED',
  'DISPUTED'
);

-- CreateTable
CREATE TABLE "written_commitments" (
  "id"                  UUID              NOT NULL,
  "promisorId"          UUID              NOT NULL,
  "promiseeId"          UUID              NOT NULL,
  "listingId"           UUID,
  "leadId"              UUID,
  "type"                "CommitmentType"  NOT NULL,
  "status"              "CommitmentStatus" NOT NULL DEFAULT 'ACTIVE',
  "promiseText"         TEXT              NOT NULL,
  "amountRupees"        DECIMAL(12,2),
  "documentStorageKey"  TEXT              NOT NULL,
  "documentHash"        CHAR(64)          NOT NULL,
  "documentSizeBytes"   INTEGER           NOT NULL,
  "signedAt"            TIMESTAMP(3)      NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "acknowledgedAt"      TIMESTAMP(3),
  "expiresAt"           TIMESTAMP(3),
  "resolvedAt"          TIMESTAMP(3),
  "resolutionNote"      TEXT,
  "resolvedById"        UUID,
  "supersededById"      UUID,
  "createdAt"           TIMESTAMP(3)      NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"           TIMESTAMP(3)      NOT NULL,

  CONSTRAINT "written_commitments_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "written_commitments_supersededById_key"
  ON "written_commitments"("supersededById");

CREATE INDEX "written_commitments_promisorId_createdAt_idx"
  ON "written_commitments"("promisorId", "createdAt");

CREATE INDEX "written_commitments_promiseeId_createdAt_idx"
  ON "written_commitments"("promiseeId", "createdAt");

CREATE INDEX "written_commitments_listingId_idx"
  ON "written_commitments"("listingId");

CREATE INDEX "written_commitments_leadId_idx"
  ON "written_commitments"("leadId");

CREATE INDEX "written_commitments_status_expiresAt_idx"
  ON "written_commitments"("status", "expiresAt");

-- AddForeignKey
ALTER TABLE "written_commitments"
  ADD CONSTRAINT "written_commitments_promisorId_fkey"
  FOREIGN KEY ("promisorId") REFERENCES "users"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "written_commitments"
  ADD CONSTRAINT "written_commitments_promiseeId_fkey"
  FOREIGN KEY ("promiseeId") REFERENCES "users"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "written_commitments"
  ADD CONSTRAINT "written_commitments_resolvedById_fkey"
  FOREIGN KEY ("resolvedById") REFERENCES "users"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "written_commitments"
  ADD CONSTRAINT "written_commitments_supersededById_fkey"
  FOREIGN KEY ("supersededById") REFERENCES "written_commitments"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

-- AlterTable
ALTER TABLE "users" ADD COLUMN "officerPublicId" VARCHAR(10);

-- CreateIndex
CREATE UNIQUE INDEX "users_officerPublicId_key" ON "users"("officerPublicId");

-- Backfill seeded verifier so the very first "verified by" render works
UPDATE "users" SET "officerPublicId" = 'V-001' WHERE email = 'verifier@kamalainfra.dev';

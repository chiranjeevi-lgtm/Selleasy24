-- AlterTable
ALTER TABLE "users" ADD COLUMN     "failedLoginAttempts" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "lockedUntil" TIMESTAMP(3);

-- RenameIndex
ALTER INDEX "properties_address_trgm_idx" RENAME TO "properties_address_idx";


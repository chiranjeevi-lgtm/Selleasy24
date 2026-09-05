-- CreateEnum
CREATE TYPE "RewardRecipientKind" AS ENUM ('REFERRER', 'REFERRED');

-- CreateEnum
CREATE TYPE "RewardStatus" AS ENUM ('PENDING', 'PAID', 'VOIDED');

-- AlterTable
ALTER TABLE "referrals"
  ADD COLUMN "signupIp"        TEXT,
  ADD COLUMN "signupUserAgent" TEXT;

-- CreateTable
CREATE TABLE "referral_rewards" (
  "id"              UUID                  NOT NULL,
  "referralId"      UUID                  NOT NULL,
  "recipientUserId" UUID                  NOT NULL,
  "recipientKind"   "RewardRecipientKind" NOT NULL,
  "amountRupees"    DECIMAL(10,2)         NOT NULL,
  "status"          "RewardStatus"        NOT NULL DEFAULT 'PENDING',
  "paidAt"          TIMESTAMP(3),
  "paidById"        UUID,
  "paymentNote"     TEXT,
  "createdAt"       TIMESTAMP(3)          NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"       TIMESTAMP(3)          NOT NULL,

  CONSTRAINT "referral_rewards_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "referral_rewards_referralId_recipientKind_key"
  ON "referral_rewards"("referralId", "recipientKind");

CREATE INDEX "referral_rewards_recipientUserId_status_idx"
  ON "referral_rewards"("recipientUserId", "status");

CREATE INDEX "referral_rewards_status_createdAt_idx"
  ON "referral_rewards"("status", "createdAt");

-- AddForeignKey
ALTER TABLE "referral_rewards"
  ADD CONSTRAINT "referral_rewards_referralId_fkey"
  FOREIGN KEY ("referralId") REFERENCES "referrals"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "referral_rewards"
  ADD CONSTRAINT "referral_rewards_recipientUserId_fkey"
  FOREIGN KEY ("recipientUserId") REFERENCES "users"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "referral_rewards"
  ADD CONSTRAINT "referral_rewards_paidById_fkey"
  FOREIGN KEY ("paidById") REFERENCES "users"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

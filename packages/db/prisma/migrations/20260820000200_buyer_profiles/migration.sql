-- Buyer preferences, collected over several short steps after registration.
--
-- Every column is nullable on purpose. The steps are skippable, so a buyer who
-- abandons partway leaves a partial row — half a preference still improves what
-- we show them, and demanding all of it up front loses the account entirely.
--
-- `completedAt` distinguishes "chose not to answer" from "never got that far".

CREATE TYPE "BuyingPurpose" AS ENUM ('LIVE_IN', 'RENT_OUT', 'INVESTMENT');

CREATE TYPE "Occupation" AS ENUM (
  'SALARIED', 'SELF_EMPLOYED', 'BUSINESS_OWNER', 'PROFESSIONAL',
  'RETIRED', 'STUDENT', 'OTHER'
);

CREATE TABLE "buyer_profiles" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "purpose" "BuyingPurpose",
    "householdSize" INTEGER,
    "bedroomsWanted" INTEGER,
    "budgetMin" DECIMAL(14,2),
    "budgetMax" DECIMAL(14,2),
    "occupation" "Occupation",
    -- Financial personal data under the DPDPA. Optional, asked last, never
    -- shown to a seller, and never a precondition for using the platform.
    "monthlyIncome" DECIMAL(12,2),
    "completedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "buyer_profiles_pkey" PRIMARY KEY ("id")
);

-- One profile per account.
CREATE UNIQUE INDEX "buyer_profiles_userId_key" ON "buyer_profiles"("userId");

ALTER TABLE "buyer_profiles" ADD CONSTRAINT "buyer_profiles_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "users"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

-- A budget whose floor is above its ceiling matches nothing and is always a
-- form error rather than an intent. Rejected here so no code path can store it.
ALTER TABLE "buyer_profiles"
  ADD CONSTRAINT "buyer_profile_budget_ordered"
  CHECK ("budgetMin" IS NULL OR "budgetMax" IS NULL OR "budgetMin" <= "budgetMax");

-- Non-negative, and bounded well above any real answer so a typo is caught
-- rather than stored.
ALTER TABLE "buyer_profiles"
  ADD CONSTRAINT "buyer_profile_household_sane"
  CHECK ("householdSize" IS NULL OR ("householdSize" >= 1 AND "householdSize" <= 30));

ALTER TABLE "buyer_profiles"
  ADD CONSTRAINT "buyer_profile_bedrooms_sane"
  CHECK ("bedroomsWanted" IS NULL OR ("bedroomsWanted" >= 0 AND "bedroomsWanted" <= 20));

ALTER TABLE "buyer_profiles"
  ADD CONSTRAINT "buyer_profile_amounts_positive"
  CHECK (
    ("budgetMin" IS NULL OR "budgetMin" >= 0)
    AND ("budgetMax" IS NULL OR "budgetMax" >= 0)
    AND ("monthlyIncome" IS NULL OR "monthlyIncome" >= 0)
  );

-- Localities a buyer wants to be in. A join table rather than an array of ids,
-- so a preference cannot point at a locality that does not exist.
CREATE TABLE "buyer_preferred_localities" (
    "buyerProfileId" UUID NOT NULL,
    "neighborhoodId" UUID NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "buyer_preferred_localities_pkey" PRIMARY KEY ("buyerProfileId", "neighborhoodId")
);

CREATE INDEX "buyer_preferred_localities_neighborhoodId_idx"
  ON "buyer_preferred_localities"("neighborhoodId");

ALTER TABLE "buyer_preferred_localities"
  ADD CONSTRAINT "buyer_preferred_localities_buyerProfileId_fkey"
  FOREIGN KEY ("buyerProfileId") REFERENCES "buyer_profiles"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "buyer_preferred_localities"
  ADD CONSTRAINT "buyer_preferred_localities_neighborhoodId_fkey"
  FOREIGN KEY ("neighborhoodId") REFERENCES "neighborhoods"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

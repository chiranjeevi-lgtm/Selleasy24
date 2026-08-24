-- New listing states, added on their own.
--
-- Deliberately a migration by itself. Postgres refuses to *use* a new enum value
-- in the same transaction that created it ("unsafe use of new value"), and
-- Prisma wraps each migration in one transaction — so adding the values and
-- writing a CHECK constraint that references them has to happen in two steps.
-- The columns and constraints follow in the next migration.
--
-- PAUSED comes back and SOLD does not. Two states rather than one because
-- "sold" is the outcome this platform exists to produce, and folding it into a
-- generic "withdrawn" would discard the only signal that says the marketplace
-- worked.

ALTER TYPE "ListingStatus" ADD VALUE IF NOT EXISTS 'PAUSED' BEFORE 'ARCHIVED';
ALTER TYPE "ListingStatus" ADD VALUE IF NOT EXISTS 'SOLD' BEFORE 'ARCHIVED';

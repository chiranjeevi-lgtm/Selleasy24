-- Letting a buyer contact a builder.
--
-- Until now `leads.listingId` was NOT NULL with no project column, so a lead
-- could not point at a project at all. A builder could list a development, pass
-- verification and collect views, with no way for anyone to express interest —
-- and `projects.leadsCount` sat on the builder's dashboard as a permanent zero.
--
-- Made polymorphic rather than given a second `project_leads` table, matching
-- what Verification and DocumentAccessLog already do here. Two tables would
-- mean every "how many enquiries" query had to remember to union both, which is
-- the kind of omission that silently under-reports for months.

ALTER TABLE "leads" ALTER COLUMN "listingId" DROP NOT NULL;

ALTER TABLE "leads" ADD COLUMN "projectId" UUID;

-- Which configuration the buyer asked about. "Someone enquired" is far less use
-- to a builder than "someone enquired about the 3 BHK".
ALTER TABLE "leads" ADD COLUMN "projectUnitId" UUID;

ALTER TABLE "leads" ADD CONSTRAINT "leads_projectId_fkey"
  FOREIGN KEY ("projectId") REFERENCES "projects"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

-- SetNull, not cascade: a builder reworking their unit mix must not delete the
-- enquiries those units attracted.
ALTER TABLE "leads" ADD CONSTRAINT "leads_projectUnitId_fkey"
  FOREIGN KEY ("projectUnitId") REFERENCES "project_units"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

CREATE INDEX "leads_projectId_createdAt_idx" ON "leads"("projectId", "createdAt");

-- Exactly one target. Prisma cannot express this, and without it a lead could
-- reference both a listing and a project, or neither — and an enquiry attached
-- to nothing is indistinguishable from no enquiry at all.
ALTER TABLE "leads"
  ADD CONSTRAINT "lead_has_one_target"
  CHECK (num_nonnulls("listingId", "projectId") = 1);

-- A unit belongs to a project, so naming one on a resale enquiry is incoherent.
ALTER TABLE "leads"
  ADD CONSTRAINT "lead_unit_needs_project"
  CHECK ("projectUnitId" IS NULL OR "projectId" IS NOT NULL);

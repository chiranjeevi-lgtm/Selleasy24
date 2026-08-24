-- Per-viewer-per-day view records for projects.
--
-- Mirrors listing_views and exists for the same reason: without the uniqueness
-- constraint, Project.viewsCount is a figure anyone can inflate by refreshing,
-- which is worse on a builder's dashboard than showing no figure at all.
--
-- sessionHash is a salted hash, never a raw IP — storing an address we have no
-- need for would be personal data collected for nothing.

CREATE TABLE "project_views" (
    "id" UUID NOT NULL,
    "projectId" UUID NOT NULL,
    "sessionHash" TEXT NOT NULL,
    "viewedOn" DATE NOT NULL,
    "viewedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "project_views_pkey" PRIMARY KEY ("id")
);

-- The dedup key. Makes a repeat view a no-op at the database rather than a
-- read-then-write race in application code.
CREATE UNIQUE INDEX "project_views_projectId_sessionHash_viewedOn_key"
  ON "project_views"("projectId", "sessionHash", "viewedOn");

CREATE INDEX "project_views_projectId_idx" ON "project_views"("projectId");

ALTER TABLE "project_views" ADD CONSTRAINT "project_views_projectId_fkey"
  FOREIGN KEY ("projectId") REFERENCES "projects"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

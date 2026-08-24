-- Access logging for project documents, and a retention deadline to match
-- resale ownership documents.
--
-- DocumentAccessLog becomes polymorphic over the two document tables, the same
-- shape Verification already uses for listings and projects. A staff member
-- reading a builder's land title needs the same forensic record as one reading a
-- homeowner's sale deed; a separate log table would mean every "who accessed
-- this person's documents" query had to remember to union both.

-- Relax the existing FK column so a row can instead point at a project document.
-- Safe on populated tables: every existing row keeps its value, and the CHECK
-- below still requires exactly one of the two to be set.
ALTER TABLE "document_access_logs" ALTER COLUMN "documentId" DROP NOT NULL;

ALTER TABLE "document_access_logs" ADD COLUMN "projectDocumentId" UUID;

ALTER TABLE "document_access_logs"
  ADD CONSTRAINT "document_access_logs_projectDocumentId_fkey"
  FOREIGN KEY ("projectDocumentId") REFERENCES "project_documents"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

CREATE INDEX "document_access_logs_projectDocumentId_accessedAt_idx"
  ON "document_access_logs"("projectDocumentId", "accessedAt");

-- Exactly one target. Prisma cannot express this, and without it a row could
-- reference both documents or neither — an access record naming no document is
-- indistinguishable from no record at all.
ALTER TABLE "document_access_logs"
  ADD CONSTRAINT "document_access_log_has_one_target"
  CHECK (num_nonnulls("documentId", "projectDocumentId") = 1);

-- Retention deadline for project documents, mirroring documents.retainUntil.
ALTER TABLE "project_documents" ADD COLUMN "retainUntil" TIMESTAMP(3);

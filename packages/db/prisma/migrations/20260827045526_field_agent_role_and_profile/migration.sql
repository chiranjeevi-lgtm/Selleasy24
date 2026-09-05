-- CreateEnum
CREATE TYPE "FieldAgentStatus" AS ENUM ('PENDING', 'ACTIVE', 'SUSPENDED', 'INACTIVE');

-- AlterEnum
ALTER TYPE "Role" ADD VALUE 'FIELD_AGENT';

-- CreateTable
CREATE TABLE "field_agents" (
    "id" UUID NOT NULL,
    "userId" UUID,
    "fullName" VARCHAR(120) NOT NULL,
    "phone" VARCHAR(20) NOT NULL,
    "email" VARCHAR(255) NOT NULL,
    "experience" VARCHAR(20) NOT NULL,
    "serviceLocalities" TEXT[],
    "notes" VARCHAR(1000),
    "status" "FieldAgentStatus" NOT NULL DEFAULT 'PENDING',
    "activatedAt" TIMESTAMP(3),
    "activatedById" UUID,
    "suspendedAt" TIMESTAMP(3),
    "suspendedById" UUID,
    "suspendedReason" VARCHAR(500),
    "ratingAverage" DECIMAL(3,2),
    "ratingCount" INTEGER NOT NULL DEFAULT 0,
    "completedAssignments" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "field_agents_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "field_agents_userId_key" ON "field_agents"("userId");

-- CreateIndex
CREATE INDEX "field_agents_status_createdAt_idx" ON "field_agents"("status", "createdAt");

-- CreateIndex
CREATE INDEX "field_agents_status_idx" ON "field_agents"("status");

-- AddForeignKey
ALTER TABLE "field_agents" ADD CONSTRAINT "field_agents_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "field_agents" ADD CONSTRAINT "field_agents_activatedById_fkey" FOREIGN KEY ("activatedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "field_agents" ADD CONSTRAINT "field_agents_suspendedById_fkey" FOREIGN KEY ("suspendedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

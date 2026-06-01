-- Support ticketing system 2026-06-01.
-- Adds Ticket / TicketCategory / TicketReply / TicketEvent models + 5 enums.
-- All additive — no existing rows touched.
-- See docs/SUPPORT_TICKETING_PLAN.md for the full design.

-- CreateEnum
CREATE TYPE "TicketStatus" AS ENUM ('NEW', 'TRIAGED', 'IN_PROGRESS', 'WAITING_ON_REQUESTER', 'RESOLVED', 'CLOSED');

-- CreateEnum
CREATE TYPE "TicketPriority" AS ENUM ('LOW', 'MEDIUM', 'HIGH', 'URGENT');

-- CreateEnum
CREATE TYPE "TicketRequesterRole" AS ENUM ('CREATOR', 'PARTNER');

-- CreateEnum
CREATE TYPE "TicketAuthorRole" AS ENUM ('CREATOR', 'PARTNER', 'ADMIN');

-- CreateEnum
CREATE TYPE "TicketEventKind" AS ENUM ('CREATED', 'ASSIGNED', 'STATUS_CHANGED', 'PRIORITY_CHANGED', 'REPLIED', 'RESOLVED', 'REOPENED', 'MERGED', 'SPLIT', 'SLA_BREACHED', 'INTERNAL_NOTE_ADDED');

-- CreateTable
CREATE TABLE "TicketCategory" (
    "id" STRING NOT NULL,
    "slug" STRING NOT NULL,
    "name" STRING NOT NULL,
    "description" STRING,
    "defaultPriority" "TicketPriority" NOT NULL DEFAULT 'MEDIUM',
    "defaultAssigneeUserId" STRING,
    "slaResponseMinutes" INT4,
    "slaResolveMinutes" INT4,
    "isActive" BOOL NOT NULL DEFAULT true,
    "sortOrder" INT4 NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TicketCategory_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Ticket" (
    "id" STRING NOT NULL,
    "requesterUserId" STRING NOT NULL,
    "requesterRole" "TicketRequesterRole" NOT NULL,
    "assigneeUserId" STRING,
    "categoryId" STRING NOT NULL,
    "subject" STRING(180) NOT NULL,
    "body" STRING NOT NULL,
    "status" "TicketStatus" NOT NULL DEFAULT 'NEW',
    "priority" "TicketPriority" NOT NULL DEFAULT 'MEDIUM',
    "entityType" STRING,
    "entityId" STRING,
    "firstResponseAt" TIMESTAMP(3),
    "resolvedAt" TIMESTAMP(3),
    "closedAt" TIMESTAMP(3),
    "slaBreachedAt" TIMESTAMP(3),
    "internalNotes" STRING,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Ticket_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TicketReply" (
    "id" STRING NOT NULL,
    "ticketId" STRING NOT NULL,
    "authorUserId" STRING NOT NULL,
    "authorRole" "TicketAuthorRole" NOT NULL,
    "body" STRING NOT NULL,
    "attachments" JSONB,
    "isInternalNote" BOOL NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TicketReply_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TicketEvent" (
    "id" STRING NOT NULL,
    "ticketId" STRING NOT NULL,
    "kind" "TicketEventKind" NOT NULL,
    "payload" JSONB NOT NULL,
    "actorUserId" STRING,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TicketEvent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "TicketCategory_slug_key" ON "TicketCategory"("slug");

-- CreateIndex
CREATE INDEX "TicketCategory_isActive_sortOrder_idx" ON "TicketCategory"("isActive", "sortOrder");

-- CreateIndex
CREATE INDEX "Ticket_status_priority_createdAt_idx" ON "Ticket"("status", "priority", "createdAt");

-- CreateIndex
CREATE INDEX "Ticket_assigneeUserId_status_idx" ON "Ticket"("assigneeUserId", "status");

-- CreateIndex
CREATE INDEX "Ticket_requesterUserId_createdAt_idx" ON "Ticket"("requesterUserId", "createdAt");

-- CreateIndex
CREATE INDEX "Ticket_categoryId_status_idx" ON "Ticket"("categoryId", "status");

-- CreateIndex
CREATE INDEX "Ticket_entityType_entityId_idx" ON "Ticket"("entityType", "entityId");

-- CreateIndex
CREATE INDEX "Ticket_slaBreachedAt_idx" ON "Ticket"("slaBreachedAt");

-- CreateIndex
CREATE INDEX "TicketReply_ticketId_createdAt_idx" ON "TicketReply"("ticketId", "createdAt");

-- CreateIndex
CREATE INDEX "TicketReply_authorUserId_idx" ON "TicketReply"("authorUserId");

-- CreateIndex
CREATE INDEX "TicketEvent_ticketId_createdAt_idx" ON "TicketEvent"("ticketId", "createdAt");

-- AddForeignKey
ALTER TABLE "Ticket" ADD CONSTRAINT "Ticket_requesterUserId_fkey" FOREIGN KEY ("requesterUserId") REFERENCES "User"("id") ON DELETE NO ACTION ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Ticket" ADD CONSTRAINT "Ticket_assigneeUserId_fkey" FOREIGN KEY ("assigneeUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Ticket" ADD CONSTRAINT "Ticket_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "TicketCategory"("id") ON DELETE NO ACTION ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TicketReply" ADD CONSTRAINT "TicketReply_ticketId_fkey" FOREIGN KEY ("ticketId") REFERENCES "Ticket"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TicketReply" ADD CONSTRAINT "TicketReply_authorUserId_fkey" FOREIGN KEY ("authorUserId") REFERENCES "User"("id") ON DELETE NO ACTION ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TicketEvent" ADD CONSTRAINT "TicketEvent_ticketId_fkey" FOREIGN KEY ("ticketId") REFERENCES "Ticket"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TicketEvent" ADD CONSTRAINT "TicketEvent_actorUserId_fkey" FOREIGN KEY ("actorUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

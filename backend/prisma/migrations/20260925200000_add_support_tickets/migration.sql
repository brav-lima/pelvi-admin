-- CreateEnum
CREATE TYPE "SupportTicketCategory" AS ENUM ('BUG', 'SUGGESTION', 'QUESTION');

-- CreateEnum
CREATE TYPE "SupportTicketStatus" AS ENUM ('OPEN', 'IN_PROGRESS', 'RESOLVED');

-- CreateTable
CREATE TABLE "support_tickets" (
    "id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "category" "SupportTicketCategory" NOT NULL,
    "status" "SupportTicketStatus" NOT NULL DEFAULT 'OPEN',
    "reporter_name" TEXT NOT NULL,
    "reporter_email" TEXT,
    "reporter_role" TEXT,
    "description" TEXT NOT NULL,
    "context" JSONB NOT NULL,
    "sentry_event_id" TEXT,
    "internal_note" TEXT,
    "email_reply_body" TEXT,
    "email_replied_at" TIMESTAMP(3),
    "email_replied_by_admin_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "support_tickets_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "support_tickets_organization_id_idx" ON "support_tickets"("organization_id");

-- CreateIndex
CREATE INDEX "support_tickets_status_idx" ON "support_tickets"("status");

-- AddForeignKey
ALTER TABLE "support_tickets" ADD CONSTRAINT "support_tickets_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "support_tickets" ADD CONSTRAINT "support_tickets_email_replied_by_admin_id_fkey" FOREIGN KEY ("email_replied_by_admin_id") REFERENCES "admin_users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

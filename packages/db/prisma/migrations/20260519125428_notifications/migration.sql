-- CreateEnum
CREATE TYPE "NotificationChannel" AS ENUM ('EMAIL', 'IN_APP');

-- CreateEnum
CREATE TYPE "NotificationEvent" AS ENUM ('SECTION_VERIFIED', 'SECTION_NEEDS_CHANGES', 'PARTNER_ACTIVATED', 'DISPATCH_RECEIVED', 'DISPATCH_ACCEPT_REMINDER', 'PARTNER_APPLIED', 'PARTNER_SUBMITTED', 'ORDER_NEEDS_ATTENTION');

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "quietHoursEndUtc" INT4;
ALTER TABLE "User" ADD COLUMN     "quietHoursStartUtc" INT4;

-- CreateTable
CREATE TABLE "Notification" (
    "id" STRING NOT NULL,
    "userId" STRING NOT NULL,
    "event" "NotificationEvent" NOT NULL,
    "channel" "NotificationChannel" NOT NULL,
    "title" STRING NOT NULL,
    "body" STRING,
    "link" STRING,
    "emailSentAt" TIMESTAMP(3),
    "emailError" STRING,
    "readAt" TIMESTAMP(3),
    "payload" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Notification_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "NotificationPreference" (
    "id" STRING NOT NULL,
    "userId" STRING NOT NULL,
    "event" "NotificationEvent" NOT NULL,
    "channel" "NotificationChannel" NOT NULL,
    "enabled" BOOL NOT NULL DEFAULT true,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "NotificationPreference_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Notification_userId_readAt_idx" ON "Notification"("userId", "readAt");

-- CreateIndex
CREATE INDEX "Notification_userId_createdAt_idx" ON "Notification"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "Notification_event_idx" ON "Notification"("event");

-- CreateIndex
CREATE UNIQUE INDEX "NotificationPreference_userId_event_channel_key" ON "NotificationPreference"("userId", "event", "channel");

-- AddForeignKey
ALTER TABLE "Notification" ADD CONSTRAINT "Notification_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "NotificationPreference" ADD CONSTRAINT "NotificationPreference_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

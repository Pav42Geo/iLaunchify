-- CreateEnum
CREATE TYPE "ChannelConnectionStatus" AS ENUM ('NOT_CONNECTED', 'CONNECTED', 'TOKEN_EXPIRED', 'DISCONNECTED', 'ERROR');

-- CreateEnum
CREATE TYPE "ChannelProductLinkStatus" AS ENUM ('ACTIVE', 'ARCHIVED', 'ERROR');

-- CreateTable
CREATE TABLE "Channel" (
    "id" STRING NOT NULL,
    "code" STRING NOT NULL,
    "displayName" STRING NOT NULL,
    "logoUrl" STRING,
    "enabled" BOOL NOT NULL DEFAULT false,
    "oauthConfigured" BOOL NOT NULL DEFAULT false,
    "notes" STRING,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Channel_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ChannelConnection" (
    "id" STRING NOT NULL,
    "channelId" STRING NOT NULL,
    "creatorUserId" STRING NOT NULL,
    "externalAccountId" STRING,
    "accessTokenRef" STRING,
    "refreshTokenRef" STRING,
    "scopes" STRING[] DEFAULT ARRAY[]::STRING[],
    "status" "ChannelConnectionStatus" NOT NULL DEFAULT 'NOT_CONNECTED',
    "connectedAt" TIMESTAMP(3),
    "disconnectedAt" TIMESTAMP(3),
    "lastSyncAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ChannelConnection_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ChannelProductLink" (
    "id" STRING NOT NULL,
    "channelId" STRING NOT NULL,
    "channelConnectionId" STRING NOT NULL,
    "productId" STRING NOT NULL,
    "externalListingId" STRING NOT NULL,
    "externalUrl" STRING,
    "status" "ChannelProductLinkStatus" NOT NULL DEFAULT 'ACTIVE',
    "lastPushedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ChannelProductLink_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Channel_code_key" ON "Channel"("code");

-- CreateIndex
CREATE UNIQUE INDEX "ChannelConnection_channelId_creatorUserId_key" ON "ChannelConnection"("channelId", "creatorUserId");

-- CreateIndex
CREATE INDEX "ChannelProductLink_channelConnectionId_idx" ON "ChannelProductLink"("channelConnectionId");

-- CreateIndex
CREATE UNIQUE INDEX "ChannelProductLink_channelId_productId_key" ON "ChannelProductLink"("channelId", "productId");

-- AddForeignKey
ALTER TABLE "ChannelConnection" ADD CONSTRAINT "ChannelConnection_channelId_fkey" FOREIGN KEY ("channelId") REFERENCES "Channel"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChannelConnection" ADD CONSTRAINT "ChannelConnection_creatorUserId_fkey" FOREIGN KEY ("creatorUserId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChannelProductLink" ADD CONSTRAINT "ChannelProductLink_channelId_fkey" FOREIGN KEY ("channelId") REFERENCES "Channel"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChannelProductLink" ADD CONSTRAINT "ChannelProductLink_channelConnectionId_fkey" FOREIGN KEY ("channelConnectionId") REFERENCES "ChannelConnection"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChannelProductLink" ADD CONSTRAINT "ChannelProductLink_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE CASCADE ON UPDATE CASCADE;

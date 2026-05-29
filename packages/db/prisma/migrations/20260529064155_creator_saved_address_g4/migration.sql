-- CreateTable
CREATE TABLE "CreatorSavedAddress" (
    "id" STRING NOT NULL,
    "creatorUserId" STRING NOT NULL,
    "label" STRING NOT NULL,
    "contactName" STRING NOT NULL,
    "contactPhone" STRING,
    "addressLine1" STRING NOT NULL,
    "addressLine2" STRING,
    "city" STRING NOT NULL,
    "state" STRING,
    "postalCode" STRING NOT NULL,
    "country" STRING NOT NULL DEFAULT 'US',
    "isDefault" BOOL NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CreatorSavedAddress_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "CreatorSavedAddress_creatorUserId_isDefault_idx" ON "CreatorSavedAddress"("creatorUserId", "isDefault");

-- AddForeignKey
ALTER TABLE "CreatorSavedAddress" ADD CONSTRAINT "CreatorSavedAddress_creatorUserId_fkey" FOREIGN KEY ("creatorUserId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

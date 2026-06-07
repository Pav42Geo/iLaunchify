-- CreateEnum
CREATE TYPE "SpotColorCategory" AS ENUM ('STANDARD', 'NEON', 'METALLIC', 'PASTEL', 'WHITE_INK', 'SPOT_VARNISH', 'FOIL');

-- CreateTable
CREATE TABLE "SpotColor" (
    "id" STRING NOT NULL,
    "pmsNumber" STRING NOT NULL,
    "bookVersion" "PmsBook" NOT NULL,
    "fullSpec" STRING NOT NULL,
    "cmykApprox" JSONB NOT NULL,
    "rgbApprox" STRING NOT NULL,
    "category" "SpotColorCategory" NOT NULL DEFAULT 'STANDARD',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SpotColor_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "SpotColor_fullSpec_key" ON "SpotColor"("fullSpec");

-- CreateIndex
CREATE INDEX "SpotColor_category_idx" ON "SpotColor"("category");

-- CreateIndex
CREATE INDEX "SpotColor_pmsNumber_idx" ON "SpotColor"("pmsNumber");

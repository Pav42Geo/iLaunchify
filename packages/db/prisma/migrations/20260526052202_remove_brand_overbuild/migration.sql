/*
  Warnings:

  - You are about to drop the column `audienceAgeMax` on the `Brand` table. All the data in the column will be lost.
  - You are about to drop the column `audienceAgeMin` on the `Brand` table. All the data in the column will be lost.
  - You are about to drop the column `audienceInterests` on the `Brand` table. All the data in the column will be lost.
  - You are about to drop the column `audienceValues` on the `Brand` table. All the data in the column will be lost.
  - You are about to drop the column `bannedWords` on the `Brand` table. All the data in the column will be lost.
  - You are about to drop the column `brandBookExportedAt` on the `Brand` table. All the data in the column will be lost.
  - You are about to drop the column `brandHealthScore` on the `Brand` table. All the data in the column will be lost.
  - You are about to drop the column `brandKeywords` on the `Brand` table. All the data in the column will be lost.
  - You are about to drop the column `brandStylePresetId` on the `Brand` table. All the data in the column will be lost.
  - You are about to drop the column `brandVoiceTags` on the `Brand` table. All the data in the column will be lost.
  - You are about to drop the column `colorPaletteId` on the `Brand` table. All the data in the column will be lost.
  - You are about to drop the column `colorSystem` on the `Brand` table. All the data in the column will be lost.
  - You are about to drop the column `customColorsJson` on the `Brand` table. All the data in the column will be lost.
  - You are about to drop the column `customPaletteOverride` on the `Brand` table. All the data in the column will be lost.
  - You are about to drop the column `directionNotes` on the `Brand` table. All the data in the column will be lost.
  - You are about to drop the column `faviconAssetId` on the `Brand` table. All the data in the column will be lost.
  - You are about to drop the column `fontBody` on the `Brand` table. All the data in the column will be lost.
  - You are about to drop the column `fontDisplay` on the `Brand` table. All the data in the column will be lost.
  - You are about to drop the column `heroImageAssetIds` on the `Brand` table. All the data in the column will be lost.
  - You are about to drop the column `illustrationStyle` on the `Brand` table. All the data in the column will be lost.
  - You are about to drop the column `logoInverseAssetId` on the `Brand` table. All the data in the column will be lost.
  - You are about to drop the column `logoMinClearSpaceUnits` on the `Brand` table. All the data in the column will be lost.
  - You are about to drop the column `logoMonogramAssetId` on the `Brand` table. All the data in the column will be lost.
  - You are about to drop the column `logoVerticalAssetId` on the `Brand` table. All the data in the column will be lost.
  - You are about to drop the column `packagingDirectionNotes` on the `Brand` table. All the data in the column will be lost.
  - You are about to drop the column `patternAssetIds` on the `Brand` table. All the data in the column will be lost.
  - You are about to drop the column `personaDescription` on the `Brand` table. All the data in the column will be lost.
  - You are about to drop the column `photographyStyle` on the `Brand` table. All the data in the column will be lost.
  - You are about to drop the column `secondaryTaglines` on the `Brand` table. All the data in the column will be lost.
  - You are about to drop the column `typeScaleRatio` on the `Brand` table. All the data in the column will be lost.
  - You are about to drop the column `typographyAccentId` on the `Brand` table. All the data in the column will be lost.
  - You are about to drop the column `typographyPairId` on the `Brand` table. All the data in the column will be lost.
  - You are about to drop the column `voiceArchetype` on the `Brand` table. All the data in the column will be lost.
  - You are about to drop the column `voiceFormality` on the `Brand` table. All the data in the column will be lost.
  - You are about to drop the column `voiceNotes` on the `Brand` table. All the data in the column will be lost.
  - You are about to drop the column `voicePlayfulness` on the `Brand` table. All the data in the column will be lost.
  - You are about to drop the column `voiceWarmth` on the `Brand` table. All the data in the column will be lost.
  - You are about to drop the column `writingToneWords` on the `Brand` table. All the data in the column will be lost.
  - You are about to drop the `BrandStylePreset` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `ColorPalette` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `TypographyPair` table. If the table is not empty, all the data it contains will be lost.

*/
-- DropForeignKey
ALTER TABLE "Brand" DROP CONSTRAINT "Brand_brandStylePresetId_fkey";

-- DropForeignKey
ALTER TABLE "Brand" DROP CONSTRAINT "Brand_colorPaletteId_fkey";

-- DropForeignKey
ALTER TABLE "Brand" DROP CONSTRAINT "Brand_typographyAccentId_fkey";

-- DropForeignKey
ALTER TABLE "Brand" DROP CONSTRAINT "Brand_typographyPairId_fkey";

-- DropForeignKey
ALTER TABLE "BrandStylePreset" DROP CONSTRAINT "BrandStylePreset_recommendedColorPaletteId_fkey";

-- DropForeignKey
ALTER TABLE "BrandStylePreset" DROP CONSTRAINT "BrandStylePreset_recommendedTypographyPairId_fkey";

-- DropForeignKey
ALTER TABLE "TypographyPair" DROP CONSTRAINT "TypographyPair_bodyFontId_fkey";

-- DropForeignKey
ALTER TABLE "TypographyPair" DROP CONSTRAINT "TypographyPair_headingFontId_fkey";

-- AlterTable
ALTER TABLE "Brand" DROP COLUMN "audienceAgeMax";
ALTER TABLE "Brand" DROP COLUMN "audienceAgeMin";
ALTER TABLE "Brand" DROP COLUMN "audienceInterests";
ALTER TABLE "Brand" DROP COLUMN "audienceValues";
ALTER TABLE "Brand" DROP COLUMN "bannedWords";
ALTER TABLE "Brand" DROP COLUMN "brandBookExportedAt";
ALTER TABLE "Brand" DROP COLUMN "brandHealthScore";
ALTER TABLE "Brand" DROP COLUMN "brandKeywords";
ALTER TABLE "Brand" DROP COLUMN "brandStylePresetId";
ALTER TABLE "Brand" DROP COLUMN "brandVoiceTags";
ALTER TABLE "Brand" DROP COLUMN "colorPaletteId";
ALTER TABLE "Brand" DROP COLUMN "colorSystem";
ALTER TABLE "Brand" DROP COLUMN "customColorsJson";
ALTER TABLE "Brand" DROP COLUMN "customPaletteOverride";
ALTER TABLE "Brand" DROP COLUMN "directionNotes";
ALTER TABLE "Brand" DROP COLUMN "faviconAssetId";
ALTER TABLE "Brand" DROP COLUMN "fontBody";
ALTER TABLE "Brand" DROP COLUMN "fontDisplay";
ALTER TABLE "Brand" DROP COLUMN "heroImageAssetIds";
ALTER TABLE "Brand" DROP COLUMN "illustrationStyle";
ALTER TABLE "Brand" DROP COLUMN "logoInverseAssetId";
ALTER TABLE "Brand" DROP COLUMN "logoMinClearSpaceUnits";
ALTER TABLE "Brand" DROP COLUMN "logoMonogramAssetId";
ALTER TABLE "Brand" DROP COLUMN "logoVerticalAssetId";
ALTER TABLE "Brand" DROP COLUMN "packagingDirectionNotes";
ALTER TABLE "Brand" DROP COLUMN "patternAssetIds";
ALTER TABLE "Brand" DROP COLUMN "personaDescription";
ALTER TABLE "Brand" DROP COLUMN "photographyStyle";
ALTER TABLE "Brand" DROP COLUMN "secondaryTaglines";
ALTER TABLE "Brand" DROP COLUMN "typeScaleRatio";
ALTER TABLE "Brand" DROP COLUMN "typographyAccentId";
ALTER TABLE "Brand" DROP COLUMN "typographyPairId";
ALTER TABLE "Brand" DROP COLUMN "voiceArchetype";
ALTER TABLE "Brand" DROP COLUMN "voiceFormality";
ALTER TABLE "Brand" DROP COLUMN "voiceNotes";
ALTER TABLE "Brand" DROP COLUMN "voicePlayfulness";
ALTER TABLE "Brand" DROP COLUMN "voiceWarmth";
ALTER TABLE "Brand" DROP COLUMN "writingToneWords";
ALTER TABLE "Brand" ADD COLUMN     "brandFontIds" STRING[];
ALTER TABLE "Brand" ADD COLUMN     "brandSwatches" STRING[];

-- DropTable
DROP TABLE "BrandStylePreset";

-- DropTable
DROP TABLE "ColorPalette";

-- DropTable
DROP TABLE "TypographyPair";

-- DropEnum
DROP TYPE "BrandArchetype";

-- DropEnum
DROP TYPE "IllustrationStyle";

-- DropEnum
DROP TYPE "PhotographyStyle";

-- CreateEnum
CREATE TYPE "PhraseRequirement" AS ENUM ('MANDATORY', 'RECOMMENDED');

-- AlterEnum
ALTER TYPE "MandatoryPhraseCategory" ADD VALUE 'CLAIM';
ALTER TYPE "MandatoryPhraseCategory" ADD VALUE 'SUSTAINABILITY';
ALTER TYPE "MandatoryPhraseCategory" ADD VALUE 'MARKETING';

-- AlterTable
ALTER TABLE "MandatoryPhrase" ADD COLUMN     "requirement" "PhraseRequirement" NOT NULL DEFAULT 'MANDATORY';

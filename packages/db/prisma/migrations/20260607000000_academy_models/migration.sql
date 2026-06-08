-- iLaunchify Academy (Phase A) — additive only. CockroachDB-safe.
-- 5 enums + 4 models (AcademyCategory, AcademyCourse, AcademyModule, AcademyLesson).
-- Spec: docs/ACADEMY_SPEC.md §9. Bare STRING for unbounded text (no @db.Text).

-- CreateEnum
CREATE TYPE "AcademyAudience" AS ENUM ('CREATOR', 'PARTNER');

-- CreateEnum
CREATE TYPE "AcademyLevel" AS ENUM ('BEGINNER', 'INTERMEDIATE', 'ADVANCED');

-- CreateEnum
CREATE TYPE "AcademyStatus" AS ENUM ('DRAFT', 'IN_REVIEW', 'PUBLISHED', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "AcademyLessonType" AS ENUM ('VIDEO', 'ARTICLE', 'INTERACTIVE');

-- CreateEnum
CREATE TYPE "AcademyVideoProvider" AS ENUM ('MUX', 'YOUTUBE', 'VIMEO', 'CLOUDFLARE', 'SELF');

-- CreateTable
CREATE TABLE "AcademyCategory" (
    "id" STRING NOT NULL,
    "slug" STRING NOT NULL,
    "name" STRING NOT NULL,
    "description" STRING,
    "audience" "AcademyAudience" NOT NULL,
    "iconKey" STRING,
    "order" INT4 NOT NULL DEFAULT 0,
    "status" "AcademyStatus" NOT NULL DEFAULT 'DRAFT',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AcademyCategory_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AcademyCourse" (
    "id" STRING NOT NULL,
    "slug" STRING NOT NULL,
    "title" STRING NOT NULL,
    "subtitle" STRING,
    "summary" STRING NOT NULL,
    "audience" "AcademyAudience" NOT NULL,
    "level" "AcademyLevel" NOT NULL DEFAULT 'BEGINNER',
    "categoryId" STRING,
    "heroImageUrl" STRING,
    "estimatedMinutes" INT4,
    "status" "AcademyStatus" NOT NULL DEFAULT 'DRAFT',
    "order" INT4 NOT NULL DEFAULT 0,
    "publishedAt" TIMESTAMP(3),
    "metaTitle" STRING,
    "metaDescription" STRING,
    "ogImageUrl" STRING,
    "createdById" STRING,
    "updatedById" STRING,
    "tags" STRING[],
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AcademyCourse_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AcademyModule" (
    "id" STRING NOT NULL,
    "courseId" STRING NOT NULL,
    "title" STRING NOT NULL,
    "order" INT4 NOT NULL DEFAULT 0,

    CONSTRAINT "AcademyModule_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AcademyLesson" (
    "id" STRING NOT NULL,
    "courseId" STRING NOT NULL,
    "moduleId" STRING,
    "slug" STRING NOT NULL,
    "title" STRING NOT NULL,
    "type" "AcademyLessonType" NOT NULL DEFAULT 'VIDEO',
    "summary" STRING,
    "bodyMdx" STRING,
    "durationSeconds" INT4,
    "videoProvider" "AcademyVideoProvider",
    "videoAssetId" STRING,
    "order" INT4 NOT NULL DEFAULT 0,
    "status" "AcademyStatus" NOT NULL DEFAULT 'DRAFT',
    "publishedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AcademyLesson_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "AcademyCategory_slug_key" ON "AcademyCategory"("slug");

-- CreateIndex
CREATE UNIQUE INDEX "AcademyCategory_audience_slug_key" ON "AcademyCategory"("audience", "slug");

-- CreateIndex
CREATE UNIQUE INDEX "AcademyCourse_audience_slug_key" ON "AcademyCourse"("audience", "slug");

-- CreateIndex
CREATE UNIQUE INDEX "AcademyLesson_courseId_slug_key" ON "AcademyLesson"("courseId", "slug");

-- AddForeignKey
ALTER TABLE "AcademyCourse" ADD CONSTRAINT "AcademyCourse_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "AcademyCategory"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AcademyModule" ADD CONSTRAINT "AcademyModule_courseId_fkey" FOREIGN KEY ("courseId") REFERENCES "AcademyCourse"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AcademyLesson" ADD CONSTRAINT "AcademyLesson_courseId_fkey" FOREIGN KEY ("courseId") REFERENCES "AcademyCourse"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AcademyLesson" ADD CONSTRAINT "AcademyLesson_moduleId_fkey" FOREIGN KEY ("moduleId") REFERENCES "AcademyModule"("id") ON DELETE SET NULL ON UPDATE CASCADE;

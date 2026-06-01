-- AlterTable: cert-badge host surface flag (DESIGN_STUDIO.md §Certificate badges V1)
ALTER TABLE "Design" ADD COLUMN "showsCertifications" BOOL NOT NULL DEFAULT false;

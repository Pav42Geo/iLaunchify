-- CreateEnum
CREATE TYPE "ContainerCategory" AS ENUM ('BOTTLE', 'JAR', 'CAN', 'TUBE', 'POUCH', 'SACHET', 'STICK_PACK', 'BOX', 'CARTON', 'CASE', 'OTHER');

-- AlterTable
ALTER TABLE "PackagingType" ADD COLUMN     "containerCategory" "ContainerCategory";

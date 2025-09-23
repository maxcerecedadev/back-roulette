/*
  Warnings:

  - A unique constraint covering the columns `[code]` on the table `Tournament` will be added. If there are existing duplicate values, this will fail.
  - Added the required column `code` to the `Tournament` table without a default value. This is not possible if the table is not empty.

*/
-- AlterTable
ALTER TABLE "public"."Tournament" ADD COLUMN     "code" TEXT NOT NULL,
ADD COLUMN     "maxPlayers" INTEGER NOT NULL DEFAULT 3;

-- CreateIndex
CREATE UNIQUE INDEX "Tournament_code_key" ON "public"."Tournament"("code");

-- CreateIndex
CREATE INDEX "Tournament_code_idx" ON "public"."Tournament"("code");

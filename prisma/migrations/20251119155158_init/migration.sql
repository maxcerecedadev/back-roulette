/*
  Warnings:

  - Added the required column `entryFee` to the `Tournament` table without a default value. This is not possible if the table is not empty.

*/
-- AlterTable
ALTER TABLE "public"."Tournament" ADD COLUMN     "entryFee" INTEGER NOT NULL;

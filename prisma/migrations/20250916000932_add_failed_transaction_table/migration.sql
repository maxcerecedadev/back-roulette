-- CreateTable
CREATE TABLE "public"."FailedTransaction" (
    "id" TEXT NOT NULL,
    "playerId" TEXT NOT NULL,
    "roomId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "amount" DOUBLE PRECISION NOT NULL,
    "error" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FailedTransaction_pkey" PRIMARY KEY ("id")
);

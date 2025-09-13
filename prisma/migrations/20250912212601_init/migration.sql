-- CreateTable
CREATE TABLE "public"."users" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "externalToken" TEXT NOT NULL,
    "balance" DOUBLE PRECISION NOT NULL,
    "lastLogin" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."roulette_rounds" (
    "id" TEXT NOT NULL,
    "playerId" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "roundId" TEXT NOT NULL,
    "gameState" TEXT NOT NULL DEFAULT 'PAYOUT',
    "winningNumber" INTEGER NOT NULL,
    "winningColor" TEXT NOT NULL,
    "totalBetAmount" DOUBLE PRECISION NOT NULL,
    "totalWinnings" DOUBLE PRECISION NOT NULL,
    "netResult" DOUBLE PRECISION NOT NULL,
    "betResults" JSONB NOT NULL,
    "playerBalanceBefore" DOUBLE PRECISION NOT NULL,
    "playerBalanceAfter" DOUBLE PRECISION NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'ARS',
    "ipAddress" TEXT,
    "provider" TEXT NOT NULL DEFAULT 'internal',
    "reference" TEXT,
    "description" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "roulette_rounds_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_externalToken_key" ON "public"."users"("externalToken");

-- CreateIndex
CREATE INDEX "users_externalToken_idx" ON "public"."users"("externalToken");

-- CreateIndex
CREATE INDEX "users_name_idx" ON "public"."users"("name");

-- CreateIndex
CREATE UNIQUE INDEX "roulette_rounds_roundId_key" ON "public"."roulette_rounds"("roundId");

-- CreateIndex
CREATE INDEX "roulette_rounds_playerId_idx" ON "public"."roulette_rounds"("playerId");

-- CreateIndex
CREATE INDEX "roulette_rounds_sessionId_idx" ON "public"."roulette_rounds"("sessionId");

-- CreateIndex
CREATE INDEX "roulette_rounds_createdAt_idx" ON "public"."roulette_rounds"("createdAt");

-- AddForeignKey
ALTER TABLE "public"."roulette_rounds" ADD CONSTRAINT "roulette_rounds_playerId_fkey" FOREIGN KEY ("playerId") REFERENCES "public"."users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

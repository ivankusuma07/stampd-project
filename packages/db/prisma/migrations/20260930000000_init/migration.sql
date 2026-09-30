-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
CREATE TYPE "PostSource" AS ENUM ('TIMELINE', 'WEB');

-- CreateEnum
CREATE TYPE "PredictionStatus" AS ENUM ('DRAFT', 'IN_REVIEW', 'APPROVED', 'PUBLISHED', 'REJECTED');

-- CreateEnum
CREATE TYPE "ModerationRoute" AS ENUM ('AUTO_PUBLISH', 'REVIEW', 'AUTO_REJECT');

-- CreateEnum
CREATE TYPE "SubmissionStatus" AS ENUM ('QUEUED', 'DRAFTED', 'IN_REVIEW', 'APPROVED', 'REJECTED');

-- CreateEnum
CREATE TYPE "MarketStatus" AS ENUM ('PENDING', 'OPEN', 'CLOSED', 'PROPOSED', 'DISPUTED', 'RESOLVED');

-- CreateEnum
CREATE TYPE "Outcome" AS ENUM ('YES', 'NO');

-- CreateEnum
CREATE TYPE "Result" AS ENUM ('YES', 'NO', 'INVALID');

-- CreateEnum
CREATE TYPE "NotificationType" AS ENUM ('NEW_MARKET', 'RESOLVED', 'REDEEMABLE', 'SUBMISSION');

-- CreateEnum
CREATE TYPE "IngestStatus" AS ENUM ('RUNNING', 'OK', 'FAILED', 'SKIPPED');

-- CreateEnum
CREATE TYPE "TakedownStatus" AS ENUM ('OPEN', 'EXCLUDED', 'REJECTED');

-- CreateTable
CREATE TABLE "Kol" (
    "id" TEXT NOT NULL,
    "xHandle" TEXT NOT NULL,
    "xUserId" TEXT,
    "name" TEXT NOT NULL,
    "avatarUrl" TEXT,
    "tracked" BOOLEAN NOT NULL DEFAULT true,
    "excluded" BOOLEAN NOT NULL DEFAULT false,
    "excludedReason" TEXT,
    "pollIntervalMin" INTEGER NOT NULL DEFAULT 30,
    "lastSeenPostId" TEXT,
    "lastFetchedAt" TIMESTAMP(3),
    "profileRefreshedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Kol_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Post" (
    "id" TEXT NOT NULL,
    "xPostId" TEXT NOT NULL,
    "kolId" TEXT,
    "authorHandle" TEXT NOT NULL,
    "authorId" TEXT NOT NULL,
    "text" TEXT NOT NULL,
    "postedAt" TIMESTAMP(3) NOT NULL,
    "url" TEXT NOT NULL,
    "replyToId" TEXT,
    "quotedId" TEXT,
    "isRepost" BOOLEAN NOT NULL DEFAULT false,
    "deletedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Post_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Prediction" (
    "id" TEXT NOT NULL,
    "postId" TEXT NOT NULL,
    "source" "PostSource" NOT NULL,
    "submittedBy" TEXT,
    "status" "PredictionStatus" NOT NULL DEFAULT 'DRAFT',
    "extracted" JSONB,
    "check" JSONB,
    "validatorErrors" JSONB NOT NULL DEFAULT '[]',
    "route" "ModerationRoute",
    "template" TEXT,
    "aiDecision" TEXT,
    "humanDecision" TEXT,
    "reviewerWallet" TEXT,
    "reviewReason" TEXT,
    "reviewedAt" TIMESTAMP(3),
    "edited" BOOLEAN NOT NULL DEFAULT false,
    "spec" JSONB,
    "seedAmount" DECIMAL(78,0),
    "openingPriceBps" INTEGER,
    "feeBps" INTEGER,
    "createTxHash" TEXT,
    "createError" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Prediction_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AiCall" (
    "id" TEXT NOT NULL,
    "predictionId" TEXT,
    "stage" TEXT NOT NULL,
    "model" TEXT NOT NULL,
    "inputTokens" INTEGER NOT NULL,
    "outputTokens" INTEGER NOT NULL,
    "costUsd" DECIMAL(12,6) NOT NULL,
    "latencyMs" INTEGER NOT NULL,
    "ok" BOOLEAN NOT NULL,
    "output" JSONB,
    "error" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AiCall_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Submission" (
    "id" TEXT NOT NULL,
    "wallet" TEXT NOT NULL,
    "xPostUrl" TEXT NOT NULL,
    "xPostId" TEXT NOT NULL,
    "status" "SubmissionStatus" NOT NULL DEFAULT 'QUEUED',
    "reason" TEXT,
    "predictionId" TEXT,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Submission_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Market" (
    "id" TEXT NOT NULL,
    "onchainId" BIGINT,
    "chainId" INTEGER NOT NULL,
    "predictionId" TEXT,
    "kolId" TEXT NOT NULL,
    "question" TEXT NOT NULL,
    "rules" TEXT NOT NULL,
    "spec" JSONB NOT NULL,
    "questionHash" TEXT NOT NULL,
    "specUri" TEXT,
    "category" TEXT NOT NULL,
    "sourcePostId" TEXT NOT NULL,
    "sourcePostUrl" TEXT NOT NULL,
    "kolSide" "Outcome" NOT NULL,
    "closeTime" TIMESTAMP(3) NOT NULL,
    "resolveBy" TIMESTAMP(3) NOT NULL,
    "status" "MarketStatus" NOT NULL DEFAULT 'PENDING',
    "result" "Result",
    "paused" BOOLEAN NOT NULL DEFAULT false,
    "feeBps" INTEGER NOT NULL,
    "seedAmount" DECIMAL(78,0) NOT NULL,
    "openingYesPriceBps" INTEGER NOT NULL,
    "yesPriceBps" INTEGER NOT NULL,
    "yesReserve" DECIMAL(78,0) NOT NULL DEFAULT 0,
    "noReserve" DECIMAL(78,0) NOT NULL DEFAULT 0,
    "collateral" DECIMAL(78,0) NOT NULL DEFAULT 0,
    "fees" DECIMAL(78,0) NOT NULL DEFAULT 0,
    "volume" DECIMAL(78,0) NOT NULL DEFAULT 0,
    "tradeCount" INTEGER NOT NULL DEFAULT 0,
    "uniqueVerifiedTraders24h" INTEGER NOT NULL DEFAULT 0,
    "firstTradeAt" TIMESTAMP(3),
    "kolSideTwap24hBps" INTEGER,
    "submittedBy" TEXT,
    "createTxHash" TEXT,
    "openedAt" TIMESTAMP(3),
    "openedBlock" BIGINT,
    "settledAt" TIMESTAMP(3),
    "settledTxHash" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Market_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Trade" (
    "id" TEXT NOT NULL,
    "txHash" TEXT NOT NULL,
    "logIndex" INTEGER NOT NULL,
    "marketId" TEXT NOT NULL,
    "wallet" TEXT NOT NULL,
    "outcome" "Outcome" NOT NULL,
    "isBuy" BOOLEAN NOT NULL,
    "collateral" DECIMAL(78,0) NOT NULL,
    "shares" DECIMAL(78,0) NOT NULL,
    "fee" DECIMAL(78,0) NOT NULL,
    "priceAfterBps" INTEGER NOT NULL,
    "blockNumber" BIGINT NOT NULL,
    "blockTime" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Trade_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Position" (
    "wallet" TEXT NOT NULL,
    "marketId" TEXT NOT NULL,
    "yesShares" DECIMAL(78,0) NOT NULL DEFAULT 0,
    "noShares" DECIMAL(78,0) NOT NULL DEFAULT 0,
    "costBasis" DECIMAL(78,0) NOT NULL DEFAULT 0,
    "realizedPnl" DECIMAL(78,0) NOT NULL DEFAULT 0,
    "redeemedAt" TIMESTAMP(3),
    "payout" DECIMAL(78,0),
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Position_pkey" PRIMARY KEY ("wallet","marketId")
);

-- CreateTable
CREATE TABLE "PricePoint" (
    "id" BIGSERIAL NOT NULL,
    "marketId" TEXT NOT NULL,
    "t" TIMESTAMP(3) NOT NULL,
    "yesPriceBps" INTEGER NOT NULL,
    "source" TEXT NOT NULL,

    CONSTRAINT "PricePoint_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Resolution" (
    "marketId" TEXT NOT NULL,
    "proposedOutcome" "Result" NOT NULL,
    "proposer" TEXT NOT NULL,
    "evidenceUri" TEXT NOT NULL,
    "evidence" JSONB,
    "disputeEnds" TIMESTAMP(3) NOT NULL,
    "disputed" BOOLEAN NOT NULL DEFAULT false,
    "disputer" TEXT,
    "finalOutcome" "Result",
    "proposedTxHash" TEXT NOT NULL,
    "finalizedAt" TIMESTAMP(3),
    "finalizedTxHash" TEXT,

    CONSTRAINT "Resolution_pkey" PRIMARY KEY ("marketId")
);

-- CreateTable
CREATE TABLE "User" (
    "wallet" TEXT NOT NULL,
    "displayName" TEXT,
    "points" INTEGER NOT NULL DEFAULT 0,
    "captchaVerifiedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "User_pkey" PRIMARY KEY ("wallet")
);

-- CreateTable
CREATE TABLE "Follow" (
    "userWallet" TEXT NOT NULL,
    "kolId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Follow_pkey" PRIMARY KEY ("userWallet","kolId")
);

-- CreateTable
CREATE TABLE "Watch" (
    "userWallet" TEXT NOT NULL,
    "marketId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Watch_pkey" PRIMARY KEY ("userWallet","marketId")
);

-- CreateTable
CREATE TABLE "Notification" (
    "id" TEXT NOT NULL,
    "userWallet" TEXT NOT NULL,
    "type" "NotificationType" NOT NULL,
    "refId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "href" TEXT NOT NULL,
    "readAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Notification_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Callout" (
    "id" TEXT NOT NULL,
    "userWallet" TEXT NOT NULL,
    "marketId" TEXT NOT NULL,
    "side" "Outcome" NOT NULL,
    "text" TEXT NOT NULL,
    "parentId" TEXT,
    "likeCount" INTEGER NOT NULL DEFAULT 0,
    "hidden" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Callout_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CalloutLike" (
    "calloutId" TEXT NOT NULL,
    "wallet" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CalloutLike_pkey" PRIMARY KEY ("calloutId","wallet")
);

-- CreateTable
CREATE TABLE "CalloutReport" (
    "id" TEXT NOT NULL,
    "calloutId" TEXT NOT NULL,
    "wallet" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CalloutReport_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MarketFlag" (
    "id" TEXT NOT NULL,
    "marketId" TEXT NOT NULL,
    "wallet" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MarketFlag_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "KolStats" (
    "kolId" TEXT NOT NULL,
    "live" INTEGER NOT NULL DEFAULT 0,
    "resolved" INTEGER NOT NULL DEFAULT 0,
    "correct" INTEGER NOT NULL DEFAULT 0,
    "invalid" INTEGER NOT NULL DEFAULT 0,
    "hitRate" DOUBLE PRECISION,
    "avgEdge" DOUBLE PRECISION,
    "edgeN" INTEGER NOT NULL DEFAULT 0,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "KolStats_pkey" PRIMARY KEY ("kolId")
);

-- CreateTable
CREATE TABLE "IngestRun" (
    "id" TEXT NOT NULL,
    "jobType" TEXT NOT NULL,
    "kolId" TEXT,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finishedAt" TIMESTAMP(3),
    "status" "IngestStatus" NOT NULL DEFAULT 'RUNNING',
    "postsReturned" INTEGER NOT NULL DEFAULT 0,
    "error" TEXT,

    CONSTRAINT "IngestRun_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ChainEvent" (
    "id" BIGSERIAL NOT NULL,
    "chainId" INTEGER NOT NULL,
    "blockNumber" BIGINT NOT NULL,
    "blockHash" TEXT NOT NULL,
    "blockTime" TIMESTAMP(3) NOT NULL,
    "txHash" TEXT NOT NULL,
    "logIndex" INTEGER NOT NULL,
    "address" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "marketId" BIGINT,
    "args" JSONB NOT NULL,

    CONSTRAINT "ChainEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "IndexerCursor" (
    "id" TEXT NOT NULL,
    "blockNumber" BIGINT NOT NULL,
    "blockHash" TEXT NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "IndexerCursor_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "IndexedBlock" (
    "chainId" INTEGER NOT NULL,
    "blockNumber" BIGINT NOT NULL,
    "blockHash" TEXT NOT NULL,

    CONSTRAINT "IndexedBlock_pkey" PRIMARY KEY ("chainId","blockNumber")
);

-- CreateTable
CREATE TABLE "SystemAlert" (
    "id" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "data" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "resolvedAt" TIMESTAMP(3),

    CONSTRAINT "SystemAlert_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TakedownRequest" (
    "id" TEXT NOT NULL,
    "kolHandle" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "contact" TEXT NOT NULL,
    "urls" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "status" "TakedownStatus" NOT NULL DEFAULT 'OPEN',
    "handledBy" TEXT,
    "handledAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TakedownRequest_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AdminAudit" (
    "id" TEXT NOT NULL,
    "adminWallet" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "target" TEXT,
    "data" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AdminAudit_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FaucetClaim" (
    "id" TEXT NOT NULL,
    "wallet" TEXT NOT NULL,
    "ipHash" TEXT NOT NULL,
    "amount" DECIMAL(78,0) NOT NULL,
    "nonce" INTEGER NOT NULL,
    "deadline" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FaucetClaim_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Kol_xHandle_key" ON "Kol"("xHandle");

-- CreateIndex
CREATE UNIQUE INDEX "Kol_xUserId_key" ON "Kol"("xUserId");

-- CreateIndex
CREATE UNIQUE INDEX "Post_xPostId_key" ON "Post"("xPostId");

-- CreateIndex
CREATE INDEX "Post_kolId_postedAt_idx" ON "Post"("kolId", "postedAt");

-- CreateIndex
CREATE INDEX "Prediction_status_createdAt_idx" ON "Prediction"("status", "createdAt");

-- CreateIndex
CREATE INDEX "Submission_wallet_createdAt_idx" ON "Submission"("wallet", "createdAt");

-- CreateIndex
CREATE INDEX "Submission_status_idx" ON "Submission"("status");

-- CreateIndex
CREATE UNIQUE INDEX "Submission_wallet_xPostId_key" ON "Submission"("wallet", "xPostId");

-- CreateIndex
CREATE UNIQUE INDEX "Market_onchainId_key" ON "Market"("onchainId");

-- CreateIndex
CREATE UNIQUE INDEX "Market_predictionId_key" ON "Market"("predictionId");

-- CreateIndex
CREATE UNIQUE INDEX "Market_questionHash_key" ON "Market"("questionHash");

-- CreateIndex
CREATE INDEX "Market_status_closeTime_idx" ON "Market"("status", "closeTime");

-- CreateIndex
CREATE INDEX "Market_kolId_status_idx" ON "Market"("kolId", "status");

-- CreateIndex
CREATE INDEX "Market_category_status_idx" ON "Market"("category", "status");

-- CreateIndex
CREATE INDEX "Trade_marketId_blockTime_idx" ON "Trade"("marketId", "blockTime");

-- CreateIndex
CREATE INDEX "Trade_wallet_blockTime_idx" ON "Trade"("wallet", "blockTime");

-- CreateIndex
CREATE UNIQUE INDEX "Trade_txHash_logIndex_key" ON "Trade"("txHash", "logIndex");

-- CreateIndex
CREATE INDEX "Position_marketId_idx" ON "Position"("marketId");

-- CreateIndex
CREATE INDEX "PricePoint_marketId_t_idx" ON "PricePoint"("marketId", "t");

-- CreateIndex
CREATE UNIQUE INDEX "PricePoint_marketId_t_source_key" ON "PricePoint"("marketId", "t", "source");

-- CreateIndex
CREATE INDEX "Follow_kolId_idx" ON "Follow"("kolId");

-- CreateIndex
CREATE INDEX "Watch_marketId_idx" ON "Watch"("marketId");

-- CreateIndex
CREATE INDEX "Notification_userWallet_createdAt_idx" ON "Notification"("userWallet", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "Notification_userWallet_type_refId_key" ON "Notification"("userWallet", "type", "refId");

-- CreateIndex
CREATE INDEX "Callout_marketId_createdAt_idx" ON "Callout"("marketId", "createdAt");

-- CreateIndex
CREATE INDEX "Callout_createdAt_idx" ON "Callout"("createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "CalloutReport_calloutId_wallet_key" ON "CalloutReport"("calloutId", "wallet");

-- CreateIndex
CREATE UNIQUE INDEX "MarketFlag_marketId_wallet_key" ON "MarketFlag"("marketId", "wallet");

-- CreateIndex
CREATE INDEX "IngestRun_jobType_startedAt_idx" ON "IngestRun"("jobType", "startedAt");

-- CreateIndex
CREATE INDEX "ChainEvent_chainId_blockNumber_idx" ON "ChainEvent"("chainId", "blockNumber");

-- CreateIndex
CREATE INDEX "ChainEvent_marketId_blockNumber_logIndex_idx" ON "ChainEvent"("marketId", "blockNumber", "logIndex");

-- CreateIndex
CREATE UNIQUE INDEX "ChainEvent_txHash_logIndex_key" ON "ChainEvent"("txHash", "logIndex");

-- CreateIndex
CREATE INDEX "SystemAlert_resolvedAt_createdAt_idx" ON "SystemAlert"("resolvedAt", "createdAt");

-- CreateIndex
CREATE INDEX "AdminAudit_createdAt_idx" ON "AdminAudit"("createdAt");

-- CreateIndex
CREATE INDEX "FaucetClaim_wallet_createdAt_idx" ON "FaucetClaim"("wallet", "createdAt");

-- CreateIndex
CREATE INDEX "FaucetClaim_ipHash_createdAt_idx" ON "FaucetClaim"("ipHash", "createdAt");

-- AddForeignKey
ALTER TABLE "Post" ADD CONSTRAINT "Post_kolId_fkey" FOREIGN KEY ("kolId") REFERENCES "Kol"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Prediction" ADD CONSTRAINT "Prediction_postId_fkey" FOREIGN KEY ("postId") REFERENCES "Post"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AiCall" ADD CONSTRAINT "AiCall_predictionId_fkey" FOREIGN KEY ("predictionId") REFERENCES "Prediction"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Submission" ADD CONSTRAINT "Submission_predictionId_fkey" FOREIGN KEY ("predictionId") REFERENCES "Prediction"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Market" ADD CONSTRAINT "Market_kolId_fkey" FOREIGN KEY ("kolId") REFERENCES "Kol"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Market" ADD CONSTRAINT "Market_predictionId_fkey" FOREIGN KEY ("predictionId") REFERENCES "Prediction"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Trade" ADD CONSTRAINT "Trade_marketId_fkey" FOREIGN KEY ("marketId") REFERENCES "Market"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Position" ADD CONSTRAINT "Position_marketId_fkey" FOREIGN KEY ("marketId") REFERENCES "Market"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PricePoint" ADD CONSTRAINT "PricePoint_marketId_fkey" FOREIGN KEY ("marketId") REFERENCES "Market"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Resolution" ADD CONSTRAINT "Resolution_marketId_fkey" FOREIGN KEY ("marketId") REFERENCES "Market"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Follow" ADD CONSTRAINT "Follow_userWallet_fkey" FOREIGN KEY ("userWallet") REFERENCES "User"("wallet") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Follow" ADD CONSTRAINT "Follow_kolId_fkey" FOREIGN KEY ("kolId") REFERENCES "Kol"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Watch" ADD CONSTRAINT "Watch_userWallet_fkey" FOREIGN KEY ("userWallet") REFERENCES "User"("wallet") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Watch" ADD CONSTRAINT "Watch_marketId_fkey" FOREIGN KEY ("marketId") REFERENCES "Market"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Notification" ADD CONSTRAINT "Notification_userWallet_fkey" FOREIGN KEY ("userWallet") REFERENCES "User"("wallet") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Callout" ADD CONSTRAINT "Callout_userWallet_fkey" FOREIGN KEY ("userWallet") REFERENCES "User"("wallet") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Callout" ADD CONSTRAINT "Callout_marketId_fkey" FOREIGN KEY ("marketId") REFERENCES "Market"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Callout" ADD CONSTRAINT "Callout_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "Callout"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CalloutLike" ADD CONSTRAINT "CalloutLike_calloutId_fkey" FOREIGN KEY ("calloutId") REFERENCES "Callout"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CalloutReport" ADD CONSTRAINT "CalloutReport_calloutId_fkey" FOREIGN KEY ("calloutId") REFERENCES "Callout"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MarketFlag" ADD CONSTRAINT "MarketFlag_marketId_fkey" FOREIGN KEY ("marketId") REFERENCES "Market"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "KolStats" ADD CONSTRAINT "KolStats_kolId_fkey" FOREIGN KEY ("kolId") REFERENCES "Kol"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "IngestRun" ADD CONSTRAINT "IngestRun_kolId_fkey" FOREIGN KEY ("kolId") REFERENCES "Kol"("id") ON DELETE SET NULL ON UPDATE CASCADE;


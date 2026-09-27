-- BayMax (Max, the voice planning agent) — adds the ten models from docs/BayMax/spec/03-data-model.md
-- on top of the existing schema. See docs/BayMax/implementation/02-database-migration.md for the
-- procedure this followed.

-- AlterTable
ALTER TABLE "GeneratedPlan" ADD COLUMN     "version" INTEGER NOT NULL DEFAULT 1,
ALTER COLUMN "coursesPerTerm" SET DEFAULT 4;

-- CreateTable
CREATE TABLE "MaxSettings" (
    "userId" BIGINT NOT NULL,
    "phoneE164" VARCHAR,
    "phoneVerifiedAt" TIMESTAMP(6),
    "callConsentGranted" BOOLEAN NOT NULL DEFAULT false,
    "callConsentVersion" VARCHAR,
    "callConsentAt" TIMESTAMP(6),
    "timezone" VARCHAR,
    "hasMetMax" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(6) NOT NULL,

    CONSTRAINT "MaxSettings_pkey" PRIMARY KEY ("userId")
);

-- CreateTable
CREATE TABLE "StudentPreference" (
    "preferenceId" BIGSERIAL NOT NULL,
    "userId" BIGINT NOT NULL,
    "key" VARCHAR NOT NULL,
    "value" JSONB NOT NULL,
    "source" VARCHAR NOT NULL,
    "evidence" TEXT,
    "createdAt" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(6) NOT NULL,

    CONSTRAINT "StudentPreference_pkey" PRIMARY KEY ("preferenceId")
);

-- CreateTable
CREATE TABLE "StudentNote" (
    "noteId" BIGSERIAL NOT NULL,
    "userId" BIGINT NOT NULL,
    "text" TEXT NOT NULL,
    "source" VARCHAR NOT NULL,
    "createdAt" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "StudentNote_pkey" PRIMARY KEY ("noteId")
);

-- CreateTable
CREATE TABLE "PlanVersion" (
    "planVersionId" BIGSERIAL NOT NULL,
    "planId" BIGINT NOT NULL,
    "versionNumber" INTEGER NOT NULL,
    "parentVersion" INTEGER,
    "targetProgramId" VARCHAR NOT NULL,
    "minorProgramId" VARCHAR,
    "targetSpecializationIds" TEXT[],
    "coursesPerTerm" INTEGER NOT NULL,
    "startSeason" VARCHAR NOT NULL,
    "startYear" INTEGER NOT NULL,
    "terms" JSONB NOT NULL,
    "projectedGradSeason" VARCHAR,
    "projectedGradYear" INTEGER,
    "validation" JSONB NOT NULL,
    "plannerVersion" VARCHAR NOT NULL,
    "inputsHash" VARCHAR NOT NULL,
    "createdBy" VARCHAR NOT NULL,
    "scenarioId" BIGINT,
    "createdAt" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PlanVersion_pkey" PRIMARY KEY ("planVersionId")
);

-- CreateTable
CREATE TABLE "Scenario" (
    "scenarioId" BIGSERIAL NOT NULL,
    "userId" BIGINT NOT NULL,
    "baseVersion" INTEGER NOT NULL,
    "operations" JSONB NOT NULL,
    "resultInputs" JSONB,
    "resultTerms" JSONB,
    "diff" JSONB,
    "validation" JSONB,
    "status" VARCHAR NOT NULL,
    "presentedHash" VARCHAR,
    "presentedAt" TIMESTAMP(6),
    "presentedVia" VARCHAR,
    "origin" VARCHAR NOT NULL,
    "callId" BIGINT,
    "expiresAt" TIMESTAMP(6) NOT NULL,
    "createdAt" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(6) NOT NULL,

    CONSTRAINT "Scenario_pkey" PRIMARY KEY ("scenarioId")
);

-- CreateTable
CREATE TABLE "MaxCall" (
    "callId" BIGSERIAL NOT NULL,
    "userId" BIGINT NOT NULL,
    "vapiCallId" VARCHAR,
    "status" VARCHAR NOT NULL,
    "endedReason" VARCHAR,
    "startedAt" TIMESTAMP(6),
    "endedAt" TIMESTAMP(6),
    "durationSec" INTEGER,
    "recordingUrl" VARCHAR,
    "transcript" JSONB,
    "createdAt" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(6) NOT NULL,

    CONSTRAINT "MaxCall_pkey" PRIMARY KEY ("callId")
);

-- CreateTable
CREATE TABLE "MaxToolCall" (
    "toolCallId" VARCHAR NOT NULL,
    "callId" BIGINT NOT NULL,
    "toolName" VARCHAR NOT NULL,
    "args" JSONB NOT NULL,
    "result" JSONB,
    "ok" BOOLEAN,
    "errorCode" VARCHAR,
    "latencyMs" INTEGER,
    "createdAt" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MaxToolCall_pkey" PRIMARY KEY ("toolCallId")
);

-- CreateTable
CREATE TABLE "ConversationSummary" (
    "summaryId" BIGSERIAL NOT NULL,
    "userId" BIGINT NOT NULL,
    "callId" BIGINT NOT NULL,
    "summary" TEXT NOT NULL,
    "openThreads" JSONB NOT NULL,
    "flagged" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ConversationSummary_pkey" PRIMARY KEY ("summaryId")
);

-- CreateTable
CREATE TABLE "AuditLog" (
    "auditId" BIGSERIAL NOT NULL,
    "userId" BIGINT NOT NULL,
    "actor" VARCHAR NOT NULL,
    "action" VARCHAR NOT NULL,
    "before" JSONB,
    "after" JSONB,
    "callId" BIGINT,
    "scenarioId" BIGINT,
    "createdAt" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AuditLog_pkey" PRIMARY KEY ("auditId")
);

-- CreateIndex
CREATE UNIQUE INDEX "StudentPreference_userId_key_key" ON "StudentPreference"("userId", "key");

-- CreateIndex
CREATE INDEX "StudentNote_userId_idx" ON "StudentNote"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "PlanVersion_scenarioId_key" ON "PlanVersion"("scenarioId");

-- CreateIndex
CREATE UNIQUE INDEX "PlanVersion_planId_versionNumber_key" ON "PlanVersion"("planId", "versionNumber");

-- CreateIndex
CREATE INDEX "Scenario_userId_status_idx" ON "Scenario"("userId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "MaxCall_vapiCallId_key" ON "MaxCall"("vapiCallId");

-- CreateIndex
CREATE INDEX "MaxCall_userId_createdAt_idx" ON "MaxCall"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "MaxToolCall_callId_idx" ON "MaxToolCall"("callId");

-- CreateIndex
CREATE UNIQUE INDEX "ConversationSummary_callId_key" ON "ConversationSummary"("callId");

-- CreateIndex
CREATE INDEX "ConversationSummary_userId_createdAt_idx" ON "ConversationSummary"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "AuditLog_userId_createdAt_idx" ON "AuditLog"("userId", "createdAt");

-- AddForeignKey
ALTER TABLE "MaxSettings" ADD CONSTRAINT "MaxSettings_userId_fkey" FOREIGN KEY ("userId") REFERENCES "UserInfo"("userId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StudentPreference" ADD CONSTRAINT "StudentPreference_userId_fkey" FOREIGN KEY ("userId") REFERENCES "UserInfo"("userId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StudentNote" ADD CONSTRAINT "StudentNote_userId_fkey" FOREIGN KEY ("userId") REFERENCES "UserInfo"("userId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PlanVersion" ADD CONSTRAINT "PlanVersion_planId_fkey" FOREIGN KEY ("planId") REFERENCES "GeneratedPlan"("planId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PlanVersion" ADD CONSTRAINT "PlanVersion_scenarioId_fkey" FOREIGN KEY ("scenarioId") REFERENCES "Scenario"("scenarioId") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Scenario" ADD CONSTRAINT "Scenario_userId_fkey" FOREIGN KEY ("userId") REFERENCES "UserInfo"("userId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Scenario" ADD CONSTRAINT "Scenario_callId_fkey" FOREIGN KEY ("callId") REFERENCES "MaxCall"("callId") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MaxCall" ADD CONSTRAINT "MaxCall_userId_fkey" FOREIGN KEY ("userId") REFERENCES "UserInfo"("userId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MaxToolCall" ADD CONSTRAINT "MaxToolCall_callId_fkey" FOREIGN KEY ("callId") REFERENCES "MaxCall"("callId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ConversationSummary" ADD CONSTRAINT "ConversationSummary_userId_fkey" FOREIGN KEY ("userId") REFERENCES "UserInfo"("userId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ConversationSummary" ADD CONSTRAINT "ConversationSummary_callId_fkey" FOREIGN KEY ("callId") REFERENCES "MaxCall"("callId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuditLog" ADD CONSTRAINT "AuditLog_userId_fkey" FOREIGN KEY ("userId") REFERENCES "UserInfo"("userId") ON DELETE CASCADE ON UPDATE CASCADE;

-- Hand-added: Prisma's schema language can't express partial unique indexes, so these two are
-- written directly (docs/BayMax/spec/03-data-model.md).

-- One verified phone number per account (MaxSettings.phoneE164, only when verified).
CREATE UNIQUE INDEX "max_settings_verified_phone_uq"
  ON "MaxSettings" ("phoneE164") WHERE "phoneVerifiedAt" IS NOT NULL;

-- One active call per student at a time.
CREATE UNIQUE INDEX "max_call_one_active_uq"
  ON "MaxCall" ("userId") WHERE "status" IN ('queued', 'ringing', 'in_progress');

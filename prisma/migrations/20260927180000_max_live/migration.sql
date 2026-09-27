-- Max live on the Skill Tree: the call's live channel token, the app's plan inputs, and the UI heartbeat.
ALTER TABLE "MaxCall" ADD COLUMN "liveToken" VARCHAR;
ALTER TABLE "MaxCall" ADD COLUMN "planInputs" JSONB;
ALTER TABLE "MaxCall" ADD COLUMN "uiSeenAt" TIMESTAMP(6);

CREATE UNIQUE INDEX "MaxCall_liveToken_key" ON "MaxCall"("liveToken");

-- StudyMax standardized on Firebase Auth (see src/lib/auth.ts) instead of Clerk, so UserInfo's
-- identity column is renamed to match: `authUid` holds a Firebase AuthUser.uid, not a Clerk id.
ALTER TABLE "UserInfo" RENAME COLUMN "clerkId" TO "authUid";
ALTER INDEX "UserInfo_clerkId_key" RENAME TO "UserInfo_authUid_key";

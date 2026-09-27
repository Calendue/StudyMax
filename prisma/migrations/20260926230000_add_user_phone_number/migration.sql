-- Onboarding's phone number, stored on the account for signed-in students (api/session.ts).
-- StudentCourse.status also gains "registered" (onboarding's this-term courses); status is a plain
-- VARCHAR validated app-side, so that needs no DDL.
-- AlterTable
ALTER TABLE "UserInfo" ADD COLUMN     "phoneNumber" VARCHAR;

-- Onboarding's internship question (api/session.ts, lib/plan.ts's `away`): the year of the degree
-- spent on an internship ("3" | "4"), "unsure" or "no". Nullable: never answered.
-- AlterTable
ALTER TABLE "StudentProfile" ADD COLUMN     "internship" VARCHAR;

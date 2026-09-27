-- How much the plan may schedule: onboarding's Spring/Summer choice and the student's maximum
-- courses per regular (Fall/Winter) term and per Spring/Summer term (api/session.ts, lib/plan.ts).
-- Defaults match the app's own, so existing profiles plan exactly as before.
-- AlterTable
ALTER TABLE "StudentProfile" ADD COLUMN     "springSummer" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "maxCoursesPerTerm" INTEGER NOT NULL DEFAULT 2,
ADD COLUMN     "maxSummerCourses" INTEGER NOT NULL DEFAULT 2;

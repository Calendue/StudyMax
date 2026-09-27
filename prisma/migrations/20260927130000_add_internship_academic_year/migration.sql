-- The academic year an internship takes (its Fall's calendar year), as the app resolved it, so the
-- server-built plan snapshot Max reads (api/session.ts, api/max/_scenarios.ts) leaves it empty too.
-- Nullable: no internship year picked.
-- AlterTable
ALTER TABLE "StudentProfile" ADD COLUMN     "internshipAcademicYear" INTEGER;

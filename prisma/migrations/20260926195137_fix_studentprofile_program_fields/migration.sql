-- The initial schema modeled major/minor/concentration as freeform strings, but the actual onboarding
-- wizard (src/components/onboarding/types.ts's OnboardingProfile) collects majorProgramId/minorProgramId
-- as Program.id slugs and concentrationIds as a multi-select of Specialization.id slugs. Table was empty,
-- so this is a straight drop+add rather than a data-preserving rename.
-- AlterTable
ALTER TABLE "StudentProfile" DROP COLUMN "concentration",
DROP COLUMN "major",
DROP COLUMN "minor",
ADD COLUMN     "concentrationIds" TEXT[],
ADD COLUMN     "majorProgramId" VARCHAR NOT NULL,
ADD COLUMN     "minorProgramId" VARCHAR;


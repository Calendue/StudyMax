-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateTable
CREATE TABLE "UserInfo" (
    "userId" BIGSERIAL NOT NULL,
    "clerkId" VARCHAR NOT NULL,
    "firstName" VARCHAR,
    "lastName" VARCHAR,
    "email" VARCHAR,
    "createdAt" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(6) NOT NULL,

    CONSTRAINT "UserInfo_pkey" PRIMARY KEY ("userId")
);

-- CreateTable
CREATE TABLE "StudentProfile" (
    "profileId" BIGSERIAL NOT NULL,
    "userId" BIGINT NOT NULL,
    "studentType" VARCHAR NOT NULL,
    "institutionId" BIGINT NOT NULL,
    "degree" VARCHAR NOT NULL,
    "major" VARCHAR NOT NULL,
    "minor" VARCHAR,
    "concentration" VARCHAR,
    "startingTermSeason" VARCHAR,
    "startingTermYear" INTEGER,
    "goals" TEXT,
    "createdAt" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(6) NOT NULL,

    CONSTRAINT "StudentProfile_pkey" PRIMARY KEY ("profileId")
);

-- CreateTable
CREATE TABLE "StudentCourse" (
    "studentCourseId" BIGSERIAL NOT NULL,
    "userId" BIGINT NOT NULL,
    "courseCode" VARCHAR NOT NULL,
    "status" VARCHAR NOT NULL,
    "source" VARCHAR NOT NULL DEFAULT 'manual',
    "createdAt" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(6) NOT NULL,

    CONSTRAINT "StudentCourse_pkey" PRIMARY KEY ("studentCourseId")
);

-- CreateTable
CREATE TABLE "GeneratedPlan" (
    "planId" BIGSERIAL NOT NULL,
    "userId" BIGINT NOT NULL,
    "targetProgramId" VARCHAR NOT NULL,
    "targetSpecializationIds" TEXT[],
    "coursesPerTerm" INTEGER NOT NULL DEFAULT 2,
    "startSeason" VARCHAR NOT NULL,
    "startYear" INTEGER NOT NULL,
    "terms" JSONB NOT NULL,
    "createdAt" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(6) NOT NULL,

    CONSTRAINT "GeneratedPlan_pkey" PRIMARY KEY ("planId")
);

-- CreateTable
CREATE TABLE "Institution" (
    "institutionId" BIGSERIAL NOT NULL,
    "name" VARCHAR NOT NULL,
    "province" VARCHAR,
    "city" VARCHAR,
    "country" VARCHAR,
    "timezone" VARCHAR NOT NULL,
    "isCustom" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Institution_pkey" PRIMARY KEY ("institutionId")
);

-- CreateTable
CREATE TABLE "Major" (
    "majorId" BIGSERIAL NOT NULL,
    "name" VARCHAR NOT NULL,
    "isCustom" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Major_pkey" PRIMARY KEY ("majorId")
);

-- CreateIndex
CREATE UNIQUE INDEX "UserInfo_clerkId_key" ON "UserInfo"("clerkId");

-- CreateIndex
CREATE UNIQUE INDEX "StudentProfile_userId_key" ON "StudentProfile"("userId");

-- CreateIndex
CREATE INDEX "StudentProfile_institutionId_idx" ON "StudentProfile"("institutionId");

-- CreateIndex
CREATE UNIQUE INDEX "StudentCourse_userId_courseCode_status_key" ON "StudentCourse"("userId", "courseCode", "status");

-- CreateIndex
CREATE UNIQUE INDEX "GeneratedPlan_userId_key" ON "GeneratedPlan"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "Institution_name_key" ON "Institution"("name");

-- CreateIndex
CREATE UNIQUE INDEX "Major_name_key" ON "Major"("name");

-- AddForeignKey
ALTER TABLE "StudentProfile" ADD CONSTRAINT "StudentProfile_userId_fkey" FOREIGN KEY ("userId") REFERENCES "UserInfo"("userId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StudentProfile" ADD CONSTRAINT "StudentProfile_institutionId_fkey" FOREIGN KEY ("institutionId") REFERENCES "Institution"("institutionId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StudentCourse" ADD CONSTRAINT "StudentCourse_userId_fkey" FOREIGN KEY ("userId") REFERENCES "UserInfo"("userId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GeneratedPlan" ADD CONSTRAINT "GeneratedPlan_userId_fkey" FOREIGN KEY ("userId") REFERENCES "UserInfo"("userId") ON DELETE CASCADE ON UPDATE CASCADE;


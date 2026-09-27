// Seeds the one demo student Max's tools and every BayMax table point at this weekend
// (docs/BayMax/implementation/01-seed-demo-student.md). Idempotent: upserts by the fixed
// authUid "baymax-demo-student", so re-running it never duplicates rows.
//
// Run: node --experimental-strip-types --experimental-loader ./scripts/_resolve-ts-loader.mjs --env-file=.env.local scripts/seed-demo-student.ts
import { createHash } from 'node:crypto'
import { PrismaClient } from '@prisma/client'
import { regenerate } from '../src/lib/max/planningAdapter.ts'
import { specializations } from '../src/data/specializations.ts'
import { completedCourses, inProgressCourses } from '../src/data/transcript.ts'

const AUTH_UID = 'baymax-demo-student'
const USASK_INSTITUTION = 'University of Saskatchewan'
const TARGET_PROGRAM_ID = 'computer-science'
const TARGET_SPECIALIZATION_ID = 'software-development'
// The app's default full load, no Spring/Summer: the same settings api/session.ts plans with, and
// the plan is the whole Four-year degree (the program's default), as the app draws it.
const COURSES_PER_TERM = 5
const SPRING_SUMMER = false
const SUMMER_PER_TERM = 2
// Hardcoded (not upcomingTerm(new Date())) so the seeded plan always matches the exact,
// hand-verified demo numbers regardless of what day this is re-run (see 01-seed-demo-student.md
// step 5 and 6): Winter 2027 baseline (CMPT 371, 470 and three degree electives at 5 a term), and
// dropping CMPT370 pushes graduation to Winter 2028 —
// re-verified after src/lib/plan.ts became offerings-aware (src/data/offerings.ts): CMPT371/CMPT470
// only run in Winter, so they can no longer land in the very next (Fall) term once CMPT370 isn't
// done — a full year out, not one term (originally verified as Fall 2027, before that change).
const START = { season: 'Winter' as const, year: 2027 }
// Keep in step with api/_planVersion.ts.
const PLANNER_VERSION = 'lib/planner@exact-v3'

const prisma = new PrismaClient()

const targetSpec = specializations.find((s) => s.id === TARGET_SPECIALIZATION_ID)
if (!targetSpec) {
  throw new Error(`specialization "${TARGET_SPECIALIZATION_ID}" not found in src/data/specializations.ts`)
}

const institution = await prisma.institution.findUnique({ where: { name: USASK_INSTITUTION } })
if (!institution) {
  throw new Error(
    `Institution "${USASK_INSTITUTION}" not found — run "npm run db:seed:institutions" first.`,
  )
}

const user = await prisma.userInfo.upsert({
  where: { authUid: AUTH_UID },
  update: { firstName: 'Demo', lastName: 'Student', email: 'demo@baymax.studymax.internal' },
  create: {
    authUid: AUTH_UID,
    firstName: 'Demo',
    lastName: 'Student',
    email: 'demo@baymax.studymax.internal',
  },
})

await prisma.studentProfile.upsert({
  where: { userId: user.userId },
  update: {
    studentType: 'existing',
    institutionId: institution.institutionId,
    degree: 'Bachelor of Science',
    majorProgramId: TARGET_PROGRAM_ID,
    minorProgramId: null,
    concentrationIds: [],
    springSummer: SPRING_SUMMER,
    maxCoursesPerTerm: COURSES_PER_TERM,
    maxSummerCourses: SUMMER_PER_TERM,
    startingTermSeason: null,
    startingTermYear: null,
    goals: null,
  },
  create: {
    userId: user.userId,
    studentType: 'existing',
    institutionId: institution.institutionId,
    degree: 'Bachelor of Science',
    majorProgramId: TARGET_PROGRAM_ID,
    minorProgramId: null,
    concentrationIds: [],
    springSummer: SPRING_SUMMER,
    maxCoursesPerTerm: COURSES_PER_TERM,
    maxSummerCourses: SUMMER_PER_TERM,
  },
})

// Replace wholesale rather than diffing — same idea as api/session.ts's session save, and the
// transcript file is the only source of truth for this student's courses.
await prisma.$transaction([
  prisma.studentCourse.deleteMany({ where: { userId: user.userId } }),
  prisma.studentCourse.createMany({
    data: [
      ...completedCourses.map((courseCode) => ({ userId: user.userId, courseCode, status: 'completed' })),
      ...inProgressCourses.map((courseCode) => ({ userId: user.userId, courseCode, status: 'in_progress' })),
    ],
    skipDuplicates: true,
  }),
])

const { terms, inputs } = regenerate({
  completed: new Set(completedCourses),
  inProgress: new Set(inProgressCourses),
  targetProgramId: TARGET_PROGRAM_ID,
  targetSpecializationIds: [targetSpec.id],
  coursesPerTerm: COURSES_PER_TERM,
  springSummer: SPRING_SUMMER,
  summerPerTerm: SUMMER_PER_TERM,
  start: START,
})

if (terms.length === 0) {
  throw new Error(
    'regenerate produced an empty plan for the seeded transcript + software-development target — ' +
      'the demo drop-CMPT370 scenario depends on this NOT being empty. Check src/data/transcript.ts and ' +
      'src/data/specializations.ts for drift before seeding.',
  )
}

const plan = await prisma.generatedPlan.upsert({
  where: { userId: user.userId },
  update: {
    targetProgramId: TARGET_PROGRAM_ID,
    targetSpecializationIds: [TARGET_SPECIALIZATION_ID],
    coursesPerTerm: COURSES_PER_TERM,
    startSeason: START.season,
    startYear: START.year,
    terms,
    version: 1,
  },
  create: {
    userId: user.userId,
    targetProgramId: TARGET_PROGRAM_ID,
    targetSpecializationIds: [TARGET_SPECIALIZATION_ID],
    coursesPerTerm: COURSES_PER_TERM,
    startSeason: START.season,
    startYear: START.year,
    terms,
    version: 1,
  },
})

// The seed script is the one deliberate exception to "always write GeneratedPlan through
// commitPlanVersion()" (docs/BayMax/implementation/02-database-migration.md, "Single write path") —
// there's no scenario to attach v1 to, so it's inserted directly here, matching an
// "onboarding"-equivalent PlanVersion.
const lastTerm = terms[terms.length - 1]
const [projectedGradSeason, projectedGradYearStr] = lastTerm.label.split(' ')
await prisma.planVersion.upsert({
  where: { planId_versionNumber: { planId: plan.planId, versionNumber: 1 } },
  update: {},
  create: {
    planId: plan.planId,
    versionNumber: 1,
    parentVersion: null,
    targetProgramId: TARGET_PROGRAM_ID,
    minorProgramId: null,
    targetSpecializationIds: [TARGET_SPECIALIZATION_ID],
    coursesPerTerm: COURSES_PER_TERM,
    startSeason: START.season,
    startYear: START.year,
    terms,
    projectedGradSeason,
    projectedGradYear: Number(projectedGradYearStr),
    validation: { ok: true, issues: [] },
    plannerVersion: PLANNER_VERSION,
    inputsHash: createHash('sha256').update(JSON.stringify(inputs)).digest('hex'),
    createdBy: 'backfill',
  },
})

console.log(`seed-demo-student.ts: userId=${user.userId} plan v1, ${terms.length} term(s):`)
for (const term of terms) {
  console.log(`  ${term.label}: ${term.courses.map((c) => c.code).join(', ')}`)
}

await prisma.$disconnect()

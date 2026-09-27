// Seeds the one demo student Max's tools and every BayMax table point at this weekend
// (docs/BayMax/implementation/01-seed-demo-student.md). Idempotent: upserts by the fixed
// authUid "baymax-demo-student", so re-running it never duplicates rows — and it resets the plan to
// v1, dropping any versions and scenarios a test call committed since.
//
// The plan is built by planningAdapter.regenerate(), the same function Max's scenarios and the
// signed-in autosave use, so the seeded baseline and a scenario always diff like with like.
//
// Run: node --experimental-strip-types --experimental-loader ./scripts/_resolve-ts-loader.mjs --env-file=.env.local scripts/seed-demo-student.ts
import { PrismaClient } from '@prisma/client'
import { regenerate, validate, type AdapterInput } from '../src/lib/max/planningAdapter.ts'
import { DEFAULT_COURSES_PER_TERM, DEFAULT_SUMMER_COURSES } from '../src/lib/plan.ts'
import { completedCourses, inProgressCourses } from '../src/data/transcript.ts'

const AUTH_UID = 'baymax-demo-student'
const USASK_INSTITUTION = 'University of Saskatchewan'
const TARGET_PROGRAM_ID = 'computer-science'
const TARGET_SPECIALIZATION_ID = 'software-development'
// The student's preferences, stored on the profile so Max's scenarios read the same ones: the app's
// full load, no Spring/Summer.
const COURSES_PER_TERM = DEFAULT_COURSES_PER_TERM
const SPRING_SUMMER = false
const SUMMER_PER_TERM = DEFAULT_SUMMER_COURSES
// Hardcoded (not new Date()) so the seeded plan always matches the recorded demo numbers whatever
// day this is re-run: "now" is demo weekend (Fall 2026), so the plan starts Winter 2027.
const TODAY = new Date(2026, 8, 27)
const START = { season: 'Winter' as const, year: 2027 }
const PLANNER_VERSION = 'lib/plan.ts@buildStudentPlan-v3'

const prisma = new PrismaClient()

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

const profile = {
  studentType: 'existing',
  institutionId: institution.institutionId,
  degree: 'Bachelor of Science',
  majorProgramId: TARGET_PROGRAM_ID,
  minorProgramId: null,
  concentrationIds: [TARGET_SPECIALIZATION_ID],
  startingTermSeason: null,
  startingTermYear: null,
  goals: null,
  springSummer: SPRING_SUMMER,
  maxCoursesPerTerm: COURSES_PER_TERM,
  maxSummerCourses: SUMMER_PER_TERM,
}
await prisma.studentProfile.upsert({
  where: { userId: user.userId },
  update: profile,
  create: { userId: user.userId, ...profile },
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

const input: AdapterInput = {
  completed: new Set(completedCourses),
  inProgress: new Set(inProgressCourses),
  targetProgramId: TARGET_PROGRAM_ID,
  targetSpecializationIds: [TARGET_SPECIALIZATION_ID],
  minorProgramId: null,
  coursesPerTerm: COURSES_PER_TERM,
  springSummer: SPRING_SUMMER,
  summerPerTerm: SUMMER_PER_TERM,
  start: START,
  today: TODAY,
}
const { terms } = regenerate(input)
const validation = validate(terms, input)

if (terms.length === 0) {
  throw new Error(
    'regenerate() produced an empty plan for the seeded transcript — the demo drop-CMPT370 scenario ' +
      'depends on this NOT being empty. Check src/data/transcript.ts and the CS degree data for drift.',
  )
}
if (!validation.ok) {
  throw new Error(`The seeded plan breaks a hard constraint: ${validation.issues.filter((i) => i.severity === 'ERROR').map((i) => i.message).join(' ')}`)
}

const planFields = {
  targetProgramId: TARGET_PROGRAM_ID,
  targetSpecializationIds: [TARGET_SPECIALIZATION_ID],
  coursesPerTerm: COURSES_PER_TERM,
  startSeason: START.season,
  startYear: START.year,
  terms: terms as object,
  version: 1,
}
const plan = await prisma.generatedPlan.upsert({
  where: { userId: user.userId },
  update: planFields,
  create: { userId: user.userId, ...planFields },
})

// Back to v1: versions a test call committed would otherwise collide with the next commit's number,
// and their scenarios point at a baseline that no longer exists.
await prisma.planVersion.deleteMany({ where: { planId: plan.planId, versionNumber: { gt: 1 } } })
await prisma.scenario.deleteMany({ where: { userId: user.userId } })

// The seed script is the one deliberate exception to "always write GeneratedPlan through
// commitPlanVersion()" (docs/BayMax/implementation/02-database-migration.md, "Single write path") —
// there's no scenario to attach v1 to, so it's written directly here, matching an
// "onboarding"-equivalent PlanVersion.
const lastTerm = terms[terms.length - 1]
const cut = lastTerm.label.lastIndexOf(' ')
const versionFields = {
  parentVersion: null,
  targetProgramId: TARGET_PROGRAM_ID,
  minorProgramId: null,
  targetSpecializationIds: [TARGET_SPECIALIZATION_ID],
  coursesPerTerm: COURSES_PER_TERM,
  startSeason: START.season,
  startYear: START.year,
  terms: terms as object,
  projectedGradSeason: lastTerm.label.slice(0, cut),
  projectedGradYear: Number(lastTerm.label.slice(cut + 1)),
  validation: validation as object,
  plannerVersion: PLANNER_VERSION,
  inputsHash: 'backfill',
  createdBy: 'backfill',
}
await prisma.planVersion.upsert({
  where: { planId_versionNumber: { planId: plan.planId, versionNumber: 1 } },
  update: versionFields,
  create: { planId: plan.planId, versionNumber: 1, ...versionFields },
})

console.log(`seed-demo-student.ts: userId=${user.userId} plan v1, ${terms.length} term(s), graduation ${lastTerm.label}:`)
for (const term of terms) {
  console.log(`  ${term.label}: ${term.courses.map((c) => c.code).join(', ')}`)
}

await prisma.$disconnect()

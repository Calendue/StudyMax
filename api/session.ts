// A signed-in student's session in Supabase: GET loads it, PUT saves it. The app stays local-first
// (localStorage is still what it runs from); this is what lets a student sign in on another phone
// and pick up where they left off. Guests never reach here: no token, no row.
//
// PUT writes three tables (see docs/databaseSpec.md): UserInfo (upserted by Firebase uid, with the
// phone number when the student gave one), StudentCourse (replaced wholesale with the session's
// completed, in-progress and registered codes) and
// StudentProfile (present once onboarding has reached the results, removed on a reset).
import { Prisma } from '@prisma/client'
import { cleanCloudSession, internshipFrom, USASK_INSTITUTION, type CloudSession } from '../src/lib/cloudSession.js'
import { defaultStart, regenerate, validate, type AdapterInput } from '../src/lib/max/planningAdapter.js'
import { db, hasDatabase } from './_db.js'
import { verifiedUser, type VerifiedUser } from './_firebaseAuth.js'
import { allow } from './_rateLimit.js'
import { firstPlanVersionData, planVersionWrites, type PlanSnapshot } from './_planVersion.js'

interface VercelRequest {
  method?: string
  headers?: Record<string, string | string[] | undefined>
  body?: unknown
}

interface VercelResponse {
  status: (code: number) => VercelResponse
  setHeader: (name: string, value: string) => void
  json: (body: unknown) => void
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Cache-Control', 'no-store')
  if (req.method !== 'GET' && req.method !== 'PUT') {
    res.status(405).json({ error: 'GET or PUT only' })
    return
  }
  if (!hasDatabase()) {
    res.status(503).json({ error: 'database not configured' })
    return
  }
  const user = await verifiedUser(req)
  if (!user) {
    res.status(401).json({ error: 'sign in required' })
    return
  }
  // The app saves a second or two after each change; this only stops a runaway loop.
  if (!allow(`session:${user.uid}`, 60, 60_000)) {
    res.status(429).json({ error: 'too many requests' })
    return
  }

  try {
    if (req.method === 'GET') {
      res.status(200).json({ session: await load(user.uid) })
      return
    }
    const session = cleanCloudSession(req.body)
    if (!session) {
      res.status(400).json({ error: 'session required' })
      return
    }
    await save(user, session)
    res.status(200).json({ ok: true })
  } catch (err) {
    // Prisma's messages can carry connection details, so only the error code is logged.
    console.error('session route failed', (err as { code?: string } | null)?.code ?? 'unknown')
    res.status(500).json({ error: 'server error' })
  }
}

async function load(uid: string): Promise<CloudSession | null> {
  const row = await db().userInfo.findUnique({
    where: { authUid: uid },
    include: { profile: { include: { institution: true } }, courses: true },
  })
  if (!row) return null
  const { profile, courses } = row
  const codesWith = (status: string) => courses.filter((c) => c.status === status).map((c) => c.courseCode)
  return {
    universityId: !profile ? '' : profile.institution.name === USASK_INSTITUTION ? 'usask' : 'other',
    programId: profile?.majorProgramId ?? '',
    completed: codesWith('completed'),
    inProgress: codesWith('in_progress'),
    revealed: Boolean(profile),
    studentType: profile?.studentType === 'first-year' || profile?.studentType === 'existing' ? profile.studentType : null,
    degree: profile?.degree ?? '',
    minorId: profile?.minorProgramId ?? null,
    concentrationIds: profile?.concentrationIds ?? [],
    registered: codesWith('registered'),
    ...(row.phoneNumber ? { phone: row.phoneNumber } : {}),
    // No profile yet: the columns' own defaults.
    springSummer: profile?.springSummer ?? false,
    // A full load when nothing's stored (the column's own default is the old 2).
    coursesPerTerm: profile?.maxCoursesPerTerm ?? 5,
    summerPerTerm: profile?.maxSummerCourses ?? 2,
    internship: internshipFrom(profile?.internship),
  }
}

async function save(user: VerifiedUser, session: CloudSession) {
  const prisma = db()
  const [firstName, ...rest] = (user.name ?? '').trim().split(/\s+/)
  const names = {
    firstName: firstName || null,
    lastName: rest.join(' ') || null,
    email: user.email,
    // No number in the session means none typed on this phone yet, not "forget it".
    ...(session.phone ? { phoneNumber: session.phone } : {}),
  }
  const { userId } = await prisma.userInfo.upsert({
    where: { authUid: user.uid },
    update: names,
    create: { authUid: user.uid, ...names },
    select: { userId: true },
  })

  // A profile needs an Institution row, and only USask maps to one today; "other" schools keep
  // their courses in the database and their onboarding answers on the device.
  const institution =
    session.revealed && session.studentType && session.programId && session.universityId === 'usask'
      ? await prisma.institution.findUnique({ where: { name: USASK_INSTITUTION }, select: { institutionId: true } })
      : null
  const profile = institution && {
    studentType: session.studentType!,
    institutionId: institution.institutionId,
    degree: session.degree,
    majorProgramId: session.programId,
    minorProgramId: session.minorId,
    concentrationIds: session.concentrationIds,
    springSummer: session.springSummer,
    maxCoursesPerTerm: session.coursesPerTerm,
    maxSummerCourses: session.summerPerTerm,
    // An app build from before the question sends none: the stored answer stays.
    ...(session.internship !== undefined ? { internship: session.internship === null ? null : String(session.internship) } : {}),
    ...(session.internshipAY !== undefined ? { internshipAcademicYear: session.internshipAY } : {}),
  }

  const rows = [
    ...session.completed.map((courseCode) => ({ userId, courseCode, status: 'completed' })),
    ...session.inProgress.map((courseCode) => ({ userId, courseCode, status: 'in_progress' })),
    ...session.registered.map((courseCode) => ({ userId, courseCode, status: 'registered' })),
  ]

  // A real GeneratedPlan for this account, kept current on every save — the single write path
  // (api/_planVersion.ts) so Max (docs/BayMax) can read a signed-in student's actual plan instead
  // of only the seeded demo student's. Skipped when the program has no real specialization data
  // (an "awards only" subject) — regenerate() throws for those, same as the app's own hasProgramData
  // check elsewhere.
  let planSnapshot: PlanSnapshot | null = null
  if (profile) {
    try {
      const today = new Date()
      const completed = new Set(session.completed)
      const inProgress = new Set([...session.inProgress, ...session.registered])
      const start = defaultStart(completed, inProgress, today)
      const input: AdapterInput = {
        completed,
        inProgress,
        targetProgramId: session.programId,
        targetSpecializationIds: session.concentrationIds,
        minorProgramId: session.minorId,
        coursesPerTerm: session.coursesPerTerm,
        springSummer: session.springSummer,
        summerPerTerm: session.summerPerTerm,
        start,
        today,
        // The internship year the app resolved; an older app build sends none, so the stored one.
        away:
          session.internshipAY !== undefined
            ? session.internshipAY
            : ((await prisma.studentProfile.findUnique({ where: { userId }, select: { internshipAcademicYear: true } }))?.internshipAcademicYear ?? null),
      }
      const { terms } = regenerate(input)
      planSnapshot = {
        targetProgramId: session.programId,
        minorProgramId: session.minorId,
        targetSpecializationIds: session.concentrationIds,
        coursesPerTerm: session.coursesPerTerm,
        springSummer: session.springSummer,
        summerPerTerm: session.summerPerTerm,
        startSeason: start.season,
        startYear: start.year,
        terms,
        validation: validate(terms, input),
      }
    } catch {
      planSnapshot = null
    }
  }
  const existingPlan = planSnapshot
    ? await prisma.generatedPlan.findUnique({
        where: { userId },
        select: { planId: true, version: true, terms: true, targetSpecializationIds: true, coursesPerTerm: true, startSeason: true, startYear: true },
      })
    : null
  // An autosave that changes nothing about the plan writes no new version. Every save used to, which
  // bumped GeneratedPlan.version under a scenario open on a Max call and made its save come back STALE.
  const planUnchanged =
    planSnapshot !== null &&
    existingPlan !== null &&
    JSON.stringify(existingPlan.terms) === JSON.stringify(planSnapshot.terms) &&
    JSON.stringify(existingPlan.targetSpecializationIds) === JSON.stringify(planSnapshot.targetSpecializationIds) &&
    existingPlan.coursesPerTerm === planSnapshot.coursesPerTerm &&
    existingPlan.startSeason === planSnapshot.startSeason &&
    existingPlan.startYear === planSnapshot.startYear

  // One batch, so a reader never sees the courses half replaced. Batched (not interactive)
  // transactions are the kind that work through pgbouncer.
  const ops: Prisma.PrismaPromise<unknown>[] = [
    prisma.studentCourse.deleteMany({ where: { userId } }),
    prisma.studentCourse.createMany({ data: rows, skipDuplicates: true }),
    profile
      ? prisma.studentProfile.upsert({ where: { userId }, update: profile, create: { userId, ...profile } })
      : prisma.studentProfile.deleteMany({ where: { userId } }),
  ]
  if (planSnapshot && existingPlan && !planUnchanged) {
    ops.push(...planVersionWrites(existingPlan.planId, existingPlan.version + 1, planSnapshot, { createdBy: 'onboarding' }))
  }
  await prisma.$transaction(ops)

  // A brand-new plan needs its id before the PlanVersion can reference it, so (like
  // scripts/seed-demo-student.ts) it's two sequential writes here rather than one batched
  // transaction — the same accepted exception to the single-batch rule.
  if (planSnapshot && !existingPlan) {
    const plan = await prisma.generatedPlan.create({
      data: {
        userId,
        targetProgramId: planSnapshot.targetProgramId,
        targetSpecializationIds: planSnapshot.targetSpecializationIds,
        coursesPerTerm: planSnapshot.coursesPerTerm,
        startSeason: planSnapshot.startSeason,
        startYear: planSnapshot.startYear,
        terms: planSnapshot.terms as unknown as Prisma.InputJsonValue,
        version: 1,
      },
    })
    await prisma.planVersion.create({ data: firstPlanVersionData(plan.planId, planSnapshot, 'onboarding') })
  }
}

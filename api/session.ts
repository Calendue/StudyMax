// A signed-in student's session in Supabase: GET loads it, PUT saves it. The app stays local-first
// (localStorage is still what it runs from); this is what lets a student sign in on another phone
// and pick up where they left off. Guests never reach here: no token, no row.
//
// PUT writes three tables (see docs/databaseSpec.md): UserInfo (upserted by Firebase uid, with the
// phone number when the student gave one), StudentCourse (replaced wholesale with the session's
// completed, in-progress and registered codes) and
// StudentProfile (present once onboarding has reached the results, removed on a reset).
import { cleanCloudSession, USASK_INSTITUTION, type CloudSession } from '../src/lib/cloudSession.js'
import { db, hasDatabase } from './_db.js'
import { verifiedUser, type VerifiedUser } from './_firebaseAuth.js'
import { allow } from './_rateLimit.js'

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
  }

  const rows = [
    ...session.completed.map((courseCode) => ({ userId, courseCode, status: 'completed' })),
    ...session.inProgress.map((courseCode) => ({ userId, courseCode, status: 'in_progress' })),
    ...session.registered.map((courseCode) => ({ userId, courseCode, status: 'registered' })),
  ]
  // One batch, so a reader never sees the courses half replaced. Batched (not interactive)
  // transactions are the kind that work through pgbouncer.
  await prisma.$transaction([
    prisma.studentCourse.deleteMany({ where: { userId } }),
    prisma.studentCourse.createMany({ data: rows, skipDuplicates: true }),
    profile
      ? prisma.studentProfile.upsert({ where: { userId }, update: profile, create: { userId, ...profile } })
      : prisma.studentProfile.deleteMany({ where: { userId } }),
  ])
}

// "Ping Max" — places a real outbound Vapi call (docs/BayMax/spec/09-voice-integration.md's outbound
// call flow, docs/BayMax/implementation/06-vapi-voice-integration.md).
//
// Live on the Skill Tree: the app sends its exact plan inputs with the request (CallPlanInputs), so for
// this call Max plans from what's on the student's screen, and gets back a liveToken — the unguessable
// Supabase Broadcast topic its Plan tab listens on while Max reshapes the tree (api/max/_live.ts).
import { randomBytes } from 'node:crypto'
import { Prisma } from '@prisma/client'
import { VapiClient } from '@vapi-ai/server-sdk'
import { db, hasDatabase } from '../_db.js'
import { accountForPhone, resolveMaxUser } from '../_maxIdentity.js'
import { adapterInput, snapshotFromCall, withStoredSeasons } from './_scenarios.js'
import { parseCallPlanInputs } from '../../src/lib/max/callInputs.js'
import type { CallPlanInputs } from '../../src/lib/max/live.js'
import { planHash, programName, regenerate, termLine, underWayByTerm } from '../../src/lib/max/planningAdapter.js'
import { currentTermOf } from '../../src/lib/plan.js'

// spec 11: "institution-configured, with a national fallback" — no Institution-level wellness field
// exists yet (deferred, docs/BayMax/HANDOFF.md), so this is the fallback alone for every school. 988
// is Canada's (and the US's) real, live Suicide Crisis Helpline — call or text, 24/7.
const WELLNESS_FALLBACK = 'call or text 988, the Suicide Crisis Helpline, available 24/7'

interface VercelRequest {
  method?: string
  headers?: Record<string, string | string[] | undefined>
  body?: unknown
}

interface VercelResponse {
  status: (code: number) => VercelResponse
  json: (body: unknown) => void
}

const PHONE_RE = /^\+?[0-9()\-.\s]{7,20}$/
/** The longest a Max call runs (Vapi hangs up at this); also pushed by scripts/configure-max-assistant.ts. */
const MAX_CALL_SECONDS = 45 * 60
// A call row still "active" well past the longest call is one whose end event never came.
const STALE_CALL_MS = MAX_CALL_SECONDS * 1000 + 15 * 60 * 1000

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'POST only' })
    return
  }
  if (!hasDatabase()) {
    res.status(503).json({ error: 'database not configured' })
    return
  }

  const body = (req.body ?? {}) as { planInputs?: unknown; dryRun?: unknown; phoneE164?: unknown; consent?: unknown; name?: unknown }
  // A rehearsal without a phone (scripts/max-rehearse.ts): only where MAX_DRY_RUN=1 is set — never Production.
  const dryRun = body.dryRun === true && process.env.MAX_DRY_RUN === '1'

  const apiKey = process.env.VAPI_PRIVATE_KEY
  const assistantId = process.env.VAPI_ASSISTANT_ID
  const phoneNumberId = process.env.VAPI_PHONE_NUMBER_ID
  if (!dryRun && (!apiKey || !assistantId || !phoneNumberId)) {
    res.status(500).json({ error: 'Vapi not configured' })
    return
  }

  const resolved = await resolveMaxUser(req)
  if (resolved && 'noProfile' in resolved) {
    res.status(409).json({ error: 'NO_PROFILE' })
    return
  }
  if (!resolved) {
    res.status(500).json({ error: 'demo student not seeded — run npm run db:seed:demo-student' })
    return
  }
  const user = await db().userInfo.findUnique({ where: { userId: resolved.userId } })
  if (!user) {
    res.status(500).json({ error: 'demo student not seeded — run npm run db:seed:demo-student' })
    return
  }

  const settings = await db().maxSettings.findUnique({ where: { userId: user.userId } })
  // Who Max rings. A signed-in student: the number verified on their own account. A guest: the number
  // they confirmed in this session, sent with the call — never one stored on the shared demo student,
  // which would ring whichever guest saved a number last.
  let dial: string | null = null
  if (!dryRun) {
    if (resolved.isGuest) {
      const phone = typeof body.phoneE164 === 'string' ? body.phoneE164.trim() : ''
      if (!phone) {
        res.status(403).json({ error: 'PHONE_NOT_VERIFIED' })
        return
      }
      if (!PHONE_RE.test(phone)) {
        res.status(400).json({ error: 'invalid phone number' })
        return
      }
      if (body.consent !== true) {
        res.status(403).json({ error: 'CONSENT_REQUIRED' })
        return
      }
      dial = phone
    } else {
      if (!settings?.phoneVerifiedAt) {
        res.status(403).json({ error: 'PHONE_NOT_VERIFIED' })
        return
      }
      if (!settings.callConsentGranted) {
        res.status(403).json({ error: 'CONSENT_REQUIRED' })
        return
      }
      if (!settings.phoneE164 || !PHONE_RE.test(settings.phoneE164)) {
        res.status(400).json({ error: 'invalid stored phone number' })
        return
      }
      dial = settings.phoneE164
    }
  }
  // Phone ownership isn't verified by SMS while the OTP gate is off (PingMaxScreen OTP_GATE_ENABLED),
  // and a guest's number comes straight from the request. So Max only rings numbers the team has
  // listed in MAX_ALLOWED_NUMBERS (comma-separated, any formatting); with none listed it rings nobody.
  // An open endpoint must never let someone point Max at a stranger's phone (spec 11).
  if (!dryRun && dial && !allowedToDial(dial)) {
    res.status(403).json({ error: 'NUMBER_NOT_ALLOWED' })
    return
  }

  // A guest dialling a number that belongs to a student account: the call is that student's, about
  // their saved plan — not the demo student every guest shares, whose plan the last guest's call may
  // have saved over. The guest's screen isn't that account's, so its plan inputs are ignored.
  let account = user
  let accountSettings = settings
  let isGuest = resolved.isGuest
  if (isGuest && dial) {
    const ownerId = await accountForPhone(dial)
    const owner = ownerId ? await db().userInfo.findUnique({ where: { userId: ownerId } }) : null
    if (owner) {
      account = owner
      accountSettings = await db().maxSettings.findUnique({ where: { userId: owner.userId } })
      isGuest = false
    }
  }
  const byPhone = account !== user

  const [profile, plan, underWay] = await Promise.all([
    db().studentProfile.findUnique({ where: { userId: account.userId } }),
    db().generatedPlan.findUnique({ where: { userId: account.userId } }),
    // Transcript in-progress and onboarding's "registered this term" are both what they're taking now.
    db().studentCourse.findMany({ where: { userId: account.userId, status: { in: ['in_progress', 'registered'] } } }),
  ])
  if (!profile || !plan) {
    if (isGuest) {
      res.status(500).json({ error: 'demo student has no profile/plan — run npm run db:seed:demo-student' })
    } else {
      res.status(409).json({ error: 'NO_PROFILE' })
    }
    return
  }

  // The app's own plan, when it sent one that checks out: Max plans from what's on screen this call.
  let planInputs: CallPlanInputs | null = null
  let parity = false
  let graduation: string | null
  let currentCourses: string[]
  // Term by term when the app said which term each is in; else one list (a saved plan has no seasons).
  let currentLine: string | null = null
  let programId = profile.majorProgramId
  // The screen the student is looking at wins, even for a guest whose number belongs to an account (the
  // web without sign-in, the account on their phone): Max plans what they see, and the tree follows him.
  const parsed = body.planInputs === undefined ? null : parseCallPlanInputs(body.planInputs)
  if (parsed && 'inputs' in parsed) {
    planInputs = parsed.inputs
    // A signed-in student's record of when each course is beats what this device sent (it may not
    // know: a new phone, a session from before terms were saved). Max plans from it, and the app
    // shows Max's view of the plan when the two differ.
    if (!isGuest) planInputs = await withStoredSeasons(planInputs, account.userId)
    const terms = regenerate(adapterInput(snapshotFromCall(planInputs))).terms
    parity = planHash(terms) === planInputs.planHash
    graduation = terms[terms.length - 1]?.label ?? null
    currentCourses = planInputs.inProgress
    currentLine = termLine(underWayByTerm(adapterInput(snapshotFromCall(planInputs)))) || null
    programId = planInputs.programId
  } else {
    if (parsed && 'rejected' in parsed) console.error(`[Max] call planInputs rejected (${parsed.rejected}) — using the saved plan`)
    // plan.terms only ever holds courses not yet taken (buildStudentPlan assumes in-progress ones are
    // done "by start" — src/lib/plan.ts), so its last entry is the GRADUATION term, never "now".
    const terms = plan.terms as unknown as { label: string }[]
    graduation = terms[terms.length - 1]?.label ?? null
    currentCourses = [...new Set(underWay.map((c) => c.courseCode))]
  }

  const currentTerm = currentTermOf(new Date())
  // A guest's name is the one they gave this session, or none — never the shared demo student's
  // ("Demo", or whatever the last guest asked to be called). And every guest meets Max for the first
  // time: "has met Max" on the shared account belongs to whoever called last.
  const guestName = isGuest && typeof body.name === 'string' ? body.name.trim().slice(0, 60) : ''
  const firstName = isGuest ? guestName || null : (account.firstName ?? null)
  const isFirstCall = isGuest ? true : !accountSettings?.hasMetMax

  // A call row that never heard its end (a lost webhook) would hold max_call_one_active_uq forever
  // and lock this student out of Max. No call outlives MAX_CALL_SECONDS (45 min), so anything
  // still "active" after an hour is dead.
  await db().maxCall.updateMany({
    where: {
      userId: account.userId,
      status: { in: ['queued', 'ringing', 'in_progress'] },
      createdAt: { lt: new Date(Date.now() - STALE_CALL_MS) },
    },
    data: { status: 'failed', endedReason: 'stale: no end-of-call event' },
  })

  // 192 random bits: the only way to listen to this call's live channel, and only the caller gets it.
  const liveToken = randomBytes(24).toString('base64url')

  let call
  try {
    call = await db().maxCall.create({
      data: {
        userId: account.userId,
        status: 'queued',
        liveToken,
        ...(planInputs ? { planInputs: planInputs as unknown as Prisma.InputJsonValue } : {}),
      },
    })
  } catch {
    // max_call_one_active_uq: already queued/ringing/in_progress for this student. Every guest is the
    // same demo student, so for a guest it's someone else's call, not theirs.
    res.status(409).json({ error: isGuest ? 'MAX_BUSY' : 'ALREADY_ON_A_CALL' })
    return
  }
  console.log(`[Max] call ${call.callId} placed${dryRun ? ' (dry run)' : ''} — ${byPhone ? `guest → account ${account.userId} by phone, ` : ''}${planInputs ? `app inputs, parity=${parity}` : 'saved plan'}`)

  const variableValues = {
    name: firstName ?? "not given yet — ask what they'd like to be called if you need it",
    programLine: [profile.degree, programName(programId)].filter(Boolean).join(', '),
    currentTerm: `${currentTerm.season} ${currentTerm.year}`,
    currentCoursesLine: currentLine ?? (currentCourses.length > 0 ? currentCourses.join(', ') : 'none'),
    roadmapVersion: plan.version,
    projectedGraduation: graduation ?? 'unknown',
    isFirstCall,
    wellnessResourceLine: WELLNESS_FALLBACK,
  }
  const firstMessage = isFirstCall
    ? `Hi${firstName ? ` ${firstName}` : ''}, it's Max, the StudyMax owl. I've got your plan up — what's on your mind?`
    : `Hey${firstName ? ` ${firstName}` : ''}, Max the owl here. What's up?`

  if (dryRun) {
    // No phone: the rehearsal script plays Vapi's webhooks against this row, and scripts/max-chat.ts
    // gives the model exactly what Vapi would get.
    await db().maxCall.update({ where: { callId: call.callId }, data: { vapiCallId: `dry-${call.callId}`, status: 'ringing' } })
    res.status(200).json({ ok: true, callId: String(call.callId), liveToken, parity, dryRun: true, variableValues, firstMessage })
    return
  }

  const client = new VapiClient({ token: apiKey! })
  try {
    const vapiCall = await client.calls.create({
      assistantId: assistantId!,
      phoneNumberId: phoneNumberId!,
      customer: { number: dial! },
      assistantOverrides: {
        variableValues,
        firstMessage,
        metadata: { callRowId: String(call.callId) },
        // Per call, so a deploy changes it without re-running scripts/configure-max-assistant.ts.
        maxDurationSeconds: MAX_CALL_SECONDS,
      },
    })
    const vapiCallId = 'id' in vapiCall ? vapiCall.id : vapiCall.results[0]?.id
    if (!vapiCallId) throw new Error('Vapi did not return a call id')
    await db().maxCall.update({ where: { callId: call.callId }, data: { vapiCallId, status: 'ringing' } })
  } catch (e) {
    await db().maxCall.update({ where: { callId: call.callId }, data: { status: 'failed' } })
    console.error('vapi create-call failed', (e as { message?: string } | null)?.message ?? e)
    res.status(502).json({ error: 'call provider error' })
    return
  }

  res.status(200).json({ ok: true, callId: String(call.callId), liveToken, parity, dryRun: false })
}

/** Whether MAX_ALLOWED_NUMBERS lists this number, compared by digits so "+1 306…" matches "1306…". */
function allowedToDial(phone: string): boolean {
  const digits = (value: string) => value.replace(/\D/g, '')
  const allowed = (process.env.MAX_ALLOWED_NUMBERS ?? '').split(',').map(digits).filter(Boolean)
  return allowed.includes(digits(phone))
}

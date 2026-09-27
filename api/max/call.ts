// "Ping Max" — places a real outbound Vapi call to the one demo student (docs/BayMax/spec/
// 09-voice-integration.md's outbound call flow, docs/BayMax/implementation/06-vapi-voice-integration.md).
import { VapiClient } from '@vapi-ai/server-sdk'
import { db, hasDatabase } from '../_db.js'
import { resolveMaxUser } from '../_maxIdentity.js'

interface VercelRequest {
  method?: string
  headers?: Record<string, string | string[] | undefined>
}

interface VercelResponse {
  status: (code: number) => VercelResponse
  json: (body: unknown) => void
}

const PHONE_RE = /^\+?[0-9()\-.\s]{7,20}$/

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'POST only' })
    return
  }
  if (!hasDatabase()) {
    res.status(503).json({ error: 'database not configured' })
    return
  }

  const apiKey = process.env.VAPI_PRIVATE_KEY
  const assistantId = process.env.VAPI_ASSISTANT_ID
  const phoneNumberId = process.env.VAPI_PHONE_NUMBER_ID
  if (!apiKey || !assistantId || !phoneNumberId) {
    res.status(500).json({ error: 'Vapi not configured' })
    return
  }

  const resolved = await resolveMaxUser(req)
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

  const [profile, plan] = await Promise.all([
    db().studentProfile.findUnique({ where: { userId: user.userId } }),
    db().generatedPlan.findUnique({ where: { userId: user.userId } }),
  ])
  if (!profile || !plan) {
    res.status(500).json({ error: 'demo student has no profile/plan — run npm run db:seed:demo-student' })
    return
  }

  const terms = plan.terms as unknown as { label: string; courses: { code: string }[] }[]
  const lastTerm = terms[terms.length - 1]
  const firstName = user.firstName ?? 'there'
  const isFirstCall = !settings.hasMetMax

  let call
  try {
    call = await db().maxCall.create({ data: { userId: user.userId, status: 'queued' } })
  } catch {
    // max_call_one_active_uq: already queued/ringing/in_progress for this student.
    res.status(409).json({ error: 'ALREADY_ON_A_CALL' })
    return
  }

  const client = new VapiClient({ token: apiKey })
  try {
    const vapiCall = await client.calls.create({
      assistantId,
      phoneNumberId,
      customer: { number: settings.phoneE164 },
      assistantOverrides: {
        variableValues: {
          name: firstName,
          programLine: `${profile.degree}, ${profile.majorProgramId}`,
          currentTerm: lastTerm?.label ?? 'unknown',
          currentCoursesLine: lastTerm ? lastTerm.courses.map((c) => c.code).join(', ') : 'none',
          roadmapVersion: plan.version,
          projectedGraduation: lastTerm?.label ?? 'unknown',
          isFirstCall,
        },
        firstMessage: isFirstCall
          ? `Hi ${firstName}, this is Max from StudyMax — I help you plan your degree. I've got your roadmap in front of me. What's on your mind?`
          : `Hi ${firstName}, it's Max. What can I help with?`,
        metadata: { callRowId: String(call.callId) },
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

  res.status(200).json({ ok: true, callId: String(call.callId) })
}

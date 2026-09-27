// Phone verification + call consent. Operates on whichever real account is signed in (via the
// Authorization: Bearer <idToken> header, same as api/session.ts), falling back to the seeded demo
// student for a guest (docs/BayMax/implementation/06-vapi-voice-integration.md's "Identity
// simplification" — the fallback path that doc describes). The actual OTP check happens
// client-side (Firebase Phone Auth's linkWithPhoneNumber/signInWithPhoneNumber, see
// src/screens/PingMaxScreen.tsx) — this endpoint just persists the result against MaxSettings.
import { db, hasDatabase } from '../_db.js'
import { resolveMaxUser } from '../_maxIdentity.js'

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

const PHONE_RE = /^\+?[0-9()\-.\s]{7,20}$/
const CONSENT_VERSION = 'v1-2026-09-26'
const NAME_RE = /^.{1,60}$/

function shape(name: string | null, settings: { phoneVerifiedAt: Date | null; callConsentGranted: boolean; hasMetMax: boolean } | null) {
  return {
    name,
    phoneVerified: Boolean(settings?.phoneVerifiedAt),
    consentGranted: settings?.callConsentGranted === true,
    hasMetMax: settings?.hasMetMax === true,
  }
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Cache-Control', 'no-store')
  if (!hasDatabase()) {
    res.status(503).json({ error: 'database not configured' })
    return
  }
  const resolved = await resolveMaxUser(req)
  if (!resolved) {
    res.status(500).json({ error: 'demo student not seeded — run npm run db:seed:demo-student' })
    return
  }
  let user = await db().userInfo.findUnique({ where: { userId: resolved.userId } })
  if (!user) {
    res.status(500).json({ error: 'demo student not seeded — run npm run db:seed:demo-student' })
    return
  }

  if (req.method === 'GET') {
    const settings = await db().maxSettings.findUnique({ where: { userId: user.userId } })
    res.status(200).json(shape(user.firstName, settings))
    return
  }
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'GET or POST only' })
    return
  }

  const body = (req.body ?? {}) as { name?: string; phoneE164?: string; verified?: boolean; consentGranted?: boolean }

  if (body.name !== undefined) {
    const name = body.name.trim()
    if (!NAME_RE.test(name)) {
      res.status(400).json({ error: 'invalid name' })
      return
    }
    user = await db().userInfo.update({ where: { userId: user.userId }, data: { firstName: name } })
  }

  if (body.phoneE164 !== undefined) {
    const phone = body.phoneE164.trim()
    if (!PHONE_RE.test(phone)) {
      res.status(400).json({ error: 'invalid phone number' })
      return
    }
    const verifiedNow = body.verified === true
    try {
      await db().maxSettings.upsert({
        where: { userId: user.userId },
        update: { phoneE164: phone, ...(verifiedNow ? { phoneVerifiedAt: new Date() } : {}) },
        create: { userId: user.userId, phoneE164: phone, phoneVerifiedAt: verifiedNow ? new Date() : null },
      })
      if (verifiedNow) {
        await db().auditLog.create({ data: { userId: user.userId, actor: 'student_app', action: 'phone.verify' } })
      }
    } catch {
      // max_settings_verified_phone_uq: this number is already verified on a different account.
      res.status(409).json({ error: 'PHONE_ALREADY_VERIFIED_ELSEWHERE' })
      return
    }
  }

  if (body.consentGranted !== undefined) {
    const grant = body.consentGranted
    await db().maxSettings.upsert({
      where: { userId: user.userId },
      update: grant
        ? { callConsentGranted: true, callConsentVersion: CONSENT_VERSION, callConsentAt: new Date() }
        : { callConsentGranted: false },
      create: {
        userId: user.userId,
        ...(grant ? { callConsentGranted: true, callConsentVersion: CONSENT_VERSION, callConsentAt: new Date() } : { callConsentGranted: false }),
      },
    })
    await db().auditLog.create({
      data: { userId: user.userId, actor: 'student_app', action: grant ? 'consent.grant' : 'consent.revoke' },
    })
  }

  const settings = await db().maxSettings.findUnique({ where: { userId: user.userId } })
  res.status(200).json(shape(user.firstName, settings))
}

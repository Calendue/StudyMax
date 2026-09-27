// Who Max is talking to: the signed-in account behind the request's Firebase ID token, or the one
// seeded demo student as a fallback for guests (docs/BayMax/implementation/06-vapi-voice-integration.md's
// "Identity simplification" — the fallback is what that doc describes; resolving to a real signed-in
// account first is the follow-up that makes Max reflect a real tester's own data).
import { db } from './_db.js'
import { verifiedUser } from './_firebaseAuth.js'
import { DEMO_AUTH_UID, getDemoUser } from './max/_demoUser.js'

interface RequestLike {
  headers?: Record<string, string | string[] | undefined>
}

export interface MaxUser {
  userId: bigint
  isGuest: boolean
}

/**
 * A signed-in student with no saved account yet (onboarding not finished, or a school we don't map)
 * resolves to `{ noProfile: true }` — never to the demo student, which would read them someone
 * else's plan and let them overwrite the demo student's phone number. Only a guest gets the demo.
 */
export async function resolveMaxUser(req: RequestLike): Promise<MaxUser | { noProfile: true } | null> {
  const verified = await verifiedUser(req)
  if (verified) {
    const row = await db().userInfo.findUnique({ where: { authUid: verified.uid } })
    return row ? { userId: row.userId, isGuest: false } : { noProfile: true }
  }
  const demo = await getDemoUser()
  return demo ? { userId: demo.userId, isGuest: true } : null
}

/** A phone number as comparable digits: "+1 (306) 555-1234" and "3065551234" are the same number. */
function phoneKey(phone: string): string {
  const digits = phone.replace(/\D/g, '')
  return digits.length === 11 && digits.startsWith('1') ? digits.slice(1) : digits
}

/**
 * The student account that owns this phone number (onboarding's number or Max's settings), so a
 * guest's call to it is about that student's plan rather than the demo student every guest shares.
 * Several accounts on one number: the most recently updated with a profile wins.
 */
export async function accountForPhone(phone: string): Promise<bigint | null> {
  const key = phoneKey(phone)
  if (key.length < 7) return null
  // Stored numbers keep whatever formatting was typed, so compare digits here rather than in SQL.
  const candidates = await db().userInfo.findMany({
    where: {
      authUid: { not: DEMO_AUTH_UID },
      profile: { isNot: null },
      OR: [{ phoneNumber: { not: null } }, { maxSettings: { phoneE164: { not: null } } }],
    },
    select: { userId: true, phoneNumber: true, updatedAt: true, maxSettings: { select: { phoneE164: true } } },
    orderBy: { updatedAt: 'desc' },
  })
  const owner = candidates.find((u) =>
    [u.phoneNumber, u.maxSettings?.phoneE164].some((p) => p && phoneKey(p) === key),
  )
  return owner?.userId ?? null
}

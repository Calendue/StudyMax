// Who Max is talking to: the signed-in account behind the request's Firebase ID token, or the one
// seeded demo student as a fallback for guests (docs/BayMax/implementation/06-vapi-voice-integration.md's
// "Identity simplification" — the fallback is what that doc describes; resolving to a real signed-in
// account first is the follow-up that makes Max reflect a real tester's own data).
import { db } from './_db.js'
import { verifiedUser } from './_firebaseAuth.js'
import { getDemoUser } from './max/_demoUser.js'

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

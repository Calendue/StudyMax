// The one demo student every BayMax endpoint points at this weekend (docs/BayMax/implementation/
// 06-vapi-voice-integration.md, "Identity simplification for this weekend"). There is no real
// per-visitor identity resolution for Max yet — whoever opens the app is demoing against this one
// seeded user, looked up server-side by the seed script's fixed authUid, never passed from the client.
import { db } from '../_db.js'

export const DEMO_AUTH_UID = 'baymax-demo-student'

export function getDemoUser() {
  return db().userInfo.findUnique({ where: { authUid: DEMO_AUTH_UID } })
}

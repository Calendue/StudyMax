// Checks the Firebase ID token the app sends as "Authorization: Bearer <token>". The underscore
// keeps Vercel from serving this file as a route. A Firebase ID token is a JWT signed by Google's
// securetoken service, so verifying it needs only Google's public keys (cached by jose), not a
// service account.
import { createRemoteJWKSet, jwtVerify } from 'jose'

const PROJECT_ID = process.env.FIREBASE_PROJECT_ID || 'studymax-3a090'
const KEYS = createRemoteJWKSet(
  new URL('https://www.googleapis.com/service_accounts/v1/jwk/securetoken@system.gserviceaccount.com'),
)

export interface VerifiedUser {
  uid: string
  email: string | null
  name: string | null
}

interface RequestLike {
  headers?: Record<string, string | string[] | undefined>
}

/** The signed-in user behind the request, or null for a missing, expired or forged token. */
export async function verifiedUser(req: RequestLike): Promise<VerifiedUser | null> {
  const header = req.headers?.authorization
  const value = Array.isArray(header) ? header[0] : header
  const token = value?.startsWith('Bearer ') ? value.slice(7) : null
  if (!token) return null
  try {
    const { payload } = await jwtVerify(token, KEYS, {
      issuer: `https://securetoken.google.com/${PROJECT_ID}`,
      audience: PROJECT_ID,
      algorithms: ['RS256'],
    })
    if (typeof payload.sub !== 'string' || !payload.sub) return null
    return {
      uid: payload.sub,
      email: typeof payload.email === 'string' ? payload.email : null,
      name: typeof payload.name === 'string' ? payload.name : null,
    }
  } catch {
    return null
  }
}

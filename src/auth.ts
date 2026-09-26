import { FirebaseAuthentication, type User } from '@capacitor-firebase/authentication'
import { isNative } from './platform.ts'

// Sign-in is native only: Apple and Google through the device's own sheets, with the Firebase SDKs on
// the device holding the session. The web build has no Firebase web app, so it never shows sign-in
// and never calls into this plugin (whose web layer is only loaded on first call).
export const authAvailable = isNative

export type Provider = 'apple' | 'google'

export interface Account {
  uid: string
  name: string | null
  email: string | null
  photoUrl: string | null
}

function toAccount(user: User, nameHint?: string | null): Account {
  return {
    uid: user.uid,
    // Apple only hands over a name on the very first sign-in, so the credential's name is the fallback.
    name: user.displayName || nameHint || null,
    email: user.email,
    photoUrl: user.photoUrl,
  }
}

export async function currentAccount(): Promise<Account | null> {
  if (!authAvailable) return null
  try {
    const { user } = await FirebaseAuthentication.getCurrentUser()
    return user ? toAccount(user) : null
  } catch {
    return null
  }
}

export async function signIn(provider: Provider): Promise<Account> {
  const result =
    provider === 'apple' ? await FirebaseAuthentication.signInWithApple() : await FirebaseAuthentication.signInWithGoogle()
  if (!result.user) throw new Error('no user')
  const profile = result.additionalUserInfo?.profile as { name?: string; given_name?: string } | undefined
  return toAccount(result.user, profile?.name ?? profile?.given_name ?? null)
}

export async function signOut() {
  if (authAvailable) await FirebaseAuthentication.signOut()
}

/**
 * Closing the Apple or Google sheet is a choice, not an error. Each platform words it differently:
 * GIDSignIn's "canceled", ASAuthorization error 1001, Credential Manager's cancellation, and
 * Firebase's web-context / popup-closed codes for Apple's web flow on Android.
 */
export function isCancel(err: unknown): boolean {
  const e = err as { message?: string; code?: string } | null
  const text = `${e?.code ?? ''} ${e?.message ?? ''}`
  return /cancel|1001|popup-closed|web-context|user.?closed|dismiss/i.test(text)
}

export function firstName(account: Account | null): string | null {
  const name = account?.name?.trim()
  return name ? name.split(/\s+/)[0] : null
}

export function initial(account: Account): string {
  return (account.name?.trim() || account.email || '?').charAt(0).toUpperCase()
}

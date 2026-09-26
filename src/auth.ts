import type { Auth, User as WebUser } from 'firebase/auth'
import type { User as NativeUser } from '@capacitor-firebase/authentication'
import { isNative } from './platform.ts'

// ONE SIGN-IN MODULE, two engines behind it, both on Firebase project studymax-3a090:
// - iOS and Android: @capacitor-firebase/authentication, so Apple and Google use the device's own
//   sheets and the native Firebase SDKs hold the session.
// - The web: the Firebase JS SDK with a popup, configured from the four VITE_FIREBASE_* variables.
//   Without them the web has no sign-in at all and starts as a guest.
// Each engine is loaded on first use, so the native app never loads the JS SDK and a web build
// without config never loads either.

const webConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
}

/** Whether sign-in is offered at all: always in the native app, on the web only when configured. */
export const isAuthConfigured =
  isNative || Boolean(webConfig.apiKey && webConfig.authDomain && webConfig.projectId && webConfig.appId)

export type Provider = 'apple' | 'google'

export interface Account {
  uid: string
  name: string | null
  email: string | null
  photoUrl: string | null
}

function toAccount(user: NativeUser | WebUser, nameHint?: string | null): Account {
  return {
    uid: user.uid,
    // Apple only hands over a name on the very first sign-in, so the credential's name is the fallback.
    name: user.displayName || nameHint || null,
    email: user.email,
    photoUrl: 'photoUrl' in user ? user.photoUrl : user.photoURL,
  }
}

function nameFrom(profile: unknown): string | null {
  const p = profile as { name?: string; given_name?: string } | null | undefined
  return p?.name ?? p?.given_name ?? null
}

// Resolve to the module, never to the plugin itself: a Capacitor plugin answers every property,
// including \`then\`, so a promise resolving to it treats it as a thenable and never settles.
const native = () => import('@capacitor-firebase/authentication')

let webAuth: Promise<{ auth: Auth; sdk: typeof import('firebase/auth') }> | null = null
function web() {
  webAuth ??= Promise.all([import('firebase/app'), import('firebase/auth')]).then(([app, sdk]) => ({
    auth: sdk.getAuth(app.initializeApp(webConfig)),
    sdk,
  }))
  return webAuth
}

export async function currentAccount(): Promise<Account | null> {
  if (!isAuthConfigured) return null
  try {
    if (isNative) {
      const { user } = await (await native()).FirebaseAuthentication.getCurrentUser()
      return user ? toAccount(user) : null
    }
    const { auth } = await web()
    // The JS SDK restores a saved session asynchronously; currentUser is null until it has.
    await auth.authStateReady()
    return auth.currentUser ? toAccount(auth.currentUser) : null
  } catch {
    return null
  }
}

export async function signIn(provider: Provider): Promise<Account> {
  if (isNative) {
    const plugin = (await native()).FirebaseAuthentication
    const result = provider === 'apple' ? await plugin.signInWithApple() : await plugin.signInWithGoogle()
    if (!result.user) throw new Error('no user')
    return toAccount(result.user, nameFrom(result.additionalUserInfo?.profile))
  }
  if (!isAuthConfigured) throw new Error('auth/not-configured')
  const { auth, sdk } = await web()
  const result = await sdk.signInWithPopup(
    auth,
    provider === 'apple' ? new sdk.OAuthProvider('apple.com') : new sdk.GoogleAuthProvider(),
  )
  return toAccount(result.user, nameFrom(sdk.getAdditionalUserInfo(result)?.profile))
}

export async function signOut() {
  if (isNative) await (await native()).FirebaseAuthentication.signOut()
  else if (webAuth) await (await webAuth).auth.signOut()
}

/**
 * Closing the Apple or Google sheet is a choice, not an error. Each platform words it differently:
 * GIDSignIn's "canceled", ASAuthorization error 1001, Credential Manager's cancellation, and
 * Firebase's web-context / popup-closed codes for Apple's web flow on Android and the web popup.
 */
export function isCancel(err: unknown): boolean {
  const e = err as { message?: string; code?: string } | null
  const text = `${e?.code ?? ''} ${e?.message ?? ''}`
  return /cancel|1001|popup-closed|web-context|user.?closed|dismiss/i.test(text)
}

/** What to tell the student when sign-in fails, or null when they simply closed the sheet. */
export function signInErrorMessage(provider: Provider, err: unknown): string | null {
  if (isCancel(err)) return null
  const e = err as { message?: string; code?: string } | null
  const code = e?.code ?? e?.message ?? ''
  if (code.includes('auth/not-configured')) return "Sign-in isn't set up here yet. Continue without an account for now."
  if (code.includes('auth/operation-not-allowed')) return "This sign-in method isn't turned on yet. Try the other one, or continue without an account."
  if (code.includes('auth/unauthorized-domain')) return "This site isn't allowed to sign in yet. Continue without an account for now."
  if (code.includes('auth/popup-blocked')) return 'Your browser blocked the sign-in window. Allow pop-ups for this site and try again.'
  if (provider === 'google') {
    return "Google sign-in didn't work this time. Check your connection and try again, or continue without an account."
  }
  // Apple's catch-all, most often: no Apple Account is signed in on this device.
  if (/error 1000\b/.test(String(e?.message))) {
    return "Sign in with Apple isn't available right now. Check you're signed in to your Apple Account in Settings, or continue another way."
  }
  return "Sign in with Apple didn't work this time. Try again, or continue without an account."
}

export function firstName(account: Account | null): string | null {
  const name = account?.name?.trim()
  return name ? name.split(/\s+/)[0] : null
}

export function initial(account: Account): string {
  return (account.name?.trim() || account.email || '?').charAt(0).toUpperCase()
}

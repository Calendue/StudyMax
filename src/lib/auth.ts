import { initializeApp, type FirebaseApp } from 'firebase/app'
import {
  getAuth,
  GoogleAuthProvider,
  OAuthProvider,
  signInWithPopup,
  signOut,
  onAuthStateChanged,
  type Auth,
  type User,
} from 'firebase/auth'

export interface AuthUser {
  uid: string
  name: string | null
  email: string | null
  photoUrl: string | null
}

/** A sign-in failure whose message is safe and useful to show the student verbatim. */
export class AuthError extends Error {}

const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
}

// Google/Apple sign-in needs a Firebase project (see README for the four VITE_FIREBASE_* keys).
// Without them, sign-in throws a clear AuthError instead of crashing — same pattern as the missing
// OPENAI_API_KEY/BLAND_API_KEY handling elsewhere in the app.
export const isAuthConfigured = Boolean(
  firebaseConfig.apiKey && firebaseConfig.authDomain && firebaseConfig.projectId && firebaseConfig.appId,
)

let app: FirebaseApp | null = null
let auth: Auth | null = null

function getFirebaseAuth(): Auth {
  if (!isAuthConfigured) {
    throw new AuthError("Sign-in isn't set up in this environment yet — continue as a guest for now.")
  }
  if (!auth) {
    app = initializeApp(firebaseConfig)
    auth = getAuth(app)
  }
  return auth
}

function toAuthUser(user: User): AuthUser {
  return { uid: user.uid, name: user.displayName, email: user.email, photoUrl: user.photoURL }
}

function readableAuthError(err: unknown): string {
  if (err && typeof err === 'object' && 'code' in err) {
    const code = String((err as { code: unknown }).code)
    if (code === 'auth/popup-closed-by-user') return 'Sign-in was closed before finishing — try again.'
    if (code === 'auth/cancelled-popup-request') return 'Sign-in was interrupted — try again.'
    if (code === 'auth/operation-not-allowed') return "This sign-in method isn't turned on yet."
    if (code === 'auth/unauthorized-domain') return "This site isn't allow-listed for sign-in yet."
  }
  return 'Sign-in failed — try again, or continue as a guest.'
}

export async function signInWithGoogle(): Promise<AuthUser> {
  const authInstance = getFirebaseAuth()
  try {
    const result = await signInWithPopup(authInstance, new GoogleAuthProvider())
    return toAuthUser(result.user)
  } catch (err) {
    if (err instanceof AuthError) throw err
    throw new AuthError(readableAuthError(err))
  }
}

export async function signInWithApple(): Promise<AuthUser> {
  const authInstance = getFirebaseAuth()
  try {
    const result = await signInWithPopup(authInstance, new OAuthProvider('apple.com'))
    return toAuthUser(result.user)
  } catch (err) {
    if (err instanceof AuthError) throw err
    throw new AuthError(readableAuthError(err))
  }
}

export async function signOutUser(): Promise<void> {
  if (!auth) return
  await signOut(auth)
}

/**
 * Fires once immediately with the current user (or null), then again on every sign-in/out.
 * A no-op that reports "signed out" once when Firebase isn't configured, rather than throwing.
 */
export function onAuthChange(callback: (user: AuthUser | null) => void): () => void {
  if (!isAuthConfigured) {
    callback(null)
    return () => {}
  }
  const authInstance = getFirebaseAuth()
  return onAuthStateChanged(authInstance, (user) => callback(user ? toAuthUser(user) : null))
}

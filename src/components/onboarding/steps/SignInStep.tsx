import { useState } from 'react'
import { signInWithGoogle, signInWithApple, isAuthConfigured, AuthError, type AuthUser } from '../../../lib/auth.ts'

export function SignInStep({
  onSignedIn,
  onGuest,
}: {
  onSignedIn: (user: AuthUser) => void
  onGuest: () => void
}) {
  const [pending, setPending] = useState<'google' | 'apple' | null>(null)
  const [error, setError] = useState<string | null>(null)

  async function handle(provider: 'google' | 'apple') {
    setPending(provider)
    setError(null)
    try {
      const user = provider === 'google' ? await signInWithGoogle() : await signInWithApple()
      onSignedIn(user)
    } catch (err) {
      setError(err instanceof AuthError ? err.message : 'Sign-in failed — try again, or continue without an account.')
    } finally {
      setPending(null)
    }
  }

  return (
    <div className="onboarding__step">
      <h2 className="section__title">Welcome to StudyMax</h2>
      <p className="hint">Sign up or sign in to save your plan — or set it up without one, for now.</p>

      <div className="onboarding__choices onboarding__choices--stack">
        <button type="button" className="btn" disabled={pending !== null} onClick={() => handle('google')}>
          {pending === 'google' ? 'Signing in…' : 'Continue with Google'}
        </button>
        <button type="button" className="btn btn--quiet" disabled={pending !== null} onClick={() => handle('apple')}>
          {pending === 'apple' ? 'Signing in…' : 'Continue with Apple'}
        </button>
      </div>

      {error && <p className="upload-status upload-status--error">{error}</p>}
      {!isAuthConfigured && <p className="hint">Sign-in isn&rsquo;t configured in this environment yet.</p>}

      <button type="button" className="linkish" onClick={onGuest}>
        Continue without an account
      </button>
    </div>
  )
}

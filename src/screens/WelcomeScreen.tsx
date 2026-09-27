import { useModel } from '../model.ts'
import type { Provider } from '../auth.ts'
import { Wordmark } from '../ui/Brand.tsx'
import { Appear, Button } from '../ui/primitives.tsx'

function AppleLogo() {
  return (
    <svg width="18" height="22" viewBox="0 0 17 21" aria-hidden focusable="false">
      <path
        fill="currentColor"
        d="M14.06 11.17c-.02-2.2 1.8-3.26 1.88-3.31-1.03-1.5-2.62-1.7-3.19-1.72-1.36-.14-2.65.8-3.34.8-.69 0-1.75-.78-2.88-.76-1.48.02-2.85.86-3.61 2.19-1.54 2.67-.39 6.62 1.1 8.79.73 1.06 1.6 2.25 2.74 2.2 1.1-.04 1.51-.71 2.84-.71 1.33 0 1.7.71 2.86.69 1.18-.02 1.93-1.08 2.65-2.14.84-1.23 1.18-2.42 1.2-2.48-.03-.01-2.3-.88-2.32-3.5zM11.88 4.7c.6-.73 1.01-1.75.9-2.76-.87.04-1.92.58-2.54 1.31-.56.64-1.05 1.67-.92 2.66.97.08 1.96-.49 2.56-1.21z"
      />
    </svg>
  )
}

// The official multicolour G. Google's branding rules require it as-is, so it's the one place the
// app shows colours outside its palette.
function GoogleLogo() {
  return (
    <svg width="20" height="20" viewBox="0 0 48 48" aria-hidden focusable="false">
      <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z" />
      <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z" />
      <path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z" />
      <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z" />
    </svg>
  )
}

function Spinner() {
  return <span className="spinner" aria-hidden />
}

function ProviderButton({ provider, label }: { provider: Provider; label: string }) {
  const m = useModel()
  const busy = m.authBusy === provider
  return (
    <button
      type="button"
      className={`auth-btn auth-btn--${provider}`}
      disabled={m.authBusy !== null}
      aria-busy={busy}
      onClick={() => void m.signInWith(provider)}
    >
      <span className="auth-btn__logo">{busy ? <Spinner /> : provider === 'apple' ? <AppleLogo /> : <GoogleLogo />}</span>
      {label}
    </button>
  )
}

export function WelcomeScreen() {
  const m = useModel()
  return (
    <>
      <main className="welcome">
        <Appear index={0} className="welcome__brand">
          <Wordmark height={52} className="welcome__mark" />
        </Appear>
        <Appear index={1}>
          <h1 className="welcome__title">See what your school hides</h1>
        </Appear>
        <Appear index={2}>
          <p className="welcome__lead">
            The specializations, certificates and minors you&rsquo;re closest to, the one course to take next, a
            term-by-term plan, and a call before an award closes.
          </p>
        </Appear>
      </main>
      <footer className="actionbar actionbar--flat welcome__actions">
        {m.authError && (
          <p className="welcome__error" role="alert">
            {m.authError}
          </p>
        )}
        {/* Apple first: Apple's rule wherever Sign in with Apple sits beside another provider. */}
        <ProviderButton provider="apple" label="Continue with Apple" />
        <ProviderButton provider="google" label="Continue with Google" />
        <Button block variant="quiet" disabled={m.authBusy !== null} onClick={m.continueWithoutAccount}>
          Continue without an account
        </Button>
        <p className="welcome__note">Signing in keeps your courses and plan with your account on this device.</p>
        <button type="button" className="inline-link welcome__home" disabled={m.authBusy !== null} onClick={m.toLanding}>
          Back to the home page
        </button>
      </footer>
    </>
  )
}

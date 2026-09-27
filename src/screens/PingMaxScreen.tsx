// "Ping Max" — the voice planning agent's entry point (docs/BayMax/implementation/
// 06-vapi-voice-integration.md). A new screen rather than a repurposed CallScreen: that one is the
// Bland one-way call and stays untouched as the fallback.
//
// Phone verification, consent, and the call itself are all screen-local state — nothing here needs
// to live in the shared useStudyMax() model, since none of it is read by any other screen.
import { useEffect, useState } from 'react'
import { useModel } from '../model.ts'
import { authHeader, startPhoneVerification, type PhoneVerificationSession } from '../auth.ts'
import { api } from '../platform.ts'
import { ActionBar, ScreenBody, ScreenTitle, TopBar } from '../ui/chrome.tsx'
import { Icon } from '../ui/Icon.tsx'
import { Appear, Button, Group, Row } from '../ui/primitives.tsx'

const RECAPTCHA_CONTAINER_ID = 'ping-max-recaptcha'

// Temporarily down, 2026-09-27 — Firebase Phone Auth OTP is blocked on this project's Firebase
// config (Phone provider / Blaze plan, still being sorted), so this bypasses it: "Send code" just
// saves the number as verified and moves straight to consent. Flip back to true to restore the real
// OTP flow — docs/BayMax/spec/11-safety-privacy-compliance.md: "Phone ownership verified by SMS OTP
// before the first call. Prevents using Max to harass a third party." That's still the intended
// behavior; this flag is the one thing standing between here and it. See docs/BayMax/HANDOFF.md.
const OTP_GATE_ENABLED = false

/**
 * Firebase Phone Auth requires strict E.164 (+ country code + number, no spaces/punctuation) and
 * won't guess a country code itself. Most people just type their 10-digit number, so assume North
 * American (+1) for a bare 10-digit input rather than making them type the country code.
 */
function toE164(input: string): string {
  const stripped = input.replace(/[^\d+]/g, '')
  if (stripped.startsWith('+')) return stripped
  if (stripped.length === 10) return `+1${stripped}`
  if (stripped.length === 11 && stripped.startsWith('1')) return `+${stripped}`
  return `+${stripped}`
}

interface MaxSettingsState {
  /** No account: the shared demo student. The number and consent are this session's, never stored. */
  isGuest?: boolean
  phoneVerified: boolean
  /** The last four digits of the number Max will call. */
  phoneHint?: string | null
  consentGranted: boolean
  hasMetMax: boolean
}

// A guest's number and consent for this browser tab only — sent with each call, never saved to the
// demo student every guest shares (which made Ping Max ring the last guest's phone).
const GUEST_KEY = 'studymax.maxGuestCall'
interface GuestCall {
  phoneE164: string
  consent: boolean
}
function readGuestCall(): GuestCall | null {
  try {
    const g = JSON.parse(sessionStorage.getItem(GUEST_KEY) ?? 'null') as GuestCall | null
    return g && typeof g.phoneE164 === 'string' ? g : null
  } catch {
    return null
  }
}
function writeGuestCall(g: GuestCall | null) {
  try {
    if (g) sessionStorage.setItem(GUEST_KEY, JSON.stringify(g))
    else sessionStorage.removeItem(GUEST_KEY)
  } catch {
    // storage blocked: they'll just confirm the number again next time
  }
}
const lastFour = (phone: string) => phone.replace(/\D/g, '').slice(-4)

type Step = 'loading' | 'phone' | 'code' | 'consent' | 'ready' | 'calling' | 'placed' | 'error'

/** Throws with the server's error code (e.g. NO_PROFILE) rather than pretending there's nothing set up. */
async function fetchSettings(): Promise<MaxSettingsState> {
  const res = await fetch(api('/api/max/settings'), { headers: await authHeader() })
  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as { error?: string }
    throw new Error(body.error ?? `HTTP ${res.status}`)
  }
  return (await res.json()) as MaxSettingsState
}

/** A phone-free rehearsal of a live call (scripts/max-rehearse.ts plays Max's side). */
const REHEARSE = typeof window !== 'undefined' && new URLSearchParams(window.location.search).get('rehearse') === '1'

const NO_PROFILE_MESSAGE ='Finish setting up your plan first — then Max has a roadmap to talk through with you.'

export function PingMaxScreen() {
  const m = useModel()
  const [settings, setSettings] = useState<MaxSettingsState | null>(null)
  const [step, setStep] = useState<Step>('loading')
  // The number they gave in onboarding, as a starting point they can change.
  const [phoneInput, setPhoneInput] = useState(() => readGuestCall()?.phoneE164 ?? m.phone ?? '')
  const [codeInput, setCodeInput] = useState('')
  const [session, setSession] = useState<PhoneVerificationSession | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  /** Loads the Max setup and lands on the right step; `live()` false drops a result the screen no longer wants. */
  function loadSettings(live: () => boolean = () => true) {
    setError(null)
    setStep('loading')
    fetchSettings()
      .then((raw) => {
        if (!live()) return
        // A guest's number and consent come from this session, not the server.
        const guest = raw.isGuest ? readGuestCall() : null
        const data = raw.isGuest
          ? { ...raw, phoneVerified: Boolean(guest), phoneHint: guest ? lastFour(guest.phoneE164) : null, consentGranted: guest?.consent === true }
          : raw
        setSettings(data)
        setStep(!data.phoneVerified ? 'phone' : !data.consentGranted ? 'consent' : 'ready')
      })
      .catch((e: Error) => {
        if (!live()) return
        setError(e.message === 'NO_PROFILE' ? NO_PROFILE_MESSAGE : "Max isn't available right now — try again in a moment.")
        setStep('error')
      })
  }

  useEffect(() => {
    let cancelled = false
    loadSettings(() => !cancelled)
    return () => {
      cancelled = true
    }
  }, [])

  /** Persists a phone number as verified and advances past it — the one thing both the real OTP
   * confirmation and the OTP_GATE_ENABLED bypass ultimately do. */
  async function saveVerifiedPhone(phoneE164: string) {
    const res = await fetch(api('/api/max/settings'), {
      method: 'POST',
      headers: { 'content-type': 'application/json', ...(await authHeader()) },
      body: JSON.stringify({ phoneE164, verified: true }),
    })
    if (!res.ok) throw new Error('save failed')
    const data = (await res.json()) as MaxSettingsState
    if (data.isGuest) {
      // A new number asks for consent again: it's consent to call *this* number.
      writeGuestCall({ phoneE164, consent: false })
      data.consentGranted = false
    }
    setSettings(data)
    setStep(data.consentGranted ? 'ready' : 'consent')
  }

  async function sendCode() {
    setError(null)
    setBusy(true)
    try {
      if (!OTP_GATE_ENABLED) {
        await saveVerifiedPhone(toE164(phoneInput))
        return
      }
      const s = await startPhoneVerification(toE164(phoneInput), RECAPTCHA_CONTAINER_ID)
      setSession(s)
      setStep('code')
    } catch {
      setError(
        OTP_GATE_ENABLED
          ? "Couldn't send a code to that number — check it and try again."
          : "Couldn't save that number — check it and try again.",
      )
    } finally {
      setBusy(false)
    }
  }

  async function confirmCode() {
    if (!session) return
    setError(null)
    setBusy(true)
    try {
      await session.confirm(codeInput.trim())
      await saveVerifiedPhone(toE164(phoneInput))
    } catch {
      setError("That code didn't match — try again.")
    } finally {
      setBusy(false)
    }
  }

  async function grantConsent() {
    setBusy(true)
    try {
      const res = await fetch(api('/api/max/settings'), {
        method: 'POST',
        headers: { 'content-type': 'application/json', ...(await authHeader()) },
        body: JSON.stringify({ consentGranted: true }),
      })
      if (!res.ok) throw new Error('consent not saved')
      const data = (await res.json()) as MaxSettingsState
      if (data.isGuest) {
        const guest = readGuestCall()
        if (!guest) throw new Error('no number for this session')
        writeGuestCall({ ...guest, consent: true })
        Object.assign(data, { phoneVerified: true, phoneHint: lastFour(guest.phoneE164), consentGranted: true })
      }
      setSettings(data)
      setStep(data.consentGranted ? 'ready' : 'consent')
    } catch {
      setError("Couldn't save that — try again in a moment.")
      setStep('error')
    } finally {
      setBusy(false)
    }
  }

  async function pingMax() {
    setStep('calling')
    setError(null)
    try {
      const res = await fetch(api('/api/max/call'), {
        method: 'POST',
        headers: { 'content-type': 'application/json', ...(await authHeader()) },
        // The plan on screen, so Max plans from exactly this; ?rehearse=1 asks for a phone-free dry run
        // (only honoured where the server has MAX_DRY_RUN=1).
        body: JSON.stringify({
          planInputs: m.maxPlanInputs,
          dryRun: REHEARSE,
          // A guest's number for this call: the server never uses one stored on the shared demo account.
          ...(settings?.isGuest ? { phoneE164: readGuestCall()?.phoneE164, consent: readGuestCall()?.consent === true } : {}),
        }),
      })
      const data = (await res.json().catch(() => ({}))) as { error?: string; callId?: string; liveToken?: string }
      if (!res.ok) {
        setError(
          data.error === 'NO_PROFILE'
            ? NO_PROFILE_MESSAGE
            : data.error === 'ALREADY_ON_A_CALL'
            ? 'Max is already on a call with you.'
            : data.error === 'PHONE_NOT_VERIFIED'
              ? 'Your phone needs verifying first.'
              : data.error === 'CONSENT_REQUIRED'
                ? 'Consent is needed before Max can call.'
                : data.error === 'NUMBER_NOT_ALLOWED'
                  ? 'For now, Max only calls the StudyMax team’s phones while phone verification is being fixed.'
                  : "Max couldn't place the call.",
        )
        setStep('error')
        return
      }
      setStep('placed')
      if (m.features.live && data.callId && data.liveToken) {
        // Follow the call live, and take them to the tree Max is about to reshape.
        m.maxLive.start(data.callId, data.liveToken)
        try {
          localStorage.setItem('studymax.planView', 'tree')
        } catch {
          // storage blocked: the Plan tab opens on whichever view it remembers
        }
        setTimeout(() => m.navigate('plan'), 1200)
      }
    } catch {
      setError("Max couldn't place the call.")
      setStep('error')
    }
  }

  if (step === 'loading') {
    return (
      <>
        <TopBar onBack={() => m.go('results', -1)} backLabel="Results" />
        <ScreenBody>
          <ScreenTitle lead="Checking your Max setup…">Ping Max</ScreenTitle>
        </ScreenBody>
      </>
    )
  }

  if (step === 'calling' || step === 'placed') {
    return (
      <>
        <TopBar onBack={step === 'calling' ? undefined : () => m.go('results', -1)} backLabel="Results" />
        <ScreenBody className="call-state">
          <div className={`pulse${step === 'calling' ? ' pulse--live' : ''}`} aria-hidden>
            <span className="pulse__ring" />
            <span className="pulse__ring" />
            <span className="pulse__ring" />
            <span className="pulse__core">
              <Icon name={step === 'placed' ? 'check' : 'phone'} size={34} />
            </span>
          </div>
          <div className="call-state__text" aria-live="polite">
            <h1 className="wait__title">{step === 'calling' ? 'Calling Max…' : 'Max is calling you'}</h1>
            <p className="lead">
              {step === 'calling' ? 'Setting up the call.' : "Pick up when it rings — Max has your roadmap in front of him."}
            </p>
          </div>
        </ScreenBody>
        {step === 'placed' && (
          <ActionBar>
            <Button block variant="secondary" onClick={() => m.go('results', -1)}>
              Back to your results
            </Button>
          </ActionBar>
        )}
      </>
    )
  }

  return (
    <>
      <TopBar onBack={() => m.go('results', -1)} backLabel="Results" />
      <ScreenBody>
        <ScreenTitle lead="Max calls you, reads your real roadmap, and can save a change on a clear yes — all from one phone call.">
          Ping Max
        </ScreenTitle>

        {step === 'phone' && (
          <Appear className="form">
            <label className="field-label" htmlFor="max-phone">
              Your phone number
            </label>
            <div className="field">
              <input
                id="max-phone"
                type="tel"
                inputMode="tel"
                autoComplete="tel"
                enterKeyHint="go"
                value={phoneInput}
                onChange={(e) => setPhoneInput(e.target.value)}
                placeholder="+1 306 555 0123"
              />
            </div>
            {error && <p className="footnote">{error}</p>}
            <div id={RECAPTCHA_CONTAINER_ID} />
          </Appear>
        )}

        {step === 'code' && (
          <Appear className="form">
            <label className="field-label" htmlFor="max-code">
              Enter the code we texted you
            </label>
            <div className="field">
              <input
                id="max-code"
                inputMode="numeric"
                autoComplete="one-time-code"
                enterKeyHint="go"
                value={codeInput}
                onChange={(e) => setCodeInput(e.target.value)}
                placeholder="123456"
              />
            </div>
            {error && <p className="footnote">{error}</p>}
          </Appear>
        )}

        {step === 'consent' && (
          <Group>
            <Row
              leading={<Icon name="phone" />}
              title="Max can call this number"
              subtitle="Max reads your real roadmap and can save a plan change once you say yes out loud. You can revoke this anytime in your account settings."
            />
          </Group>
        )}

        {step === 'ready' && (
          <Group>
            <Row
              leading={<Icon name="phone" />}
              title="Ready when you are"
              subtitle={settings?.phoneHint ? `Max will call the number ending ${settings.phoneHint}.` : 'Max will call the number you verified.'}
            />
            {settings?.isGuest && (
              <Row
                title="Use a different number"
                onClick={() => {
                  setPhoneInput('')
                  setError(null)
                  setStep('phone')
                }}
              />
            )}
          </Group>
        )}

        {step === 'error' && error && <p className="footnote">{error}</p>}
      </ScreenBody>

      <ActionBar>
        {step === 'phone' && (
          <Button block icon="phone" disabled={busy || phoneInput.replace(/\D/g, '').length < 7} onClick={() => void sendCode()}>
            {OTP_GATE_ENABLED ? 'Send code' : 'Continue'}
          </Button>
        )}
        {step === 'code' && (
          <Button block disabled={busy || codeInput.trim().length < 4} onClick={() => void confirmCode()}>
            Verify
          </Button>
        )}
        {step === 'consent' && (
          <Button block disabled={busy} onClick={() => void grantConsent()}>
            Agree and continue
          </Button>
        )}
        {step === 'ready' && (
          <Button block icon="phone" onClick={() => void pingMax()}>
            Ping Max
          </Button>
        )}
        {step === 'error' && error === NO_PROFILE_MESSAGE && (
          <Button block variant="secondary" onClick={() => m.go('results', -1)}>
            Back to your results
          </Button>
        )}
        {step === 'error' && error !== NO_PROFILE_MESSAGE && (
          <Button
            block
            icon="phone"
            onClick={() =>
              settings ? setStep(!settings.phoneVerified ? 'phone' : !settings.consentGranted ? 'consent' : 'ready') : loadSettings()
            }
          >
            Try again
          </Button>
        )}
      </ActionBar>
    </>
  )
}

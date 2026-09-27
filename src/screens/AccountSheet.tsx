import { useEffect, useState } from 'react'
import { useModel } from '../model.ts'
import { authHeader, initial, isAuthConfigured } from '../auth.ts'
import { api } from '../platform.ts'
import { Button, Group, Row, RowIcon, SectionLabel } from '../ui/primitives.tsx'
import { Sheet } from '../ui/Sheet.tsx'
import { Avatar } from '../ui/chrome.tsx'
import { ThemeChoice } from '../ui/ThemeSwitch.tsx'

/**
 * Account and settings on a phone: who's signed in, the appearance, and the ways out of the results
 * (your courses, the pitch, starting over) that used to crowd the top bar. The tab bar's last button
 * and the avatar in any top bar open it.
 */
export function AccountSheet() {
  const m = useModel()
  const account = m.account

  // Max's own settings — this account's when signed in, the seeded demo student's for a guest
  // (docs/BayMax/implementation/06-vapi-voice-integration.md's "Identity simplification" describes
  // the guest fallback). Fetched only while the sheet's open, so a revoke here blocks the next
  // "Ping Max" tap immediately without threading Max's settings through the shared model.
  const [maxConsent, setMaxConsent] = useState<boolean | null>(null)
  const [maxName, setMaxName] = useState<string | null>(null)
  useEffect(() => {
    if (m.sheet !== 'account' || !m.features.max) return
    let cancelled = false
    authHeader()
      .then((headers) => fetch(api('/api/max/settings'), { headers }))
      .then((r) => (r.ok ? r.json() : null))
      .then((data: { name?: string | null; consentGranted?: boolean } | null) => {
        if (cancelled) return
        setMaxConsent(data?.consentGranted ?? null)
        setMaxName(data?.name ?? null)
      })
      .catch(() => !cancelled && setMaxConsent(null))
    return () => {
      cancelled = true
    }
  }, [m.sheet, m.features.max])

  async function revokeMaxConsent() {
    const res = await fetch(api('/api/max/settings'), {
      method: 'POST',
      headers: { 'content-type': 'application/json', ...(await authHeader()) },
      body: JSON.stringify({ consentGranted: false }),
    })
    if (res.ok) setMaxConsent(false)
  }

  return (
    <Sheet
      open={m.sheet === 'account'}
      onClose={() => m.setSheet(null)}
      title={account ? 'Your account' : 'Settings'}
      footer={
        account ? (
          <Button block variant="secondary" icon="signout" onClick={() => void m.signOutOfAccount()}>
            Sign out
          </Button>
        ) : undefined
      }
    >
      {account ? (
        <>
          <div className="account">
            <Avatar account={account} size={64} />
            <div className="account__text">
              <p className="account__name">{account.name ?? initial(account)}</p>
              {account.email && <p className="account__email">{account.email}</p>}
            </div>
          </div>
          <p className="footnote account__note">
            Your courses and plan are saved on this device under this account. Signing out keeps them here for next time.
          </p>
        </>
      ) : (
        isAuthConfigured && (
          <Group>
            <Row
              leading={<RowIcon name="person" />}
              title="Sign in"
              subtitle="Keep your courses and plan with your Apple or Google account"
              onClick={() => m.go('welcome')}
            />
          </Group>
        )
      )}

      <SectionLabel>Appearance</SectionLabel>
      <ThemeChoice />

      {m.revealed && m.hasProgramData && (
        <>
          <SectionLabel>Your program</SectionLabel>
          <Group>
            <Row
              leading={<RowIcon name="school" />}
              title="Major"
              subtitle={m.selectedProgram?.name ?? 'Not set'}
              onClick={() => m.setSheet('edit-major')}
            />
            <Row
              leading={<RowIcon name="layers" tone="quiet" />}
              title="Minor"
              subtitle={m.minorId ? (m.minorOptions.find((o) => o.id === m.minorId)?.name ?? m.minorId) : 'None'}
              onClick={() => m.setSheet('edit-minor')}
            />
            {m.concentrationOptions.length > 0 && (
              <Row
                leading={<RowIcon name="target" tone="quiet" />}
                title="Specializations"
                subtitle={m.concentrationIds.length === 0 ? 'None picked' : `${m.concentrationIds.length} picked`}
                onClick={() => m.setSheet('edit-concentrations')}
              />
            )}
            <Row
              leading={<RowIcon name="grid" tone="quiet" />}
              title="Graduation year"
              subtitle={m.gradYear ? String(m.gradYear) : 'Not set'}
              onClick={() => m.setSheet('edit-gradyear')}
            />
          </Group>
        </>
      )}

      {m.revealed && (
        <>
          <SectionLabel>StudyMax</SectionLabel>
          <Group>
            <Row
              leading={<RowIcon name="browse" />}
              title="Your courses"
              subtitle={`${m.takenCourses.length} completed${m.inProgressCourses.length ? `, ${m.inProgressCourses.length} in progress` : ''}`}
              onClick={() => m.navigate('courses')}
            />
            <Row
              leading={<RowIcon name="globe" tone="quiet" />}
              title="The pitch"
              subtitle="What StudyMax is, and who built it"
              onClick={() => {
                m.setSheet(null)
                m.setShowLanding(true)
              }}
            />
            <Row leading={<RowIcon name="restart" tone="quiet" />} title="Start over" subtitle="Clear your answers and courses" onClick={m.startOver} />
          </Group>
        </>
      )}

      {m.features.max && (
        <>
          <SectionLabel>Max</SectionLabel>
          <Group>
            <Row
              leading={<RowIcon name="person" tone="quiet" />}
              title="Name Max uses"
              subtitle={maxName ?? '—'}
              onClick={() => m.setSheet('edit-max-name')}
            />
            {maxConsent === true && (
              <Row
                leading={<RowIcon name="phone" tone="quiet" />}
                title="Max can call you"
                subtitle="Revoke to stop future calls"
                onClick={() => void revokeMaxConsent()}
              />
            )}
          </Group>
        </>
      )}
    </Sheet>
  )
}

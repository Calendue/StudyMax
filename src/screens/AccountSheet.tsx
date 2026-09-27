import { useModel } from '../model.ts'
import { initial, isAuthConfigured } from '../auth.ts'
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
  return (
    <Sheet
      open={m.sheet === 'account'}
      onClose={() => m.setSheet(null)}
      title="Settings"
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
    </Sheet>
  )
}

import { useModel } from '../model.ts'
import { initial } from '../auth.ts'
import { Button } from '../ui/primitives.tsx'
import { Sheet } from '../ui/Sheet.tsx'
import { Avatar } from '../ui/chrome.tsx'

export function AccountSheet() {
  const m = useModel()
  const account = m.account
  if (!account) return null
  return (
    <Sheet
      open={m.sheet === 'account'}
      onClose={() => m.setSheet(null)}
      title="Your account"
      footer={
        <Button block variant="secondary" onClick={() => void m.signOutOfAccount()}>
          Sign out
        </Button>
      }
    >
      <div className="account">
        <Avatar account={account} size={64} />
        <div className="account__text">
          <p className="account__name">{account.name ?? initial(account)}</p>
          {account.email && <p className="account__email">{account.email}</p>}
        </div>
      </div>
      <p className="footnote account__note">
        Your courses and plan are saved on this phone under this account. Signing out keeps them here for next time.
      </p>
    </Sheet>
  )
}

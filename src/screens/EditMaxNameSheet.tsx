// The name Max calls the student by. For a guest it's kept in their session and sent with the call
// (maxLive/guestCall.ts) — never written to the demo student every guest shares. For a signed-in
// account it's saved as their first name (UserInfo.firstName), which a later save no longer puts the
// Google/Apple name back over (api/session.ts). Either way the app greets them by it (m.displayName).
import { useEffect, useState } from 'react'
import { useModel } from '../model.ts'
import { authHeader } from '../auth.ts'
import { readGuestCall, updateGuestCall } from '../maxLive/guestCall.ts'
import { api } from '../platform.ts'
import { Button } from '../ui/primitives.tsx'
import { Sheet } from '../ui/Sheet.tsx'

export function EditMaxNameSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [name, setName] = useState('')
  const [busy, setBusy] = useState(false)
  const [guest, setGuest] = useState(false)
  const m = useModel()

  useEffect(() => {
    if (!open) return
    setName('')
    authHeader()
      .then((headers) => fetch(api('/api/max/settings'), { headers }))
      .then((r) => (r.ok ? r.json() : null))
      .then((data: { name?: string | null; isGuest?: boolean } | null) => {
        setGuest(data?.isGuest === true)
        setName(data?.isGuest ? (readGuestCall()?.name ?? '') : (data?.name ?? ''))
      })
      .catch(() => {})
  }, [open])

  async function save() {
    const trimmed = name.trim()
    if (!trimmed) return
    // A guest's name is theirs for this session, sent with the call — never the shared demo student's.
    if (guest) {
      updateGuestCall({ name: trimmed.slice(0, 60) })
      m.setPreferredName(trimmed.slice(0, 60))
      onClose()
      return
    }
    setBusy(true)
    try {
      const res = await fetch(api('/api/max/settings'), {
        method: 'POST',
        headers: { 'content-type': 'application/json', ...(await authHeader()) },
        body: JSON.stringify({ name: trimmed }),
      })
      if (res.ok) {
        m.setPreferredName(trimmed)
        onClose()
      }
    } finally {
      setBusy(false)
    }
  }

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title="Name Max uses"
      footer={
        <Button block disabled={busy || !name.trim()} onClick={() => void save()}>
          Save
        </Button>
      }
    >
      <div className="form">
        <label className="field-label" htmlFor="max-name">
          What Max calls you
        </label>
        <div className="field">
          <input
            id="max-name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && name.trim()) void save()
            }}
            placeholder="e.g. Sam"
            enterKeyHint="done"
            autoFocus
          />
        </div>
      </div>
    </Sheet>
  )
}

// The name Max calls the student by. For a guest this is the seeded demo student's own name
// (docs/BayMax/implementation/06-vapi-voice-integration.md's "Identity simplification"); for a
// signed-in account it's an override on top of whatever their Google/Apple name set — note a later
// onboarding save (api/session.ts) resets firstName back to that account name, so this override is
// closer to "for this call" than a permanent rename.
import { useEffect, useState } from 'react'
import { authHeader } from '../auth.ts'
import { api } from '../platform.ts'
import { Button } from '../ui/primitives.tsx'
import { Sheet } from '../ui/Sheet.tsx'

export function EditMaxNameSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [name, setName] = useState('')
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    if (!open) return
    setName('')
    authHeader()
      .then((headers) => fetch(api('/api/max/settings'), { headers }))
      .then((r) => (r.ok ? r.json() : null))
      .then((data: { name?: string | null } | null) => setName(data?.name ?? ''))
      .catch(() => {})
  }, [open])

  async function save() {
    const trimmed = name.trim()
    if (!trimmed) return
    setBusy(true)
    try {
      const res = await fetch(api('/api/max/settings'), {
        method: 'POST',
        headers: { 'content-type': 'application/json', ...(await authHeader()) },
        body: JSON.stringify({ name: trimmed }),
      })
      if (res.ok) onClose()
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

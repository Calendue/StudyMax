// Vapi's call-lifecycle events: status updates and the end-of-call report (docs/BayMax/spec/
// 09-voice-integration.md). Separate from api/max/tool.ts, which handles tool-calls specifically —
// Vapi assistants configure tool-calls with a per-tool server URL and lifecycle events with the
// assistant's own top-level server URL, so these arrive at a different route.
import type { Prisma } from '@prisma/client'
import { db, hasDatabase } from '../_db.js'

interface VercelRequest {
  method?: string
  headers?: Record<string, string | string[] | undefined>
  body?: unknown
}

interface VercelResponse {
  status: (code: number) => VercelResponse
  json: (body: unknown) => void
}

function getHeader(req: VercelRequest, name: string): string | null {
  const value = req.headers?.[name]
  return (Array.isArray(value) ? value[0] : value) ?? null
}

function verifiedByServerSecret(req: VercelRequest): boolean {
  const configured = process.env.VAPI_SERVER_SECRET
  if (!configured) return false
  return getHeader(req, 'x-vapi-secret') === configured
}

// Vapi's CallStatus values -> ours (spec 03's MaxCall.status enum).
const STATUS_MAP: Record<string, string> = {
  scheduled: 'queued',
  queued: 'queued',
  ringing: 'ringing',
  forwarding: 'ringing',
  'in-progress': 'in_progress',
  ended: 'ended',
  'not-found': 'failed',
  'deletion-failed': 'failed',
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'POST only' })
    return
  }
  if (!hasDatabase()) {
    res.status(503).json({ error: 'database not configured' })
    return
  }
  if (!verifiedByServerSecret(req)) {
    res.status(401).json({ error: 'unauthorized' })
    return
  }

  const message = (req.body as { message?: Record<string, unknown> } | null)?.message ?? {}
  const type = message.type as string | undefined
  const call = message.call as { id?: string; status?: string; endedReason?: string } | undefined
  const vapiCallId = call?.id
  if (!vapiCallId) {
    res.status(200).json({ ok: true }) // nothing to key this event off — ack and ignore
    return
  }

  const row = await db().maxCall.findUnique({ where: { vapiCallId } })
  if (!row) {
    res.status(200).json({ ok: true })
    return
  }

  if (type === 'status-update') {
    const vapiStatus = (message.status as string | undefined) ?? call?.status
    const mapped = vapiStatus ? STATUS_MAP[vapiStatus] : undefined
    if (mapped) {
      await db().maxCall.update({
        where: { callId: row.callId },
        data: { status: mapped, ...(mapped === 'in_progress' && !row.startedAt ? { startedAt: new Date() } : {}) },
      })
      console.log(`[Max] call ${row.callId} -> ${mapped}`)
    }
  } else if (type === 'end-of-call-report') {
    const endedReason = (message.endedReason as string | undefined) ?? call?.endedReason ?? null
    const isVoicemail = endedReason?.includes('voicemail') === true
    const endedAt = new Date()
    const durationSec = row.startedAt ? Math.round((endedAt.getTime() - row.startedAt.getTime()) / 1000) : null
    const transcript = message.transcript ?? message.artifact

    await db().maxCall.update({
      where: { callId: row.callId },
      data: {
        status: isVoicemail ? 'voicemail' : 'ended',
        endedReason,
        endedAt,
        durationSec,
        ...(transcript ? { transcript: transcript as Prisma.InputJsonValue } : {}),
      },
    })

    // Flip hasMetMax after a real (non-voicemail) completed call — drives S1's returning-caller line.
    // ConversationSummary generation is deferred (docs/BayMax/implementation/07): a single demo call
    // doesn't need cross-call memory yet.
    if (!isVoicemail) {
      await db()
        .maxSettings.update({ where: { userId: row.userId }, data: { hasMetMax: true } })
        .catch(() => {})
    }
    console.log(`[Max] call ${row.callId} ended (${endedReason ?? 'unknown'}) after ${durationSec ?? '?'}s`)
  }
  // hang / transcript-only events: logging only this weekend (spec 09) — acknowledged, not stored.

  res.status(200).json({ ok: true })
}

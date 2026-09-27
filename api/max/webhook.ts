// Vapi's call-lifecycle events: status updates and the end-of-call report (docs/BayMax/spec/
// 09-voice-integration.md). Separate from api/max/tool.ts, which handles tool-calls specifically —
// Vapi assistants configure tool-calls with a per-tool server URL and lifecycle events with the
// assistant's own top-level server URL, so these arrive at a different route.
import type { Prisma } from '@prisma/client'
import { db, hasDatabase } from '../_db.js'
import { publish } from './_live.js'
import { isSharedGuest } from './_demoUser.js'

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

const TERMINAL = new Set(['ended', 'failed', 'voicemail', 'no_answer'])

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
    // Webhooks can arrive out of order: a late "ringing" must never reopen a finished call, which
    // would hold max_call_one_active_uq and lock the student out of Max.
    if (mapped && !TERMINAL.has(row.status)) {
      await db().maxCall.update({
        where: { callId: row.callId },
        data: { status: mapped, ...(mapped === 'in_progress' && !row.startedAt ? { startedAt: new Date() } : {}) },
      })
      console.log(`[Max] call ${row.callId} -> ${mapped}`)
      await publish(row.liveToken, { type: 'call.status', status: mapped })
    }
  } else if (type === 'end-of-call-report') {
    const endedReason = (message.endedReason as string | undefined) ?? call?.endedReason ?? null
    const isVoicemail = endedReason?.includes('voicemail') === true
    // Never reached "in-progress": nobody picked up (did-not-answer, busy, a failed dial).
    // An end only a conversation can have also counts, in case the in-progress status-update was lost.
    const answered = Boolean(row.startedAt) || /customer-ended-call|assistant-ended-call|assistant-said-end-call-phrase|exceeded-max-duration/.test(endedReason ?? '')
    const endedAt = new Date()
    const durationSec = row.startedAt ? Math.round((endedAt.getTime() - row.startedAt.getTime()) / 1000) : null
    const transcript = message.transcript ?? message.artifact

    const finalStatus = isVoicemail ? 'voicemail' : answered ? 'ended' : 'no_answer'
    await db().maxCall.update({
      where: { callId: row.callId },
      data: {
        status: finalStatus,
        endedReason,
        endedAt,
        durationSec,
        ...(transcript ? { transcript: transcript as Prisma.InputJsonValue } : {}),
      },
    })

    // Flip hasMetMax after a call they actually picked up — drives the returning-caller greeting.
    // ConversationSummary generation is deferred (docs/BayMax/implementation/07): a single demo call
    // doesn't need cross-call memory yet.
    // Never on the demo student every guest shares: the next guest would be greeted as a returning caller.
    if (!isVoicemail && answered && !(await isSharedGuest(row.userId))) {
      await db()
        .maxSettings.update({ where: { userId: row.userId }, data: { hasMetMax: true } })
        .catch(() => {})
    }
    console.log(`[Max] call ${row.callId} ended (${endedReason ?? 'unknown'}) after ${durationSec ?? '?'}s`)
    await publish(row.liveToken, { type: 'call.status', status: finalStatus, endedReason })
  }
  // hang / transcript-only events: logging only this weekend (spec 09) — acknowledged, not stored.

  res.status(200).json({ ok: true })
}

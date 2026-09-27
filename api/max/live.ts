// The app's side of a live Max call (the one route this feature adds — Vercel Hobby's 12-function cap).
//
//   GET  /api/max/live?token=…   the whole live state (catch-up on subscribe/reconnect, and polling
//                                 when Realtime isn't there). Also the heartbeat behind uiVisible.
//   POST /api/max/live {action:'commit'|'discard', token, scenarioId, presentedHash}
//                                 the student's Keep / Not now on screen. An app commit may save a
//                                 specialization switch (voice never can, I2), and binds to the exact
//                                 proposal the app displayed (presentedHash).
//
// Holding the call's liveToken is the authorization: 192 random bits, returned only to whoever placed
// the call, and dead two hours after it ends.
import { db, hasDatabase } from '../_db.js'
import { publish } from './_live.js'
import { adapterInput, commitScenario, discardScenario, liveInputs, liveScenarioOf, snapshotFromCall } from './_scenarios.js'
import type { CallPlanInputs, LiveSnapshot } from '../../src/lib/max/live.js'
import { planHash, regenerate } from '../../src/lib/max/planningAdapter.js'

interface VercelRequest {
  method?: string
  url?: string
  query?: Record<string, string | string[] | undefined>
  body?: unknown
}

interface VercelResponse {
  status: (code: number) => VercelResponse
  setHeader: (name: string, value: string) => void
  json: (body: unknown) => void
}

const TOKEN_RE = /^[A-Za-z0-9_-]{20,64}$/
const EXPIRES_AFTER_END_MS = 2 * 60 * 60 * 1000
const TERMINAL = new Set(['ended', 'failed', 'voicemail', 'no_answer'])

function tokenFrom(req: VercelRequest): string | null {
  const q = req.query?.token
  const fromQuery = Array.isArray(q) ? q[0] : q
  const fromUrl = req.url ? new URL(req.url, 'http://x').searchParams.get('token') : null
  const fromBody = (req.body as { token?: unknown } | null)?.token
  const token = fromQuery ?? fromUrl ?? (typeof fromBody === 'string' ? fromBody : null)
  return token && TOKEN_RE.test(token) ? token : null
}

async function callFor(token: string) {
  const call = await db().maxCall.findUnique({ where: { liveToken: token } })
  if (!call) return null
  const endedAt = call.endedAt ?? (TERMINAL.has(call.status) ? call.updatedAt : null)
  if (endedAt && Date.now() - endedAt.getTime() > EXPIRES_AFTER_END_MS) return null
  return call
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Cache-Control', 'no-store')
  if (!hasDatabase()) {
    res.status(503).json({ error: 'database not configured' })
    return
  }
  const token = tokenFrom(req)
  const call = token ? await callFor(token) : null
  if (!token || !call) {
    res.status(404).json({ error: 'NO_LIVE_CALL' })
    return
  }

  if (req.method === 'GET') {
    // Reading the snapshot is the heartbeat: Max says "it's on your screen" only while this keeps coming.
    await db().maxCall.update({ where: { callId: call.callId }, data: { uiSeenAt: new Date() } })

    const inputs = call.planInputs as CallPlanInputs | null
    let baseline: LiveSnapshot['baseline'] = null
    let parity = false
    if (inputs) {
      const snap = snapshotFromCall(inputs)
      const terms = regenerate(adapterInput(snap)).terms
      baseline = { terms, inputs: liveInputs(snap) }
      parity = planHash(terms) === inputs.planHash
    }
    const latest = await db().scenario.findFirst({
      where: { callId: call.callId, status: { in: ['presented', 'committed', 'discarded'] } },
      orderBy: { updatedAt: 'desc' },
    })
    const snapshot: LiveSnapshot = {
      call: { callId: String(call.callId), status: call.status, endedReason: call.endedReason },
      parity,
      baseline,
      scenario: latest ? liveScenarioOf(latest) : null,
      seq: Date.now(),
    }
    res.status(200).json(snapshot)
    return
  }

  if (req.method !== 'POST') {
    res.status(405).json({ error: 'GET or POST only' })
    return
  }

  const body = (req.body ?? {}) as { action?: unknown; scenarioId?: unknown; presentedHash?: unknown }
  const idText = typeof body.scenarioId === 'string' || typeof body.scenarioId === 'number' ? String(body.scenarioId) : ''
  if (!/^\d+$/.test(idText)) {
    res.status(400).json({ error: 'BAD_SCENARIO' })
    return
  }
  const scenarioId = BigInt(idText)
  // Only this call's own proposals, never another student's by guessing an id.
  const scenario = await db().scenario.findUnique({ where: { scenarioId }, select: { callId: true } })
  if (!scenario || scenario.callId !== call.callId) {
    res.status(404).json({ error: 'UNKNOWN_SCENARIO' })
    return
  }

  if (body.action === 'commit') {
    if (typeof body.presentedHash !== 'string') {
      res.status(400).json({ error: 'BAD_HASH' })
      return
    }
    const result = await commitScenario(call.userId, scenarioId, body.presentedHash, { channel: 'app' })
    if ('code' in result) {
      res.status(409).json({ error: result.code })
      return
    }
    await publish(token, { type: 'scenario.committed', scenarioId: result.live.scenarioId, inputs: result.live.inputs, terms: result.live.terms })
    console.log(`[Max] call ${call.callId} app kept scenario ${scenarioId} -> v${result.versionId}`)
    res.status(200).json({ ok: true, versionId: result.versionId, inputs: result.live.inputs, terms: result.live.terms })
    return
  }

  if (body.action === 'discard') {
    const result = await discardScenario(call.userId, scenarioId)
    if ('code' in result) {
      res.status(409).json({ error: result.code })
      return
    }
    await publish(token, { type: 'scenario.discarded', scenarioId: String(scenarioId) })
    res.status(200).json({ ok: true })
    return
  }

  res.status(400).json({ error: 'BAD_ACTION' })
}

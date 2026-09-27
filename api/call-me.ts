import { buildCallScript, buildCallTask, type CallContext } from '../src/lib/callScript.js'
import { allow, clientIp } from './_rateLimit.js'

interface VercelRequest {
  method?: string
  headers?: Record<string, string | string[] | undefined>
  body?: { phoneNumber: string; context: CallContext }
}

interface VercelResponse {
  status: (code: number) => VercelResponse
  json: (body: unknown) => void
}

const PHONE_RE = /^\+?[0-9()\-.\s]{7,20}$/

// Everything in the context is read aloud and placed inside the voice agent's instructions, so only
// the shapes the app itself sends get through: plain names (letters, digits, light punctuation, no
// quotes or line breaks) and the app's own countdown wording. Anything else could rewrite the call.
const NAME_RE = /^[\p{L}\p{N} ()\-—.,&'’:/+]{1,120}$/u
const COUNTDOWN_RE = /^Closes (today|tomorrow|in \d{1,3} days)$/

function cleanContext(raw: unknown): CallContext | null {
  const c = raw as Partial<CallContext> | null | undefined
  if (!c || typeof c.specializationName !== 'string' || !NAME_RE.test(c.specializationName)) return null
  if (!Number.isInteger(c.coursesRemaining) || c.coursesRemaining! < 0 || c.coursesRemaining! > 60) return null
  if (c.awardName !== undefined && (typeof c.awardName !== 'string' || !NAME_RE.test(c.awardName))) return null
  if (c.awardDeadlineText !== undefined && (typeof c.awardDeadlineText !== 'string' || !COUNTDOWN_RE.test(c.awardDeadlineText))) {
    return null
  }
  return {
    specializationName: c.specializationName,
    coursesRemaining: c.coursesRemaining!,
    awardName: c.awardName,
    awardDeadlineText: c.awardDeadlineText,
  }
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'POST only' })
    return
  }

  const apiKey = process.env.BLAND_API_KEY
  if (!apiKey) {
    res.status(500).json({ error: 'BLAND_API_KEY not configured' })
    return
  }

  const body = req.body
  const phoneNumber = body?.phoneNumber?.trim()
  if (!phoneNumber || !PHONE_RE.test(phoneNumber)) {
    res.status(400).json({ error: 'valid phoneNumber required' })
    return
  }
  const context = cleanContext(body?.context)
  if (!context) {
    res.status(400).json({ error: 'context required' })
    return
  }

  // Each call costs money and rings a real phone: a few per number, a generous few more per address.
  const digits = phoneNumber.replace(/\D/g, '')
  if (!allow(`call:number:${digits}`, 3, 10 * 60_000) || !allow(`call:ip:${clientIp(req)}`, 20, 10 * 60_000)) {
    res.status(429).json({ error: 'too many calls, try again in a few minutes' })
    return
  }

  const script = buildCallScript(context)
  const task = buildCallTask(script)

  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), 15_000)
  let upstream: Response
  try {
    upstream = await fetch('https://api.bland.ai/v1/calls', {
      method: 'POST',
      signal: controller.signal,
      headers: {
        'content-type': 'application/json',
        authorization: apiKey,
      },
      body: JSON.stringify({
        phone_number: phoneNumber,
        task,
        // A soft, warm preset rather than Bland's default. Override with BLAND_VOICE to try another
        // ("June", "Paige", "Nat", "Derek", "Josh", "Florian") without a code change.
        voice: process.env.BLAND_VOICE || 'maya',
        // The script is fixed, so there is nothing for the model to be creative about.
        temperature: 0.3,
        background_track: 'none',
        // Without an owned number Bland dials from its shared pool, so the caller ID differs call to
        // call. Set BLAND_FROM_NUMBER (E.164) to a number owned by the Bland account to pin it.
        ...(process.env.BLAND_FROM_NUMBER ? { from: process.env.BLAND_FROM_NUMBER } : {}),
        wait_for_greeting: false,
        max_duration: 2,
        record: false,
      }),
    })
  } catch {
    res.status(502).json({ error: 'call provider unreachable' })
    return
  } finally {
    clearTimeout(timer)
  }

  if (!upstream.ok) {
    res.status(502).json({ error: 'call provider error' })
    return
  }

  const data = await upstream.json().catch(() => null)
  res.status(200).json({ success: true, callId: data?.call_id ?? null, script })
}

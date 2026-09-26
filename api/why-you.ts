import {
  buildWhyYouPrompt,
  parseWhyYouResponse,
  type WhyYouContext,
  type WhyYouResourceInput,
} from '../src/lib/scholarshipAi.js'
import { chat } from './_openai.js'
import { allow, clientIp } from './_rateLimit.js'

// The app sends awards three at a time (twenty awards overflow one reply's token budget). A cap on
// count and length keeps one request from being an open-ended prompt on our key.
const MAX_RESOURCES = 5
const MAX_TEXT = 400
const clip = (value: unknown, max = MAX_TEXT) => (typeof value === 'string' ? value.slice(0, max) : '')

interface VercelRequest {
  method?: string
  headers?: Record<string, string | string[] | undefined>
  body?: { context: WhyYouContext; resources: WhyYouResourceInput[] }
}

interface VercelResponse {
  status: (code: number) => VercelResponse
  json: (body: unknown) => void
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'POST only' })
    return
  }

  const apiKey = process.env.OPENAI_API_KEY
  if (!apiKey) {
    res.status(500).json({ error: 'OPENAI_API_KEY not configured' })
    return
  }

  // A results screen sends about seven of these at once, so the per-address budget is roomy.
  if (!allow(`why:${clientIp(req)}`, 200, 10 * 60_000)) {
    res.status(429).json({ error: 'too many requests' })
    return
  }

  const body = req.body
  if (!Array.isArray(body?.resources) || body.resources.length === 0 || body.resources.length > MAX_RESOURCES) {
    res.status(400).json({ error: 'resources required' })
    return
  }

  const resources: WhyYouResourceInput[] = body.resources.map((r) => ({
    id: clip(r?.id, 100),
    name: clip(r?.name, 200),
    whatItIs: clip(r?.whatItIs),
  }))
  const c = body.context ?? ({} as Partial<WhyYouContext>)
  const context: WhyYouContext = {
    school: clip(c.school, 200),
    program: clip(c.program, 200),
    closestSpecialization: clip(c.closestSpecialization, 200),
    coursesRemaining: Number.isInteger(c.coursesRemaining) ? Math.max(0, Math.min(60, c.coursesRemaining)) : 0,
    topOverlapCourse: c.topOverlapCourse ? clip(c.topOverlapCourse, 20) : undefined,
    otherCloseSpecializations: Array.isArray(c.otherCloseSpecializations)
      ? c.otherCloseSpecializations.slice(0, 3).map((o) => ({
          name: clip(o?.name, 200),
          remaining: Number.isInteger(o?.remaining) ? Math.max(0, Math.min(60, o.remaining)) : 0,
        }))
      : undefined,
  }

  let text: string
  try {
    // One-sentence copywriting per award.
    text = await chat(apiKey, buildWhyYouPrompt(context, resources), 2048, 25_000)
  } catch {
    res.status(502).json({ error: 'upstream error' })
    return
  }

  const whyYou = parseWhyYouResponse(
    text,
    resources.map((r) => r.id),
  )

  res.status(200).json({ whyYou })
}

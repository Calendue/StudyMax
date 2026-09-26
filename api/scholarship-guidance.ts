import { buildGuidancePrompt, parseGuidanceResponse } from '../src/lib/scholarshipAi.js'
import { chat } from './_openai.js'
import { allow, clientIp } from './_rateLimit.js'

interface VercelRequest {
  method?: string
  headers?: Record<string, string | string[] | undefined>
  body?: { school: string; program: string }
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

  if (!allow(`guidance:${clientIp(req)}`, 40, 10 * 60_000)) {
    res.status(429).json({ error: 'too many requests' })
    return
  }

  const body = req.body
  const school = typeof body?.school === 'string' ? body.school.trim().slice(0, 150) : ''
  if (!school) {
    res.status(400).json({ error: 'school required' })
    return
  }
  const program = typeof body?.program === 'string' ? body.program.trim().slice(0, 150) : ''

  let text: string
  try {
    // A short category list, not a task that needs reasoning.
    text = await chat(apiKey, buildGuidancePrompt(school, program || 'their program'), 1024, 25_000)
  } catch {
    res.status(502).json({ error: 'upstream error' })
    return
  }

  res.status(200).json(parseGuidanceResponse(text))
}

import { buildGuidancePrompt, parseGuidanceResponse } from '../src/lib/scholarshipAi.js'
import { openAIKey, respond } from './_openai.js'

interface VercelRequest {
  method?: string
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

  const apiKey = openAIKey()
  if (!apiKey) {
    res.status(500).json({ error: 'OPENAI_API_KEY not configured' })
    return
  }

  const body = req.body
  if (!body?.school?.trim()) {
    res.status(400).json({ error: 'school required' })
    return
  }

  let text: string
  try {
    text = await respond(apiKey, buildGuidancePrompt(body.school, body.program || 'their program'), 1024)
  } catch {
    res.status(502).json({ error: 'upstream error' })
    return
  }

  res.status(200).json(parseGuidanceResponse(text))
}

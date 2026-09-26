import {
  buildWhyYouPrompt,
  parseWhyYouResponse,
  type WhyYouContext,
  type WhyYouResourceInput,
} from '../src/lib/scholarshipAi.js'
import { openAIKey, respond } from './_openai.js'

interface VercelRequest {
  method?: string
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

  const apiKey = openAIKey()
  if (!apiKey) {
    res.status(500).json({ error: 'OPENAI_API_KEY not configured' })
    return
  }

  const body = req.body
  if (!body?.resources?.length) {
    res.status(400).json({ error: 'resources required' })
    return
  }

  let text: string
  try {
    text = await respond(apiKey, buildWhyYouPrompt(body.context, body.resources), 2048)
  } catch {
    res.status(502).json({ error: 'upstream error' })
    return
  }

  const whyYou = parseWhyYouResponse(
    text,
    body.resources.map((r) => r.id),
  )

  res.status(200).json({ whyYou })
}

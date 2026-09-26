import {
  buildWhyYouPrompt,
  parseWhyYouResponse,
  type WhyYouContext,
  type WhyYouResourceInput,
} from '../src/lib/scholarshipAi.js'

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

  const apiKey = process.env.OPENAI_API_KEY
  if (!apiKey) {
    res.status(500).json({ error: 'OPENAI_API_KEY not configured' })
    return
  }

  const body = req.body
  if (!body?.resources?.length) {
    res.status(400).json({ error: 'resources required' })
    return
  }

  const prompt = buildWhyYouPrompt(body.context, body.resources)

  const upstream = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: 'gpt-5-mini',
      // Uncapped, gpt-5-mini spends the whole token budget on hidden reasoning and returns empty
      // content — this is one-sentence copywriting, not a task that needs it.
      reasoning_effort: 'minimal',
      max_completion_tokens: 2048,
      messages: [{ role: 'user', content: prompt }],
    }),
  })

  if (!upstream.ok) {
    res.status(502).json({ error: 'upstream error' })
    return
  }

  const data = await upstream.json()
  const text = data?.choices?.[0]?.message?.content ?? ''
  const whyYou = parseWhyYouResponse(
    text,
    body.resources.map((r) => r.id),
  )

  res.status(200).json({ whyYou })
}

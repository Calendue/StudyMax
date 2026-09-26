import { buildGuidancePrompt, parseGuidanceResponse } from '../src/lib/scholarshipAi.js'

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

  const apiKey = process.env.OPENAI_API_KEY
  if (!apiKey) {
    res.status(500).json({ error: 'OPENAI_API_KEY not configured' })
    return
  }

  const body = req.body
  if (!body?.school?.trim()) {
    res.status(400).json({ error: 'school required' })
    return
  }

  const prompt = buildGuidancePrompt(body.school, body.program || 'their program')

  const upstream = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: 'gpt-5-mini',
      // Uncapped, gpt-5-mini spends the whole token budget on hidden reasoning and returns empty
      // content — this is a short category list, not a task that needs it.
      reasoning_effort: 'minimal',
      max_completion_tokens: 1024,
      messages: [{ role: 'user', content: prompt }],
    }),
  })

  if (!upstream.ok) {
    res.status(502).json({ error: 'upstream error' })
    return
  }

  const data = await upstream.json()
  const text = data?.choices?.[0]?.message?.content ?? ''
  const guidance = parseGuidanceResponse(text)

  res.status(200).json(guidance)
}

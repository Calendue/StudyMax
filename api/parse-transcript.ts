import { buildTranscriptParsePrompt, parseTranscriptResponse } from '../src/lib/transcriptParse.js'
import { catalogueCourses } from '../src/data/courses.js'

const CATALOGUE_CODES = catalogueCourses.map((c) => c.code)

interface VercelRequest {
  method?: string
  body?: { pdfBase64: string }
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
  if (!body?.pdfBase64) {
    res.status(400).json({ error: 'pdfBase64 required' })
    return
  }

  const prompt = buildTranscriptParsePrompt()

  const upstream = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: 'gpt-5-mini',
      // This is straightforward extraction, not a task that benefits from deep reasoning — and without
      // reasoning_effort capped, gpt-5-mini spends the whole max_completion_tokens budget on hidden
      // reasoning tokens and returns empty content (finish_reason "length", content "").
      reasoning_effort: 'minimal',
      max_completion_tokens: 4096,
      messages: [
        {
          role: 'user',
          content: [
            {
              type: 'file',
              file: { filename: 'transcript.pdf', file_data: `data:application/pdf;base64,${body.pdfBase64}` },
            },
            { type: 'text', text: prompt },
          ],
        },
      ],
    }),
  })

  if (!upstream.ok) {
    // Pass the real reason through. Swallowing it here meant every failure — an oversized PDF, a
    // scanned page image, an expired key — surfaced to the student as the same shrug.
    const detail = await upstream.text().catch(() => '')
    console.error(`openai ${upstream.status}: ${detail.slice(0, 500)}`)
    res.status(502).json({
      error: 'upstream error',
      status: upstream.status,
      detail: detail.slice(0, 300),
    })
    return
  }

  const data = await upstream.json()
  const text = data?.choices?.[0]?.message?.content ?? ''
  const { completed, inProgress } = parseTranscriptResponse(text, CATALOGUE_CODES)

  // A readable PDF with no recognisable courses is a different problem from an unreadable one, and
  // the student needs to be told which.
  res.status(200).json({ completed, inProgress, sawText: text.trim().length > 0 })
}

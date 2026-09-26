import { buildTranscriptParsePrompt, parseTranscriptResponse } from '../src/lib/transcriptParse.js'
import { catalogueCourses } from '../src/data/courses.js'
import { chat, OpenAIError } from './_openai.js'
import { allow, clientIp } from './_rateLimit.js'

const CATALOGUE_CODES = catalogueCourses.map((c) => c.code)

interface VercelRequest {
  method?: string
  headers?: Record<string, string | string[] | undefined>
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

  if (!allow(`transcript:${clientIp(req)}`, 30, 10 * 60_000)) {
    res.status(429).json({ error: 'too many requests' })
    return
  }

  const body = req.body
  if (typeof body?.pdfBase64 !== 'string' || !body.pdfBase64) {
    res.status(400).json({ error: 'pdfBase64 required' })
    return
  }

  const prompt = buildTranscriptParsePrompt()

  let text: string
  try {
    text = await chat(
      apiKey,
      [
        { type: 'file', file: { filename: 'transcript.pdf', file_data: `data:application/pdf;base64,${body.pdfBase64}` } },
        { type: 'text', text: prompt },
      ],
      4096,
      55_000,
    )
  } catch (error) {
    // Only the status goes back (the client words a 401/403 differently); OpenAI's own error text
    // can quote the key, so it never leaves the server.
    res.status(502).json({ error: 'upstream error', status: error instanceof OpenAIError ? error.status : 0 })
    return
  }
  const { completed, inProgress } = parseTranscriptResponse(text, CATALOGUE_CODES)

  // A readable PDF with no recognisable courses is a different problem from an unreadable one, and
  // the student needs to be told which.
  res.status(200).json({ completed, inProgress, sawText: text.trim().length > 0 })
}

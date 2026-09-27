import { buildTranscriptParsePrompt, parseTranscriptProgram, parseTranscriptResponse, parseTranscriptTerms } from '../src/lib/transcriptParse.js'
import { catalogueCourses } from '../src/data/courses.js'
import { openAIKey, respond, sendFailure } from './_openai.js'
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

  const apiKey = openAIKey()
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

  let text: string
  try {
    text = await respond(
      apiKey,
      [
        { type: 'file', file: { filename: 'transcript.pdf', file_data: `data:application/pdf;base64,${body.pdfBase64}` } },
        { type: 'text', text: buildTranscriptParsePrompt() },
      ],
      4096,
    )
  } catch (err) {
    // The app tells the student whether the problem is on our side (401/403) from the status alone.
    sendFailure(res, err)
    return
  }

  const { completed, inProgress } = parseTranscriptResponse(text, CATALOGUE_CODES)
  const { major, minor } = parseTranscriptProgram(text)
  const allTerms = parseTranscriptTerms(text)
  // Only for courses that made it into the in-progress list.
  const inProgressTerms = Object.fromEntries(inProgress.filter((c) => allTerms[c]).map((c) => [c, allTerms[c]]))

  // A readable PDF with no recognisable courses is a different problem from an unreadable one, and
  // the student needs to be told which.
  res.status(200).json({ completed, inProgress, inProgressTerms, major, minor, sawText: text.trim().length > 0 })
}

// The one place StudyMax talks to OpenAI. The underscore keeps Vercel from serving this file as a
// route. Every AI route goes through here so three rules hold everywhere:
// · The key only ever travels in the Authorization header. It is never logged or echoed.
// · OpenAI's error text never leaves the server. An auth failure quotes part of the key back and a
//   rate-limit error names the organization, so a route gets the status code and passes on nothing
//   else, and the log keeps only the status and OpenAI's error code.
// · A call never hangs: it is aborted after `timeoutMs`, and a timeout is an error with status 0.

const CHAT_URL = 'https://api.openai.com/v1/chat/completions'
export const OPENAI_MODEL = 'gpt-5-mini'

export type InputContent =
  | { type: 'text'; text: string }
  | { type: 'file'; file: { filename: string; file_data: string } }

/** A failed call, carrying only what's safe to act on: the HTTP status (0 when unreachable or timed out). */
export class OpenAIError extends Error {
  readonly status: number
  constructor(status: number) {
    super(`openai ${status}`)
    this.status = status
  }
}

/** The server's key, or null when this deployment doesn't have one. */
export function openAIKey(): string | null {
  return process.env.OPENAI_API_KEY || null
}

interface ErrorResponse {
  status: (code: number) => { json: (body: unknown) => void }
}

/** Answers a failed AI route: the upstream status for an OpenAI failure, nothing else ever. */
export function sendFailure(res: ErrorResponse, err: unknown): void {
  if (err instanceof OpenAIError) {
    res.status(502).json({ error: 'upstream error', status: err.status })
    return
  }
  console.error('ai route failed')
  res.status(500).json({ error: 'server error' })
}

/**
 * One request, one reply's text. Nothing is stored on OpenAI's side (store: false), since the
 * inputs include student transcripts.
 *
 * Chat Completions with reasoning_effort "minimal": uncapped, gpt-5-mini can spend the whole token
 * budget on hidden reasoning and return empty text. Measured on a synthetic transcript, a "why you"
 * batch and a guidance request, six runs each: minimal was correct every time and 2-5x faster than
 * low, and Chat Completions read the transcript right 6/6 where the Responses API filed an
 * in-progress course as completed once.
 */
export async function respond(
  apiKey: string,
  content: string | InputContent[],
  maxOutputTokens: number,
  timeoutMs = 55_000,
): Promise<string> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)
  let upstream: Response
  try {
    upstream = await fetch(CHAT_URL, {
      method: 'POST',
      signal: controller.signal,
      headers: { 'content-type': 'application/json', authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({
        model: OPENAI_MODEL,
        reasoning_effort: 'minimal',
        max_completion_tokens: maxOutputTokens,
        store: false,
        messages: [{ role: 'user', content }],
      }),
    })
  } catch {
    console.error(controller.signal.aborted ? 'openai timed out' : 'openai unreachable')
    throw new OpenAIError(0)
  } finally {
    clearTimeout(timer)
  }

  if (!upstream.ok) {
    // e.g. "invalid_api_key", "rate_limit_exceeded": a code, never the message.
    const code = await upstream
      .json()
      .then((d) => String(d?.error?.code ?? d?.error?.type ?? ''))
      .catch(() => '')
    console.error(`openai ${upstream.status} ${code.replace(/[^a-z0-9_]/gi, '').slice(0, 60)}`)
    throw new OpenAIError(upstream.status)
  }

  // A body that isn't JSON is treated as a failure; the parse error would quote the body.
  const data = await upstream.json().catch(() => null)
  if (data === null) {
    console.error('openai unreadable reply')
    throw new OpenAIError(502)
  }
  const text = data?.choices?.[0]?.message?.content
  if (typeof text !== 'string' || !text) {
    console.error(`openai empty reply ${String(data?.choices?.[0]?.finish_reason ?? '').replace(/[^a-z_]/g, '')}`)
    return ''
  }
  return text
}

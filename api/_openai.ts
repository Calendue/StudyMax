// The one place StudyMax talks to OpenAI. The underscore keeps Vercel from serving this file as a
// route. Every AI route goes through here so three rules hold everywhere:
// · The key only ever travels in the Authorization header. It is never logged or echoed.
// · OpenAI's error text never leaves the server. An auth failure quotes part of the key back, so a
//   route gets the status code and nothing else.
// · A call never hangs: it is aborted after `timeoutMs`, and an unreachable OpenAI is an error with
//   status 0, not an exception that escapes the route.

const CHAT_URL = 'https://api.openai.com/v1/chat/completions'
export const OPENAI_MODEL = 'gpt-5-mini'

export type ChatContent =
  | string
  | Array<{ type: 'text'; text: string } | { type: 'file'; file: { filename: string; file_data: string } }>

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

/**
 * One user message, one reply's text. Reasoning is capped at minimal: these are extraction and short
 * writing tasks, and uncapped gpt-5-mini spends the whole token budget on hidden reasoning and
 * returns empty content (finish_reason "length", content "").
 */
export async function chat(apiKey: string, content: ChatContent, maxCompletionTokens: number, timeoutMs: number): Promise<string> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)
  try {
    let upstream: Response
    try {
      upstream = await fetch(CHAT_URL, {
        method: 'POST',
        signal: controller.signal,
        headers: { 'content-type': 'application/json', authorization: `Bearer ${apiKey}` },
        body: JSON.stringify({
          model: OPENAI_MODEL,
          reasoning_effort: 'minimal',
          max_completion_tokens: maxCompletionTokens,
          messages: [{ role: 'user', content }],
        }),
      })
    } catch {
      console.error(controller.signal.aborted ? 'openai timed out' : 'openai unreachable')
      throw new OpenAIError(0)
    }

    if (!upstream.ok) {
      // Log the status and OpenAI's error code (e.g. "invalid_api_key", "rate_limit_exceeded"),
      // never its message.
      const code = await upstream
        .json()
        .then((d) => String(d?.error?.code ?? d?.error?.type ?? ''))
        .catch(() => '')
      console.error(`openai ${upstream.status} ${code.replace(/[^a-z0-9_]/gi, '').slice(0, 60)}`)
      throw new OpenAIError(upstream.status)
    }

    const data = await upstream.json().catch(() => null)
    const text = data?.choices?.[0]?.message?.content
    return typeof text === 'string' ? text : ''
  } catch (error) {
    if (error instanceof OpenAIError) throw error
    throw new OpenAIError(0)
  } finally {
    clearTimeout(timer)
  }
}

// The one place StudyMax talks to OpenAI. The underscore keeps Vercel from serving this file as a
// route. Every AI route goes through here so two rules hold everywhere:
// · The key only ever travels in the Authorization header. It is never logged or echoed.
// · OpenAI's error text never leaves the server. An auth failure quotes part of the key back, so a
//   route gets the status code and a safe error code, and passes on nothing else.

const RESPONSES_URL = 'https://api.openai.com/v1/responses'
export const OPENAI_MODEL = 'gpt-5-mini'

export type InputContent =
  | { type: 'input_text'; text: string }
  | { type: 'input_file'; filename: string; file_data: string }

/** A failed call, carrying only what's safe to act on: the HTTP status (0 when unreachable). */
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
 * One request, one reply's text. Reasoning stays low: these are extraction and short writing
 * tasks, and the student is waiting. Nothing is stored on OpenAI's side (store: false), since the
 * inputs include student transcripts.
 */
export async function respond(apiKey: string, content: string | InputContent[], maxOutputTokens: number): Promise<string> {
  let upstream: Response
  try {
    upstream = await fetch(RESPONSES_URL, {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({
        model: OPENAI_MODEL,
        reasoning: { effort: 'low' },
        max_output_tokens: maxOutputTokens,
        store: false,
        input: [{ role: 'user', content }],
      }),
    })
  } catch {
    console.error('openai unreachable')
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

  return outputText(await upstream.json())
}

/** The reply's text: every output_text part of every message item, in order. */
function outputText(data: unknown): string {
  const output = (data as { output?: unknown[] })?.output
  if (!Array.isArray(output)) return ''
  let text = ''
  for (const item of output as { type?: string; content?: { type?: string; text?: string }[] }[]) {
    if (item?.type !== 'message' || !Array.isArray(item.content)) continue
    for (const part of item.content) if (part?.type === 'output_text' && typeof part.text === 'string') text += part.text
  }
  return text
}

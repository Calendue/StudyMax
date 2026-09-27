// Which key-backed features this deployment can run. The app asks once at startup and leaves out
// whatever the server can't do, so a missing key means a missing feature, not an error mid-flow.
// Adding a key in Vercel turns its features back on everywhere, installed apps included, with no
// rebuild. Only booleans leave the server, never the keys.

interface VercelResponse {
  status: (code: number) => VercelResponse
  setHeader: (name: string, value: string) => void
  json: (body: unknown) => void
}

export default function handler(_req: unknown, res: VercelResponse) {
  res.setHeader('Cache-Control', 'no-store')
  res.status(200).json({
    // transcript reading, "why you" notes, guidance for schools we haven't mapped
    ai: Boolean(process.env.OPENAI_API_KEY),
    // the phone call about the award closing soonest
    call: Boolean(process.env.BLAND_API_KEY),
    // Ping Max — the voice planning agent's outbound call
    max: Boolean(process.env.VAPI_PRIVATE_KEY && process.env.VAPI_ASSISTANT_ID && process.env.VAPI_PHONE_NUMBER_ID),
    // Max live on the Skill Tree during the call. MAX_LIVE=off is the demo kill switch. Without the
    // Supabase keys the app still follows the call by polling, so live only needs Max itself.
    live: Boolean(process.env.VAPI_PRIVATE_KEY && process.env.VAPI_ASSISTANT_ID) && process.env.MAX_LIVE !== 'off',
  })
}

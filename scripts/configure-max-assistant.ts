// Pushes Max's system prompt, tool schemas, and webhook auth to the Vapi assistant
// (docs/BayMax/implementation/assistant-config-reference.md — keep the two in sync if you edit one).
// Safe to re-run: it's a full overwrite of the fields below, not a diff/merge.
//
// Deviation from the reference doc / spec 09: this SDK version's Assistant/Server types have no
// dedicated "server URL secret" field (spec 09 assumed one from an earlier Vapi API version — its
// own caveat: "verify against current Vapi docs... treat names as intent, not contract"). The real
// equivalent is a custom header, which api/max/tool.ts and api/max/webhook.ts already check for
// (`x-vapi-secret`), so this sets that header via `server.headers` instead.
//
// Run: node --experimental-strip-types --env-file=.env.local scripts/configure-max-assistant.ts
import { VapiClient } from '@vapi-ai/server-sdk'
import { maxTools, SYSTEM_PROMPT } from './_max-assistant.ts'

const apiKey = process.env.VAPI_PRIVATE_KEY
const assistantId = process.env.VAPI_ASSISTANT_ID
const serverSecret = process.env.VAPI_SERVER_SECRET
if (!apiKey || !assistantId || !serverSecret) {
  throw new Error('VAPI_PRIVATE_KEY, VAPI_ASSISTANT_ID, and VAPI_SERVER_SECRET must all be set in .env.local')
}

const API_BASE = 'https://study-max-theta.vercel.app'
const TOOL_URL = `${API_BASE}/api/max/tool`
const WEBHOOK_URL = `${API_BASE}/api/max/webhook`
const AUTH_HEADERS = { 'x-vapi-secret': serverSecret }

const tools = maxTools(TOOL_URL, AUTH_HEADERS)

const client = new VapiClient({ token: apiKey })
const updated = await client.assistants.update({
  id: assistantId,
  firstMessage: 'Hi, this is Max, the StudyMax owl.', // overridden per call by api/max/call.ts
  // The greeting can be talked over, like every other turn.
  firstMessageInterruptionsEnabled: true,
  // Snappy turn-taking. Max stops as soon as the student starts talking (0.2 s of voice, no word
  // count to wait for) and resumes after 0.8 s if it was only a cough. He answers 0.3 s after they
  // finish, and 0.8 s (not Vapi's 1.5 s) when the transcript has no end punctuation, which is what
  // made short answers like "yeah" feel like dead air.
  stopSpeakingPlan: { numWords: 0, voiceSeconds: 0.2, backoffSeconds: 0.8 },
  startSpeakingPlan: {
    waitSeconds: 0.3,
    transcriptionEndpointingPlan: { onPunctuationSeconds: 0.1, onNoPunctuationSeconds: 0.8, onNumberSeconds: 0.5 },
  },
  voicemailMessage: "Hi, this is Max, the StudyMax owl, returning your request. Open the app whenever you'd like to talk.",
  // Not "everything's in the app": the app draws its own plan and doesn't show what Max saves.
  endCallMessage: 'Talk soon — call me back any time.',
  maxDurationSeconds: 2700, // 45 min; api/max/call.ts also sets it on every call (MAX_CALL_SECONDS)
  server: { url: WEBHOOK_URL, headers: AUTH_HEADERS },
  // A hold or a long think: a gentle "still here" every 25 seconds of silence rather than dead air
  // (and a quiet line never reads as the call being over). The count resets whenever they speak.
  hooks: [
    {
      on: 'customer.speech.timeout',
      options: { timeoutSeconds: 25, triggerMaxCount: 8, triggerResetMode: 'onUserSpeech' },
      do: [{ type: 'say', exact: ["I'm still here — take your time.", "No rush — I'm here when you're ready."] }],
    },
  ],
  model: {
    provider: 'openai',
    model: 'gpt-4.1',
    temperature: 0.3,
    messages: [{ role: 'system', content: SYSTEM_PROMPT }],
    tools,
  },
})

console.log('Updated assistant:', updated.id, updated.name)
console.log('Tools:', updated.model?.tools?.map((t) => t.function?.name))
console.log('Server URL:', updated.server?.url, '| header set:', Boolean(updated.server?.headers?.['x-vapi-secret']))

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

const SYSTEM_PROMPT = `You are Max, the academic planning assistant for StudyMax, speaking with a university student on a phone call.

# Who you're talking to (AUTHORITATIVE — from their record)
Name: {{name}}
Program: {{programLine}}
Current term: {{currentTerm}} — taking {{currentCoursesLine}}
Roadmap v{{roadmapVersion}}: projected graduation {{projectedGraduation}}
First call with you: {{isFirstCall}}

# How you speak
Phone call. Keep turns to 1-3 sentences. Never list more than 3 things at once; offer more instead. Warm, direct, practical.

# Grounding
Only state courses, requirements, prerequisites, offerings, or dates that appear above or in a tool result from this call. If you don't know, look it up with get_student_overview or say you're not sure. Never guess a course code.

# Changing the plan
You can explore any change with run_scenario — it never changes the official plan by itself. Right now you can only drop an in-progress course or restore an earlier version; if asked for anything else (adding a course, changing major, moving a course to a specific term), say you can't do that yet and suggest the app.
To save a change: first say the headline from run_scenario's result (graduation change first) and any warnings, then ask one yes/no question: "Want me to save that as your plan?" Only call commit_scenario after a clear yes to that exact question, passing the student's own words as confirmationUtterance. If they hedge or ask a question instead of answering, ask once more; if still unclear, tell them it's saved as a draft in the app.
Dropping a course they're currently taking must also be done with the registrar — say so once, right after describing that kind of change.

# Boundaries
You are not an official advisor; the university's rules and advisors have the final say. You don't register students for courses. Politely redirect anything off-topic (course content help, essays, grades, financial/immigration advice, mental health). If the student sounds distressed, acknowledge it and share: {{wellnessResourceLine}}.

# Ending the call
End the call once the student's question is actually answered and they have nothing more to add — after a plain "thanks"/"that's all"/"bye" to a direct "anything else?", or after they decline further help. Ask "anything else I can help with?" before ending unless they've already said goodbye first. Never end mid-question, mid-explanation, or right after asking them something yourself. Don't say your own goodbye line — ending the call speaks it for you.

# Skills
- Opening: first call -> introduce yourself and ask what's on their mind. Returning call -> "Hi {{name}}, it's Max. What can I help with?" Don't recap the whole roadmap unprompted.
- "Where am I at" / "remind me" -> answer from what's above; call get_student_overview only if it feels stale. Say graduation term, current load, offer more detail.
- "What if..." / "what happens if..." -> translate into a DROP_COURSE or RESTORE_VERSION op (ask one clarifying question if ambiguous), call run_scenario, speak the headline first, then warnings. Ask: keep it, tweak it, or leave it.
- Imperative changes ("drop CMPT 370", "undo that") -> same as above, then go straight to the save confirmation.
- "Keep it" / a clear yes to the save question -> commit_scenario. "Leave it" -> discard_scenario.
- If the student corrects their name or asks to be called something else, call update_name with it, confirm briefly ("Got it, James"), and use that name for the rest of this call.`

const tools: import('@vapi-ai/server-sdk').Vapi.OpenAiModelToolsItem[] = [
  {
    type: 'function',
    function: {
      name: 'get_student_overview',
      description:
        "Refreshes the student's program, roadmap, and current courses. Most of this is already in context at call start — call this only if it might be stale (e.g. after a commit) or the student asks something broad.",
      parameters: { type: 'object', properties: {}, required: [] },
    },
    server: { url: TOOL_URL, headers: AUTH_HEADERS },
  },
  {
    type: 'function',
    function: {
      name: 'run_scenario',
      description:
        "Explores a hypothetical change to the student's roadmap WITHOUT saving it. Only two kinds of change are supported right now: dropping a course they're currently taking, and restoring an earlier saved version. Returns a spoken headline (graduation change first), warnings, and a presentedHash needed to commit.",
      parameters: {
        type: 'object',
        properties: {
          ops: {
            type: 'array',
            items: {
              type: 'object',
              oneOf: [
                {
                  type: 'object',
                  properties: { op: { const: 'DROP_COURSE' }, courseCode: { type: 'string', description: 'e.g. CMPT370' } },
                  required: ['op', 'courseCode'],
                },
                {
                  type: 'object',
                  properties: { op: { const: 'RESTORE_VERSION' }, versionNumber: { type: 'integer' } },
                  required: ['op', 'versionNumber'],
                },
              ],
            },
          },
          scenarioId: { type: 'string', description: 'Only set when adding another change to one already discussed this call.' },
        },
        required: ['ops'],
      },
    },
    server: { url: TOOL_URL, headers: AUTH_HEADERS },
    messages: [{ type: 'request-start', content: 'Let me check that.' }],
  },
  {
    type: 'function',
    function: {
      name: 'discard_scenario',
      description: "Throws away an explored change with no effect on the student's real plan. Use when the student says to leave it / not do that.",
      parameters: { type: 'object', properties: { scenarioId: { type: 'string' } }, required: ['scenarioId'] },
    },
    server: { url: TOOL_URL, headers: AUTH_HEADERS },
  },
  {
    type: 'function',
    function: {
      name: 'commit_scenario',
      description:
        "Saves an explored change as the student's official plan. Only call this after you've said the headline out loud and the student has clearly said yes to a direct yes/no question.",
      parameters: {
        type: 'object',
        properties: {
          scenarioId: { type: 'string' },
          presentedHash: { type: 'string', description: 'The presentedHash returned by the run_scenario call this refers to.' },
          confirmationUtterance: { type: 'string', description: "The student's own words confirming, verbatim." },
        },
        required: ['scenarioId', 'presentedHash', 'confirmationUtterance'],
      },
    },
    server: { url: TOOL_URL, headers: AUTH_HEADERS },
  },
  {
    type: 'function',
    function: {
      name: 'update_name',
      description:
        "Updates the student's name. Call this when they correct you or ask to be called something else — use the new name for the rest of the call afterward.",
      parameters: {
        type: 'object',
        properties: { name: { type: 'string', description: 'The name they want to be called, e.g. James' } },
        required: ['name'],
      },
    },
    server: { url: TOOL_URL, headers: AUTH_HEADERS },
  },
  {
    // Vapi's built-in end-call tool (spec 09: "endCall / transfer use Vapi's built-in tools") — no
    // server webhook needed. The rejection plan is a cheap guard against hanging up mid-question.
    type: 'endCall',
    rejectionPlan: {
      conditions: [{ type: 'regex', regex: '\\?', target: { position: -1, role: 'user' } }],
    },
  },
]

const client = new VapiClient({ token: apiKey })
const updated = await client.assistants.update({
  id: assistantId,
  firstMessage: 'Hi, this is Max from StudyMax.', // overridden per call by api/max/call.ts
  firstMessageInterruptionsEnabled: false,
  voicemailMessage: "Hi, this is Max from StudyMax returning your request. Open the app whenever you'd like to talk.",
  endCallMessage: 'Talk soon. Everything we changed is in the app.',
  maxDurationSeconds: 1200,
  server: { url: WEBHOOK_URL, headers: AUTH_HEADERS },
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

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
You can explore a change with run_scenario — it never changes the official plan by itself. The changes you can make: drop a course they're taking, change how many courses they take a term (1-5), turn Spring/Summer terms on or off (and how many courses a summer, 1-3), switch their specialization, or go back to an earlier saved version. For anything else (adding one specific course, changing major, moving a course to a specific term), say you can't do that yet and suggest the app. To recommend something, use get_plan_options — never estimate a graduation term yourself.
When the app is open on this call (uiVisible: true in a tool result), every change reshapes the tree on their screen as you speak — say "it's on your screen now" the first time only, and never narrate the visuals.
A specialization switch can't be saved by voice: never call commit_scenario for it (requiresAppConfirmation: true) — tell them to tap Keep this plan on their screen.
To save a change: first say the headline from run_scenario's result (graduation change first) and any warnings, then ask one yes/no question: "Want me to save that as your plan?" Only call commit_scenario after a clear yes to that exact question, passing the student's own words as confirmationUtterance. If they hedge or ask a question instead of answering, ask once more; if still unclear, don't save it — tell them you've left it unsaved and they can ask you again any time.
Dropping a course they're currently taking must also be done with the registrar — say so once, right after describing that kind of change.

# Boundaries
You are not an official advisor; the university's rules and advisors have the final say. You don't register students for courses. Politely redirect anything off-topic (course content help, essays, grades, financial/immigration advice, mental health). If the student sounds distressed, acknowledge it and share: {{wellnessResourceLine}}.

# Ending the call
End the call once the student's question is actually answered and they have nothing more to add — after a plain "thanks"/"that's all"/"bye" to a direct "anything else?", or after they decline further help. Ask "anything else I can help with?" before ending unless they've already said goodbye first. Never end mid-question, mid-explanation, or right after asking them something yourself. Don't say your own goodbye line — ending the call speaks it for you.

# Skills
Opening is handled for you: first call -> introduce yourself and ask what's on their mind; returning call -> "Hi {{name}}, it's Max. What can I help with?" Don't recap the whole roadmap unprompted.
For anything else, match the student's request to one of these and call load_skill with that name the moment a trigger fires, before responding, then follow exactly what it returns:
- summarize_roadmap: "where am I at", "remind me", "what's my plan", or any broad "how am I doing" question.
- what_if: "what if...", "what happens if...", "could I...".
- manage_roadmap: imperative changes ("drop CMPT 370", "make it 4 a term", "undo that"), and saving or discarding something already explored.
- recommend_plan: "what should I do", "can I graduate sooner", "fastest way", "lighter load", "should I switch", "use my summers".
- correct_name: the student corrects their name or asks to be called something else.`

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
        "Explores a change to the student's roadmap WITHOUT saving it: drop a course they're taking, set their pace or Spring/Summer terms, switch specialization, or restore an earlier saved version. Pass the scenarioId to build on a change already shown. Returns a spoken headline (graduation change first), warnings, errors, a presentedHash needed to commit, requiresAppConfirmation (a switch — saved only by the student's tap), and uiVisible (the change is on their screen).",
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
                {
                  type: 'object',
                  properties: {
                    op: { const: 'SET_PREFERENCE' },
                    key: { type: 'string', enum: ['maxCoursesPerTerm', 'springSummer', 'maxSummerCourses'] },
                    value: { description: 'maxCoursesPerTerm: 1-5; springSummer: true/false; maxSummerCourses: 1-3', type: ['integer', 'boolean'] },
                  },
                  required: ['op', 'key', 'value'],
                },
                {
                  type: 'object',
                  properties: {
                    op: { const: 'SET_SPECIALIZATIONS' },
                    specializationIds: {
                      type: 'array',
                      items: { type: 'string' },
                      description: "The specialization to switch to: an id or its name from get_student_overview's availableSpecializations.",
                    },
                  },
                  required: ['op', 'specializationIds'],
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
      name: 'get_plan_options',
      description:
        "The student's real alternatives on one topic, best first — each scored by building the whole plan it would give, so its graduation is exactly what their tree would show. Returns up to 3 options ({label, graduation, vsNow, coursesLeft, ops}), which one to recommend and why. To show one, pass its ops to run_scenario unchanged.",
      parameters: {
        type: 'object',
        properties: {
          about: {
            type: 'string',
            enum: ['pace', 'summer', 'specialization'],
            description: 'pace: courses a term; summer: Spring/Summer terms; specialization: a different specialization.',
          },
        },
        required: ['about'],
      },
    },
    server: { url: TOOL_URL, headers: AUTH_HEADERS },
    messages: [{ type: 'request-start', content: 'Let me look at your options.' }],
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
      name: 'load_skill',
      description:
        "Loads the full playbook for one of the named skills (summarize_roadmap, what_if, manage_roadmap, recommend_plan, correct_name) before you act on it. Call this the moment a trigger matches, before responding — don't try to follow a skill from memory without loading it first.",
      parameters: {
        type: 'object',
        properties: { name: { type: 'string', enum: ['summarize_roadmap', 'what_if', 'manage_roadmap', 'recommend_plan', 'correct_name'] } },
        required: ['name'],
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
  // Not "everything's in the app": the app draws its own plan and doesn't show what Max saves.
  endCallMessage: 'Talk soon — call me back any time.',
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

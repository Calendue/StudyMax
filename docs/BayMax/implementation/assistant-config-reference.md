# Vapi Assistant Config — Reference

> **Source of truth is `scripts/configure-max-assistant.ts`** (it's what gets pushed). Since 2026-09-27
> it also has the `get_plan_options` tool, `SET_PREFERENCE` / `SET_SPECIALIZATIONS` in `run_scenario`,
> the `recommend_plan` skill, and the live-on-screen rules in the prompt — see `docs/BayMax/HANDOFF.md`
> ("Max, live on the Skill Tree"). The copy below predates those.

Paste-ready content for wiring `VAPI_ASSISTANT_ID` (spec `09`, implementation `06`). Not applied by
code: the Vapi dashboard is the safer place to set this the first time, since it's a shared resource
and the exact API shape should be checked against Vapi's current docs before scripting it (spec `09`'s
own caveat — "treat names as intent, not contract"). Whoever wires this up:

1. Set the **server URL secret** (Assistant → Advanced → Server URL Secret, or `POST /assistant` with
   `server.secret`) to a new random value. Put the same value in Vercel as `VAPI_SERVER_SECRET` —
   `api/max/tool.ts` and `api/max/webhook.ts` both reject requests without it.
2. Set the assistant's **server URL** (for status-update / end-of-call-report / hang / transcript
   events) to `https://study-max-theta.vercel.app/api/max/webhook`.
3. Add the four tools below, each with its own **server URL** set to
   `https://study-max-theta.vercel.app/api/max/tool` (tool-calls arrive there, separately from the
   lifecycle events above).
4. Set `model.messages` (system prompt) to the template below.
5. Set the other fields from the table below.
6. Also set `VAPI_PHONE_NUMBER_ID` in Vercel (a Vapi phone number id) — `api/max/call.ts` won't place
   calls without it, and `api/features.ts` won't turn "Ping Max" on in the app without it either.

## Assistant settings

| Setting | Value |
| --- | --- |
| `model.provider` / `model.model` | `openai` / `gpt-4.1` (spec 09: keep for v1) |
| `model.temperature` | `0.3` |
| `firstMessage` | Overridden per call by `api/max/call.ts` (`assistantOverrides.firstMessage`) — leave a placeholder here, e.g. `"Hi, this is Max from StudyMax."` |
| `firstMessageInterruptionsEnabled` | `false` |
| `voicemailDetection` | enabled |
| `voicemailMessage` | `"Hi, this is Max from StudyMax returning your request. Open the app whenever you'd like to talk."` (no name, no academic info — spec 11) |
| `endCallMessage` | `"Talk soon — call me back any time."` (not "everything's in the app": the app draws its own plan and doesn't show what Max saves) |
| `maxDurationSeconds` | `1200` (20 min) |
| `serverMessages` | include `status-update`, `end-of-call-report` at minimum |
| `analysisPlan.summaryPlan` | disabled (we generate our own — deferred this weekend, → `07`) |

## System prompt (`model.messages[0]`, role `system`)

Variables (`{{...}}`) come from `assistantOverrides.variableValues` in `api/max/call.ts` — extend that
call if you add more variables here.

```text
You are Max, the academic planning assistant for StudyMax, speaking with a university student on a phone call.

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
- manage_roadmap: imperative changes ("drop CMPT 370", "undo that"), and saving or discarding something already explored.
- correct_name: the student corrects their name or asks to be called something else.
```

Note on progressive disclosure (docs/BayMax/implementation/08-skills-progressive-disclosure.md): the
four named skills above each have a full playbook in `docs/BayMax/skills/<name>/SKILL.md`, compiled by
`scripts/build-skills.ts` into `src/lib/max/skills.generated.ts` (a plain data import — no runtime file
I/O, same reasoning as the `.js`-extension note above). The system prompt only carries the short
routing table; the `load_skill` tool (below) fetches the real instructions on demand. Edit the
`SKILL.md` files and rerun `npm run build:skills`, not this prompt, to change what a skill actually
does.

Note on identity: `api/_maxIdentity.ts`'s `resolveMaxUser()` resolves to whichever real account is
signed in (via the `Authorization: Bearer <idToken>` header on `api/max/call.ts`/`settings.ts`),
falling back to the seeded demo student only for a guest. `{{name}}` above therefore reflects a real
tester's own account name when signed in, not always "Demo".

Note on `{{currentTerm}}`/`{{currentCoursesLine}}`: `GeneratedPlan.terms` only ever holds courses not
yet taken (`buildStudentPlan` assumes in-progress ones are already done "by start") — its last entry
is the graduation term, not the one running now. `api/max/call.ts` computes `currentTerm` from
`currentTermOf(new Date())` (`src/lib/plan.ts`, shared with the Academic Skill Tree) and
`currentCoursesLine` from `StudentCourse` rows with `status: "in_progress"` — never from `plan.terms`.
Found and fixed 2026-09-27: both were previously read off `plan.terms`' last entry, so a call would
open by telling the student their current courses were their graduation-term ones.

Note on `{{wellnessResourceLine}}`: no `Institution`-level wellness-resource field exists yet (spec
`11` calls for one, deferred). `api/max/call.ts` sends a hardcoded national fallback (Canada/US's 988
Suicide Crisis Helpline) for every school until a real per-institution one is built. Found and fixed
2026-09-27: this variable was referenced in the live prompt but never set in `variableValues` at all.

Note on program/specialization names: `profile.majorProgramId`/`minorProgramId` and
`targetSpecializationIds` are catalogue slugs (`"computer-science"`), not display names — resolved to
`Program.name`/`Specialization.name` via `programName()`/`specializationName()`
(`src/lib/max/planningAdapter.ts`) before they reach `{{programLine}}` or a tool result. Found and
fixed 2026-09-27: `programLine` and `get_student_overview`'s `program` object previously sent the raw
slug, so Max would say "computer-science" instead of "Computer Science."

## Tools (`model.tools`)

Each tool: `type: "function"`, `server.url: "https://study-max-theta.vercel.app/api/max/tool"`,
`messages: [{ type: "request-start", content: "Let me check that." }]` (only needed on `run_scenario`,
whose p95 is closer to 1.5s than the others).

```json
[
  {
    "type": "function",
    "function": {
      "name": "get_student_overview",
      "description": "Refreshes the student's program, roadmap, and current courses. Most of this is already in context at call start — call this only if it might be stale (e.g. after a commit) or the student asks something broad.",
      "parameters": { "type": "object", "properties": {}, "required": [] }
    },
    "server": { "url": "https://study-max-theta.vercel.app/api/max/tool" }
  },
  {
    "type": "function",
    "function": {
      "name": "run_scenario",
      "description": "Explores a hypothetical change to the student's roadmap WITHOUT saving it. Only two kinds of change are supported right now: dropping a course they're currently taking, and restoring an earlier saved version. Returns a spoken headline (graduation change first), warnings, and a presentedHash needed to commit.",
      "parameters": {
        "type": "object",
        "properties": {
          "ops": {
            "type": "array",
            "items": {
              "type": "object",
              "oneOf": [
                {
                  "type": "object",
                  "properties": {
                    "op": { "const": "DROP_COURSE" },
                    "courseCode": { "type": "string", "description": "e.g. CMPT370" }
                  },
                  "required": ["op", "courseCode"]
                },
                {
                  "type": "object",
                  "properties": {
                    "op": { "const": "RESTORE_VERSION" },
                    "versionNumber": { "type": "integer" }
                  },
                  "required": ["op", "versionNumber"]
                }
              ]
            }
          },
          "scenarioId": { "type": "string", "description": "Only set when adding another change to one already discussed this call." }
        },
        "required": ["ops"]
      }
    },
    "server": { "url": "https://study-max-theta.vercel.app/api/max/tool" },
    "messages": [{ "type": "request-start", "content": "Let me check that." }]
  },
  {
    "type": "function",
    "function": {
      "name": "discard_scenario",
      "description": "Throws away an explored change with no effect on the student's real plan. Use when the student says to leave it / not do that.",
      "parameters": {
        "type": "object",
        "properties": { "scenarioId": { "type": "string" } },
        "required": ["scenarioId"]
      }
    },
    "server": { "url": "https://study-max-theta.vercel.app/api/max/tool" }
  },
  {
    "type": "function",
    "function": {
      "name": "commit_scenario",
      "description": "Saves an explored change as the student's official plan. Only call this after you've said the headline out loud and the student has clearly said yes to a direct yes/no question.",
      "parameters": {
        "type": "object",
        "properties": {
          "scenarioId": { "type": "string" },
          "presentedHash": { "type": "string", "description": "The presentedHash returned by the run_scenario call this refers to." },
          "confirmationUtterance": { "type": "string", "description": "The student's own words confirming, verbatim." }
        },
        "required": ["scenarioId", "presentedHash", "confirmationUtterance"]
      }
    },
    "server": { "url": "https://study-max-theta.vercel.app/api/max/tool" }
  },
  {
    "type": "function",
    "function": {
      "name": "load_skill",
      "description": "Loads the full playbook for one of the named skills (summarize_roadmap, what_if, manage_roadmap, correct_name) before you act on it. Call this the moment a trigger matches, before responding — don't try to follow a skill from memory without loading it first.",
      "parameters": {
        "type": "object",
        "properties": { "name": { "type": "string", "enum": ["summarize_roadmap", "what_if", "manage_roadmap", "correct_name"] } },
        "required": ["name"]
      }
    },
    "server": { "url": "https://study-max-theta.vercel.app/api/max/tool" }
  },
  {
    "type": "function",
    "function": {
      "name": "update_name",
      "description": "Updates the student's name. Call this when they correct you or ask to be called something else — use the new name for the rest of the call afterward.",
      "parameters": {
        "type": "object",
        "properties": { "name": { "type": "string", "description": "The name they want to be called, e.g. James" } },
        "required": ["name"]
      }
    },
    "server": { "url": "https://study-max-theta.vercel.app/api/max/tool" }
  },
  {
    "type": "endCall",
    "rejectionPlan": {
      "conditions": [{ "type": "regex", "regex": "\\?", "target": { "position": -1, "role": "user" } }]
    }
  }
]
```

The last one is Vapi's built-in end-call tool (spec 09: "endCall / transfer use Vapi's built-in tools") —
no server webhook needed. The `rejectionPlan` is a cheap guard against hanging up mid-question (rejects
ending the call if the student's last message ended in a `?`).

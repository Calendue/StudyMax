// Max's system prompt and tool schemas: pushed to Vapi by scripts/configure-max-assistant.ts and run
// against the real model locally by scripts/max-chat.ts, so both use exactly the same words.
// No side effects on import.
import type { Vapi } from '@vapi-ai/server-sdk'

export const SYSTEM_PROMPT = `You are Max, the academic planning assistant for StudyMax, speaking with a university student on a phone call.

# Who you're talking to (AUTHORITATIVE — from their record)
Name: {{name}}
Program: {{programLine}}
Current term: {{currentTerm}}. At call start, under way by term: {{currentCoursesLine}}
At call start, roadmap v{{roadmapVersion}}: projected graduation {{projectedGraduation}}
(A snapshot from when the call began. Their plan changes whenever something is saved — see Terms below.)
First call with you: {{isFirstCall}}

# How you speak
Phone call, so short turns win. Most turns are ONE sentence; never more than two, under about 30 words. Lead with the answer, then stop and let them talk. No preamble ("Great question", "Sure, let me..."), no repeating back what they said, no recap of what you just did, no filler sign-offs ("Let me know if..."). At most one question per turn, at the end. Name courses by code ("CMPT 370"), not title, unless they ask. Never list more than 3 things; offer more instead. From a tool result, say only the one line that answers them (a headline's first line) and hold the rest for if they ask. Warm, direct, casual, like a friend who knows the degree rules.
If they talk over you, stop and answer what they just said; don't finish or repeat what you were saying.

# Terms, not years
Any question about what they're taking, registered for or have planned in a term ("what am I in this semester", "what's in Winter 2027", "what's my schedule", "what's left") — call get_schedule first, every time, even if you answered it earlier in the call: it's their plan as it is right now, after every save. Never answer it from the call-start lines above or from memory, and never say a term has nothing in it unless get_schedule says so (nothingThen). Name only that term's courses: what they're taking or registered for (takingNow) first, then what's planned (planned); say an open slot by its name ("a free elective"). Never read out a whole year as one term. If there's more than 3, give the count and the first few, and offer the rest.

# Grounding
Only state courses, requirements, prerequisites, offerings, or dates that appear above or in a tool result from this call. If you don't know, look it up with get_student_overview or say you're not sure. Never guess a course code.

# Changing the plan
You can explore a change with run_scenario — it never changes the official plan by itself. The changes you can make: add a course (in a term they name, or wherever it fits), move a course later or to a term they name, take one back out, drop a course they're taking, change how many courses they take a term (1-5), turn Spring/Summer terms on or off (and how many courses a summer, 1-3), aim for a graduation term, switch their specialization, add/change/drop a minor, change major, switch Four-year/Honours/Three-year, set or clear an internship year (Year 3 or 4), or go back to an earlier saved version. To recommend something, use get_plan_options — never estimate a graduation term yourself.
You're their advisor, not a gatekeeper. When they want a course moved — "move CMPT 370", "push it back", "take it later", even one they're taking right now — run MOVE_COURSE (leave toTerm out unless they named a term); the server finds the next term that actually works, dropping it from this term first if they're taking it. Never tell them a course can't be moved or that they have to drop it first. When a result has placement lines, say the first one right after the headline: it's where the course landed and why.
Seat questions — "is there a seat in CMPT 370", "is it full", "can I still get into it next term" — go straight to check_seats, with or without the app open, then say the status in one sentence (and that it's full, if it is).
With the app open (uiVisible: true), app_action can also open a tab (overview, plan, awards, classes) or open the Class Tracker on a course's sections so they can watch a seat — that happens right away, no save question.
When the app is open on this call (uiVisible: true in a tool result), every change reshapes the tree on their screen as you speak — say "it's on your screen now" the first time only, and never narrate the visuals.
Every change, program changes included, saves the same way: a clear spoken yes to the save question (or their tap on Keep this plan). Never ask to save a change whose result has feasible: false — say the first error and offer a fix.
To save a change: first say the headline from run_scenario's result (graduation change first) and any warnings, then ask one yes/no question: "Want me to save that as your plan?" Only call commit_scenario after a clear yes to that exact question, passing the student's own words as confirmationUtterance. If they hedge or ask a question instead of answering, ask once more; if still unclear, don't save it — tell them you've left it unsaved and they can ask you again any time.
Dropping a course they're currently taking must also be done with the registrar — say so once, right after describing that kind of change.

# Boundaries
You are not an official advisor; the university's rules and advisors have the final say. You don't register students for courses. Politely redirect anything off-topic (course content help, essays, grades, financial/immigration advice, mental health). If the student sounds distressed, acknowledge it and share: {{wellnessResourceLine}}.

# Turning a change down
When the student says no to the save question, or "leave it", "not now", "never mind", or otherwise turns down a change you showed, call discard_scenario right away — it clears the proposal from their screen, the same as tapping Not now — then say in a few words that you've left their plan as it was. Never just move on with a proposal still open.

# Holding
If the student asks you to wait ("hold on", "one sec", "give me a minute", "hang on, Max") or says they're talking to someone else, reply only "Sure, take your time." and then say nothing until they speak to you again. Don't answer anything said to someone else in the meantime, don't ask questions, don't summarize. When they come back ("okay", "I'm back", "sorry about that"), pick up exactly where you left off: repeat your last open question in one short sentence. A hold never ends the call.

# Ending the call
Never end the call on a guess. Wait for a real lull — a few seconds where neither of you is talking — then ask exactly "Is everything all set?" as a turn of its own, never tacked onto another question or onto an answer. After saving or answering something, end your turn with "Anything else?" (or nothing), never "Is everything all set?" — that question only ever comes after the lull. Their answer decides it: on a clear yes ("yes, thank you", "yep, that's everything", "all set") — or if they say goodbye first, unprompted, without you needing to ask — call the endCall tool and say nothing else in that same turn; Vapi speaks the goodbye for you once the tool fires. Never speak a goodbye line yourself instead of, or in the same turn as, calling the tool — the tool call itself is the entire response. Anything else — a new question, "hold up", "actually...", them talking over you before you finish asking, or a plain "no" — means there's more to cover: keep going, don't call endCall, and don't ask the question again until the next real lull. A "thanks", "thank you", or "okay" answering some other question is NOT a goodbye — answer it, then wait for the next lull. Never call endCall mid-question, mid-explanation, during a hold, or right after saving something.

# Skills
Opening is handled for you: the greeting (who you are, and what's on their mind) is already spoken, so answer their first words directly without introducing yourself again. You are Max, the StudyMax owl: if asked who or what you are, say so, lightly, then get back to their plan. Don't recap the whole roadmap unprompted.
For anything else, match the student's request to one of these and call load_skill with that name the moment a trigger fires, before responding, then follow exactly what it returns:
- summarize_roadmap: "where am I at", "remind me", "what's my plan", or any broad "how am I doing" question.
- what_if: "what if...", "what happens if...", "could I...".
- manage_roadmap: imperative changes ("drop CMPT 370", "move CMPT 370", "add CMPT 318", "switch me to Cybersecurity", "specialize in AI", "add a stats minor", "make it 4 a term", "undo that", "leave it as it was"), app actions ("show my awards", "open the class tracker"), and saving or discarding something already explored.
- recommend_plan: "what should I do", "can I graduate sooner", "fastest way", "lighter load", "should I switch", "use my summers".
- correct_name: the student corrects their name or asks to be called something else.`

export function maxTools(toolUrl: string, authHeaders: Record<string, string>): Vapi.OpenAiModelToolsItem[] {
  const TOOL_URL = toolUrl
  const AUTH_HEADERS = authHeaders
  return [
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
          "Explores a change to the student's roadmap WITHOUT saving it: add/move/unpin a course, drop a course they're taking, set their pace or Spring/Summer terms, aim for a graduation term, switch specialization, minor, major or degree, set an internship year, or restore an earlier saved version. Several ops can go in one call. Pass the scenarioId to build on a change already shown. Returns a spoken headline (graduation change first), warnings, errors, feasible, a presentedHash needed to commit, and uiVisible (the change is on their screen).",
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
                    properties: {
                      op: { const: 'RESTORE_VERSION' },
                      versionNumber: {
                        type: ['integer', 'string'],
                        description: 'A saved version number, or "previous" for the plan as it was before the last save (to undo a save: "leave it as it was", "undo that").',
                      },
                    },
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
                      op: { const: 'ADD_COURSE' },
                      courseCode: { type: 'string', description: 'e.g. CMPT318' },
                      term: { type: 'string', description: 'Only if the student named one, e.g. "Winter 2028". Omit to let the planner place it.' },
                    },
                    required: ['op', 'courseCode'],
                  },
                  {
                    type: 'object',
                    properties: {
                      op: { const: 'MOVE_COURSE' },
                      courseCode: { type: 'string' },
                      toTerm: {
                        type: 'string',
                        description:
                          'Only if they named a term, e.g. "Fall 2027". Leave it out for "later": the next term that works. A course they are taking now is dropped from this term and moved.',
                      },
                    },
                    required: ['op', 'courseCode'],
                  },
                  {
                    type: 'object',
                    properties: { op: { const: 'UNPIN_COURSE' }, courseCode: { type: 'string' } },
                    required: ['op', 'courseCode'],
                  },
                  {
                    type: 'object',
                    properties: { op: { const: 'SET_GRAD_TARGET' }, term: { type: 'string', description: 'The term they want to finish by, e.g. "Winter 2029"' } },
                    required: ['op', 'term'],
                  },
                  {
                    type: 'object',
                    properties: {
                      op: { const: 'SET_MINOR' },
                      programId: { type: ['string', 'null'], description: "A name from get_student_overview's availableMinors, or null for no minor." },
                    },
                    required: ['op', 'programId'],
                  },
                  {
                    type: 'object',
                    properties: { op: { const: 'SET_MAJOR' }, programId: { type: 'string', description: "A name from get_student_overview's availableMajors." } },
                    required: ['op', 'programId'],
                  },
                  {
                    type: 'object',
                    properties: { op: { const: 'SET_DEGREE' }, variant: { type: 'string', description: 'Four-year, Honours or Three-year (availableDegrees).' } },
                    required: ['op', 'variant'],
                  },
                  {
                    type: 'object',
                    properties: { op: { const: 'SET_INTERNSHIP' }, year: { type: ['integer', 'null'], description: '3 or 4 (the year of their degree), or null for no internship year.' } },
                    required: ['op', 'year'],
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
        name: 'app_action',
        description:
          "Does something in the StudyMax app on the student's screen, right away (no save question). Only works while the app is open on this call. open_tab: switch to overview, plan, awards or classes. find_class: open the Class Tracker on a course's sections so they can tap one to watch its seats. For whether a course has seats, use check_seats instead.",
        parameters: {
          type: 'object',
          properties: {
            action: { type: 'string', enum: ['open_tab', 'find_class'] },
            tab: { type: 'string', enum: ['overview', 'plan', 'awards', 'classes'], description: 'For open_tab.' },
            courseCode: { type: 'string', description: 'For find_class, e.g. CMPT370.' },
          },
          required: ['action'],
        },
      },
      server: { url: TOOL_URL, headers: AUTH_HEADERS },
    },
    {
      type: 'function',
      function: {
        name: 'get_schedule',
        description:
          "Their courses term by term, from their plan as it is right now (after any save this call): for each term, what they're taking or registered for (takingNow) and what's planned (planned; open slots by name). Call it for every question about what's in a term — never answer that from the call-start context.",
        parameters: {
          type: 'object',
          properties: {
            term: {
              type: 'string',
              description: 'One term: "current" (this term), "next", or a term like "Winter 2027". Leave out for every term in order.',
            },
          },
          required: [],
        },
      },
      server: { url: TOOL_URL, headers: AUTH_HEADERS },
    },
    {
      type: 'function',
      function: {
        name: 'check_seats',
        description:
          "Checks USask's live class search for one course in one term: open seats in its lecture sections, or whether it's full or waitlisted. Use for any seat question (is there a seat, is it full, can I still get in). Works with or without the app open. Returns status (open, waitlist, full, not_running, not_published), seatsOpen, the sections, and a speakable line.",
        parameters: {
          type: 'object',
          properties: {
            courseCode: { type: 'string', description: 'e.g. CMPT370' },
            term: {
              type: 'string',
              description: '"current" (this term), "next" (the term they register for next), or a term like "Winter 2027". Leave out for next.',
            },
          },
          required: ['courseCode'],
        },
      },
      server: { url: TOOL_URL, headers: AUTH_HEADERS },
      messages: [{ type: 'request-start', content: 'Let me check the class search.' }],
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
      // server webhook needed. The rejection plan refuses to hang up (any one of these is enough) when
      // the student's last words were a question, a "hold on", or started with "no" ("Uh, no." to an
      // unrelated question once hung up). Never test Max's own last turn: when this runs, the assistant's
      // latest message is the empty endCall tool call itself, so such a check rejected every hangup.
      type: 'endCall',
      rejectionPlan: {
        conditions: [
          {
            type: 'group',
            operator: 'OR',
            conditions: [
              { type: 'regex', regex: '\\?', target: { position: -1, role: 'user' } },
              { type: 'regex', regex: '[Hh]old on|[Hh]old up|[Hh]ang on|[Oo]ne sec|[Aa] sec\\b|[Aa] second|[Aa] minute|[Ww]ait|talking to', target: { position: -1, role: 'user' } },
              { type: 'regex', regex: '^\\W*([Uu]h|[Uu]m)?\\W*[Nn]o\\b', target: { position: -1, role: 'user' } },
            ],
          },
        ],
      },
    },
  ]
}

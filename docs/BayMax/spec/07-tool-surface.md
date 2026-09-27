# 07 — Tool Surface

## Two layers

The original design listed ~40 tools and had skills chain them from the LLM. That conflates two different things:

- **Service API** — internal backend functions. Fine-grained, composable, called by other backend code and by the app. The original list lives here, mostly unchanged.
- **Agent tools** — what GPT-4.1 sees inside Vapi. Few, coarse, each one a complete unit of work.

Why split:

- **Latency.** Each LLM tool call is a model turn + a webhook round trip. `/WhatIf` as specified is ~8 sequential calls; over a phone line that's dead air measured in seconds.
- **Reliability.** A model orchestrating 8 steps will eventually skip `validateRoadmap` or call `compareRoadmaps` on the wrong versions. A server-side pipeline can't.
- **Selection accuracy and prompt size.** 40 tool schemas on every turn cost tokens and degrade the choice of tool.
- **Security.** Coarse tools are easier to authorize (I6).

## Agent tools (the only functions exposed to Max)

Common rules:

- **No `studentId` parameter anywhere.** The server resolves the student from the Vapi call ID via the `Call` table (I6). A tool call from an unknown or ended call is rejected.
- Every response includes `speakable?: string` for errors and a compact JSON payload for success. Keep payloads small; the model reads them every turn.
- Errors: `{ ok: false, code, speakable }`. Max says `speakable` or a paraphrase; it does not invent a cause.

| # | Tool | Class | p95 budget |
|---|---|---|---|
| 1 | `get_student_overview` | READ | 300 ms |
| 2 | `get_remaining_requirements` | READ | 300 ms |
| 3 | `search_courses` | READ | 500 ms |
| 4 | `get_course_details` | READ | 300 ms |
| 5 | `run_scenario` | PROPOSE | 1.5 s (minimal mode 600 ms) |
| 6 | `commit_scenario` | COMMIT | 500 ms |
| 7 | `discard_scenario` | PROPOSE | 200 ms |
| 8 | `save_preference` | COMMIT (low-risk) | 200 ms |
| 9 | `evaluate_decision` | READ/PROPOSE | 2.5 s |

`endCall` / transfer use Vapi's built-in tools.

### 1. get_student_overview()

Most of this is injected at call start (→ 09), so the tool is for refresh after a commit or when the student asks something broad.

```ts
→ {
  name, program: { degree, major, minor, specializations },
  currentTerm, currentCourses: CourseCode[],
  completedCount, creditsEarned,
  roadmap: { versionNumber, projectedGraduation, nextTerms: { term, courses: string[] }[] /* next 3 */ },
  preferences: { key, value, enforceable }[],
  activeScenario?: { id, status, opsSummary: string[] }
}
```

Wraps: `getStudentContext`, `getRoadmap`, `getUserPreferences`, `getCompletedCourses`, `getCurrentCourses`.

### 2. get_remaining_requirements()

```ts
→ { complete: boolean, remaining: { label, status, need: string, exampleCourses: CourseCode[] /* ≤3 */ }[], warnings: string[] }
```

Wraps: `getDegreeRequirements`, `getMajorRequirements`, `getMinorRequirements`, `getConcentrationRequirements`, `getRemainingRequirements`.

### 3. search_courses({ query, term?, level?, onlyEligible? })

```ts
→ { results: { code, title, credits, offeredIn: TermCode[], eligibleNow: boolean, satisfies: string[] /* requirement labels */ }[] /* ≤5 */ }
```

`query` is natural language ("AI," "ecology labs"); backend does keyword + embedding search over title/description/tags. Results are catalog rows only; Max never names a course that didn't come from a tool result (→ 08).

Wraps: `searchCourses`, `checkCourseEligibility`, `getCourseAvailability`.

### 4. get_course_details({ code })

Accepts messy codes from STT ("see em pee tee two fifteen"). Backend normalizes and fuzzy-matches; if ambiguous returns `{ ok: false, code: "AMBIGUOUS_COURSE", candidates: [...] }` so Max can ask "Did you mean CMPT 215 or CMPT 214?"

```ts
→ { code, title, credits, description /* ≤ 300 chars */, prerequisitesPlain: string,
    eligible: boolean, missingPrereqs: CourseCode[], offeredIn: { term, confidence }[],
    inRoadmap?: TermCode, alternatives?: CourseCode[] }
```

Wraps: `getCourse`, `getCoursePrerequisites`, `checkCourseEligibility`, `getCourseAvailability`, `getCourseAlternatives`.

### 5. run_scenario({ ops: ScenarioOp[], scenarioId?, mode?: "append" | "new" })

The core. Server pipeline: create or load scenario → append ops → minimal-perturbation regenerate → validate → diff → mark `presented` → push to UI.

```ts
→ {
  scenarioId, presentedHash,
  feasible: boolean,
  headline: string[],                 // ≤ 3, from RoadmapDiff.headline
  warnings: string[],                 // plain-language WARNINGs
  errors: string[],                   // plain-language ERRORs (commit will be blocked)
  relaxations?: { id, label, effect }[], // if infeasible
  requiresAppConfirmation: boolean,   // program ops
  uiVisible: boolean                  // is the app open on this session's student right now
}
```

Wraps: `createScenario`, `updateScenario`, `regenerateRoadmap`, `validateRoadmap`, `compareRoadmaps`, `checkDegreeCompletion`, `getScenario`.

Marking `presented` at return time is deliberate: the tool result is exactly what Max will speak. If Max doesn't speak it and the student says "yes," the affirmative check plus the headline requirement in the prompt are the backstop — log these cases (→ 12).

### 6. commit_scenario({ scenarioId, presentedHash, confirmationUtterance })

Semantics and server checks in `06`. Returns `{ ok, versionId, undoAvailable }` or an error with `speakable`.

Wraps: `commitScenario`, `saveRoadmap`, `updateStudentContext` (academic fields).

### 7. discard_scenario({ scenarioId })

Wraps: `discardScenario`.

### 8. save_preference({ key, value, evidence })

- `key` must be in the registry (→ 03); unknown key → `{ ok: false, code: "UNKNOWN_PREFERENCE" }` and Max should fall back to `save_note` behavior (server stores as `StudentNote` if `key = "note"`).
- `evidence` = the student's words. Required.
- Does **not** regenerate the official roadmap. Response includes `affectsRoadmap: boolean` so Max can offer a what-if.

Wraps: `updateUserPreferences`.

### 9. evaluate_decision({ decisionType, params })

Not in the must-ship tier for this weekend (→ README) — ships only if time allows after `get_student_overview`/`run_scenario`/`commit_scenario`/`discard_scenario` work live. `summer_courses` as a `decisionType` doesn't apply until summer terms exist (cut for v1, → 03 decision 1); drop it from the enum below until then.

Combines `getMissingContext` and `evaluateOptions` into a single call with a two-state result.

`decisionType` enum (v1): `summer_courses`, `graduate_earlier`, `add_minor`, `take_course_now_or_later`, `course_load`, `change_major`.

```ts
→ | { status: "needs_context", missing: { key, question: string }[] /* ≤ 2 */ }
  | { status: "ready", options: {
        label, scenarioOps: ScenarioOp[],
        facts: { graduation?: TermCode, maxLoad: number, summerCourses: number, notes: string[] }
      }[] /* 2–3 */ }
```

`getMissingContext` is a **lookup table**, not an LLM judgment: each `decisionType` declares required preference keys; missing = required − stored. E.g. `summer_courses` requires `graduationPriority`, `summerWillingness`, `maxSummerCourses`.

`evaluateOptions` runs the planner for each option (as uncommitted, unpresented scenarios) and returns facts. Max turns facts into a recommendation; the tool doesn't recommend.

## Permission classes

Enforced in the tool gateway, not the prompt.

| Class | Agent tools | Server rule |
|---|---|---|
| READ | 1–4, 9 | Always allowed during an active call |
| PROPOSE | 5, 7 | Allowed; writes only scenario rows |
| COMMIT | 6 | Full check list in `06` |
| COMMIT (low-risk) | 8 | Registry-validated; audit-logged; no confirmation needed beyond evidence |

Removed from the original COMMIT list: `changeMajor`, `addMinor`, `dropCourse` (now scenario ops), `registerForCourse` (out of scope; implies SIS writes).

## Service API (internal)

Retain the original functions with these changes:

- `createRoadmap` → `generateRoadmap` (onboarding only).
- `updateConversationSummary` → internal, called by the end-of-call handler (→ 10). Not an agent tool.
- `getConversationSummary` → internal; injected at call start.
- `restoreRoadmap` → implemented as a `RESTORE_VERSION` scenario op.
- `updateStudentContext` → split: non-academic fields (name, phone, timezone) editable directly from the app; academic fields only via scenario commit.

The app uses the service API directly (with the same permission model), so voice and app share one implementation of every rule.

## Acceptance criteria

- Agent tool schemas total < 2,500 tokens.
- Contract tests: every agent tool rejects calls without a valid active call mapping.
- `run_scenario` returns results equivalent to calling the underlying service functions in sequence (property test).

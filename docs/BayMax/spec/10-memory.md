# 10 — Memory

## Three kinds, one hierarchy

| Kind | Store | Authority | Written by | Read by |
|---|---|---|---|---|
| Structured record | Student, ProgramEnrollment, CourseAttempt, Roadmap | **authoritative** (I1) | app, onboarding, scenario commit | planner, Max (injected + tools) |
| Preferences | Preference (typed) + StudentNote (free text) | authoritative for constraints; notes are context | onboarding, settings, Max via `save_preference` | planner (enforceable only), Max |
| Conversation summary | ConversationSummary | **non-authoritative** | backend job at end of call | Max (injected) |

When they conflict, higher rows win. The system prompt labels the summary as non-authoritative (→ 08), and the summary generator is instructed never to restate program, course, or graduation facts as facts — it may reference them only as events ("they committed a plan moving CMPT 370 to winter").

## Preferences

### When Max writes

- The student states a **durable** constraint or goal: "I never want more than four," "I want to graduate early," "I don't want summer courses."
- Not: hypotheticals ("what if I did five"), one-offs ("just this winter"), or anything in the excluded categories (health, finances, immigration, family, disability) even if the student explains a constraint with it. Save the constraint, not the reason: "can't do more than three because of my part-time job" → `maxCoursesPerTerm = 3`; the job isn't saved.

### Conflicts

If the new value differs from the stored one, Max asks before overwriting ("You'd said four max before — should I change that to three?"). A preference set in the app within the last 24 h is never overwritten by voice without explicit confirmation.

### Effects

Saving a preference never modifies the official roadmap. If the current roadmap violates the new preference, `save_preference` returns `affectsRoadmap: true` and Max offers a what-if (→ 08 S8). The app shows a banner: "Your plan doesn't match your new preference — review?"

### Student control

Settings shows every preference with its source and evidence ("Set by Max on Oct 3: 'I really don't want more than four'"), editable and deletable. Deleted = removed, not soft-flagged.

## Conversation summary

### Generation

Runs on the Vapi end-of-call report, server-side, not as an LLM tool mid-call (reasons: calls drop; the voice model shouldn't spend turns on bookkeeping; the backend has structured events the voice model doesn't).

Inputs:

- Previous `ConversationSummary.summary`
- This call's transcript
- Structured events from this call: scenarios created/presented/committed/discarded (with headlines), preferences saved, errors

Output (strict JSON):

```ts
{
  summary: string,        // exactly 3 sentences:
                          // 1. how this call started / why they called
                          // 2. important things learned or decided
                          // 3. where it ended
  openThreads: { kind: "scenario" | "question", ref?: string, text: string }[]  // ≤ 3
}
```

`openThreads` is where continuity actually lives: a presented-but-uncommitted scenario becomes `{ kind: "scenario", ref: scenarioId, text: "exploring two summer courses" }`. Threads for expired or discarded scenarios are dropped at injection time.

### Rolling vs. per-call

Each call writes a new row. The next call injects **only the latest** summary + open threads. Previous summaries are retained (for debugging and the app's call history) but not re-summarized into each other — recursive summarization drifts and compounds errors.

### Validation

Before saving, check the summary doesn't contain course codes or terms absent from the transcript or events (cheap regex + set check). Fail → regenerate once → else save with `flagged = true` and inject nothing from it next call.

### Exclusions

Same exclusion categories as preferences. If a student disclosed something sensitive during the call (distress, health, finances), the summary records at most "the student mentioned a personal difficulty" — or nothing — never details. Max must not bring it up next call (→ 11).

## What Max sees at call start

Injected via `variableValues` (→ 09):

- Structured record lines (authoritative)
- Enforceable + context preferences
- Latest summary + live open threads
- `isFirstCall` = `!hasMetMax`

Everything else via tools.

## Acceptance criteria

- Summary is generated for 100% of calls with duration > 30 s.
- 0 summaries containing course codes not present in the source transcript/events (after validation).
- A student can see and delete every preference and summary from Settings.
- Preference writes during a call are visible in the app within 2 s.

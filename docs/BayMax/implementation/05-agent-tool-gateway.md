# 05 — Agent Tool Gateway

The webhook endpoint Vapi calls mid-call when Max invokes a tool. This is the I6/I2 enforcement point:
no tool ever accepts a student identifier as an argument — identity comes only from the Vapi call ID,
resolved server-side against `MaxCall`. Depends on `06-vapi-voice-integration.md`'s outbound-call flow
having already created that `MaxCall` row with a `vapiCallId`.

## Route

One new Vercel function, `api/max/tool.ts`, following this codebase's existing handler pattern (see
`api/why-you.ts` for the shape: typed `VercelRequest`/`VercelResponse` interfaces, `POST` only, `.js`
extensions on relative imports even though the source is `.ts`). Vapi's tool-call webhook posts a
`toolCallId`, a tool `name`, and `arguments` — check current Vapi docs for the exact envelope shape at
implementation time (spec `09`'s own caveat: "verify each against current Vapi docs... treat names as
intent, not contract").

## Identity resolution (I6)

```ts
async function resolveCall(vapiCallId: string) {
  const call = await prisma.maxCall.findUnique({ where: { vapiCallId } })
  if (!call || call.status === 'ended' || call.status === 'failed') return null
  return call // call.userId is the only source of identity for every tool below
}
```

Every tool handler starts with this lookup. No exceptions, including for `get_student_overview` — a
tool call from an unknown or ended call is rejected with a generic error, never given student data.

## Webhook authenticity

Spec `09` flags `isServerUrlSecretSet: false` as unset in the current Vapi config — **set a server URL
secret before wiring this up for real**, and verify it on every request to `api/max/tool.ts` before
doing anything else, including before the identity lookup. This is cheap (compare a header against an
env var) and is one of spec `11`'s acceptance criteria.

## Dedupe (`MaxToolCall`)

Vapi can redeliver webhooks. Before executing anything, upsert-check `MaxToolCall` by `toolCallId`
(the Prisma `@id`): if a row already exists with a `result`, return it directly without re-running the
tool. Otherwise insert a row (`ok: null`, no result yet), execute, then update it with the outcome. This
makes every tool idempotent for free and doubles as the per-tool trace spec `12` wants (deferred in
full, but this table costs nothing extra to populate now).

## The four must-ship tools

Implement exactly the request/response shapes from spec `07` for these four; skip the other five
(`search_courses`, `get_course_details`, `save_preference`, `evaluate_decision` — → `07`).

### `get_student_overview()`

Reads `StudentProfile`, `GeneratedPlan` (+ latest `PlanVersion` for `versionNumber`), `StudentCourse`
(current-term = `in_progress`). No `StudentPreference` rows will exist yet in this weekend's scope
(nothing writes them), so return an empty `preferences` array rather than erroring on a missing table
join. `activeScenario` — check for a `Scenario` row with `status` in `("computed", "presented")` for
this `callId`.

### `run_scenario({ ops, scenarioId?, mode? })`

Calls `runScenario()` from `04-scenarios-and-commits.md`. Only `DROP_COURSE` and `RESTORE_VERSION` ops
are supported (→ implementation `03`) — any other op in the array → `{ ok: false, code: "UNSUPPORTED_OPERATION",
speakable: "I can't make that kind of change yet — try dropping or restoring a course instead." }`
rather than silently ignoring it. Mark the scenario `"presented"` and compute `presentedHash` at return
time, exactly as spec `07` specifies ("the tool result is exactly what Max will speak").
`requiresAppConfirmation` is always `false` this weekend (no program ops reachable). `uiVisible` can be
hardcoded `false` for the demo unless `06` also builds the realtime UI channel (not required for
must-ship — the app doesn't need to visibly update mid-call for the phone demo to land).

### `discard_scenario({ scenarioId })`

Thin wrapper over `discardScenario()` from `04`.

### `commit_scenario({ scenarioId, presentedHash, confirmationUtterance })`

Thin wrapper over `commitScenario()` from `04`. Pass `channel: "voice"`, `callId` from the resolved
`MaxCall`, and `utterance: confirmationUtterance` straight through.

## Response contract

Every tool response, success or failure, follows spec `07`'s shape: small JSON payload plus an optional
`speakable` string for errors. Keep payloads small — Max reads them every turn, and spec `07`'s
acceptance criterion is agent tool schemas under 2,500 tokens total (only matters for the tool
*definitions* sent to Vapi, → implementation `06`, but keeping response payloads terse matters for
latency too, → spec `09`'s turn-latency budgets).

## Definition of done

- [ ] A tool call with an unknown `vapiCallId` gets a generic rejection, no student data, from every
      one of the four tools (test each).
- [ ] Webhook requests without a valid server-URL-secret header are rejected before any DB lookup.
- [ ] Redelivering the same `toolCallId` twice executes the underlying action once and returns the
      same cached result both times.
- [ ] `run_scenario` with an unsupported op (e.g. `MOVE_COURSE`) returns a speakable rejection, not a
      crash or a silently-ignored op.

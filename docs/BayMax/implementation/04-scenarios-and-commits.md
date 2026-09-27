# 04 — Scenarios and Commits

Implements spec `06`'s lifecycle (`draft → computed → presented → committed/discarded`) and the
server-checked commit, scoped to what the must-ship demo actually exercises: one `DROP_COURSE` op,
voice-only, no program changes. Put the service functions in `src/lib/max/scenarios.ts`.

## Scope cuts from spec `06` (explicit, not accidental)

- **No program-op tier check is reachable this weekend** — `SET_MAJOR`/`SET_MINOR`/`SET_SPECIALIZATIONS`
  aren't supported ops (→ `03-planning-and-audit-adapter.md` scopes ops to `DROP_COURSE` +
  `RESTORE_VERSION`). Still write the tier-check branch in `commitScenario` exactly as spec `06`
  describes it (`channel !== "app"` → `REQUIRES_APP_CONFIRMATION`) — it's cheap, it's a real safety
  property (I2), and it means this code doesn't need revisiting when more ops are added later.
- **`minCoursesPerTerm`/full-time-load enforcement isn't exercised.** It was resolved as a hard
  constraint (→ spec README), but nothing writes `StudentPreference` yet in this weekend's scope
  (`save_preference` is deferred, → `07-post-hackathon-backlog.md`), so there's no preference value to
  violate. Don't build enforcement logic for a constraint nothing can currently set.
- **`origin` is always `"voice"`** for this weekend — app-initiated and settings-initiated scenarios
  aren't part of the must-ship path.

## `createScenario` / `run_scenario` pipeline

One function, e.g. `runScenario(userId, ops, existingScenarioId?)`, does what spec `06`/`07` describe as
several: load or create a `Scenario` row (`baseVersion` = current `GeneratedPlan.version`), validate the
op against current state (`DROP_COURSE` on a code not in `inProgress` → reject with a speakable error,
per spec `06`'s op-validation rule), append it to `operations`, call
`planningAdapter.regenerate()`/`.validate()`/`.diff()` (→ `03`), and write `resultInputs`, `resultTerms`,
`diff`, `validation`, `status: "computed"` back to the row.

**`presentedHash`**: compute when the tool gateway (→ `05`) marks a scenario `"presented"`, as
`hash(resultTerms, diff.headline, validation.issues)` (spec `06`) — a plain SHA-256 over a
deterministic JSON.stringify is enough, no need for anything fancier. Store it on the row. Any later
op append must clear/replace it (the row returns to `"computed"`), so a stale hash can never match at
commit time (I2's enforcement point).

## `commitScenario`

Implement the check order from spec `06` exactly, in a single DB transaction:

1. `scenario.userId === session.userId` (I6 — the tool gateway already resolved this, but check again
   here so this function is safe to call from anywhere).
2. `status === "presented"` and the given `presentedHash` matches the stored one.
3. `scenario.baseVersion === GeneratedPlan.version` (else reject `STALE`).
4. `validation.ok === true`.
5. Tier check (see above — dead code path this weekend, keep it anyway).
6. Voice affirmative check on `confirmation.utterance` (see below).
7. Idempotency: `PlanVersion.scenarioId` is `@unique` (→ spec `03`), so a retried commit on an
   already-committed scenario fails the unique constraint — catch that and return the original
   `versionId` instead of erroring.

On success: call `commitPlanVersion(tx, planId, snapshot, { createdBy: "scenario_commit", scenarioId })`
(bumps `GeneratedPlan.version`, writes the head, appends `PlanVersion`), write an `AuditLog` row
(`action: "plan.commit"`), return `{ ok: true, versionId, undoToken }`.

### Voice affirmative check

Spec `06`'s rule set is simple enough to implement as a small regex/keyword classifier, not a model
call — deliberately, so it's fast and testable:

- Accept: utterance matches `/^\s*(yes|yeah|yep|sure|go ahead|do it|confirm|save it)\b/i` with nothing
  else meaningful after it.
- Reject: contains a question mark, a hedge word (`maybe`, `guess`, `but`, `and also`), or a negation
  (`no`, `don't`, `not`) anywhere.
- On reject: `commitScenario` returns `{ ok: false, code: "AMBIGUOUS_CONFIRMATION", speakable: "..." }`;
  the agent-tool layer (→ `05`) is responsible for the "ask once more, then fall back to draft" flow
  from spec `06`/`08` — don't put conversation flow control in this service function.

## Undo

`undoToken` = the scenario's own id, valid for 30 minutes (store `expiresAt` on a lightweight
in-memory-is-fine-for-a-demo map, or reuse the `Scenario.expiresAt` field on a synthetic
`RESTORE_VERSION` scenario created at commit time — the latter matches spec `06` more closely and
costs one extra row). Undo = create a new scenario with op
`{ op: "RESTORE_VERSION", versionNumber: parentVersion }`, run it through the same pipeline, and let
the normal confirm flow apply (a single "yes" per spec `06`).

## `discardScenario`

Sets `status: "discarded"`. No other side effects. This is the cheap tool spec `07` calls
`discard_scenario` — implement it alongside `run_scenario` since it's nearly free and completes the S5
`whatIf` skill's "leave it" branch (→ spec `08`).

## Definition of done

- [ ] Presenting the same scenario twice without new ops returns the same `presentedHash`.
- [ ] Appending an op to a presented scenario changes the hash; committing with the old hash is
      rejected (test — this is spec `06`'s core acceptance criterion).
- [ ] Committing twice with the same `(scenarioId, presentedHash)` produces exactly one `PlanVersion`
      (test the unique-constraint-catch path directly).
- [ ] A commit where `baseVersion` no longer matches `GeneratedPlan.version` is rejected as `STALE`.
- [ ] `discardScenario` leaves `GeneratedPlan` completely untouched.

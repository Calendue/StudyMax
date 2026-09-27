# 06 — Scenarios, Confirmation, and Commits

Implements the READ → ANALYZE → PROPOSE → VALIDATE → SHOW → CONFIRM → COMMIT loop. This is the enforcement point for I2: **the LLM can create and present scenarios freely, but only the server decides whether a commit is allowed.**

## Scenario operations

Every change — voice, app, settings — is expressed as typed ops. There is no other write path to the roadmap or program enrollment after onboarding.

`ScenarioOp` is defined in `03-data-model.md` (JSON shapes). It uses the existing schema's single major/minor, specialization slugs, `{ season, year }` terms, and catalogue course codes (`"CMPT145"`).

Rules:

- Ops are validated on append: course/program exists, term is in the future, op makes sense against current scenario state (`MOVE_COURSE` on a course not in the plan → rejected with a speakable error).
- Ops apply in order. `SET_PREFERENCE` inside a scenario lets "what if I took 5 a term" be explored without changing the stored preference; committing the scenario writes the preference.
- **Dropping a current-term course** is a real-world registration action we can't perform. The op is allowed (it models the consequence), but the committed result carries an INFO telling the student to drop it with the registrar, and Max must say so.

## Lifecycle

```
          append op / recompute
draft ───────────────► computed ──── present ───► presented ──┬─ commit(ok) ─► committed
  ▲                       │                          │         ├─ discard ────► discarded
  └──── append op ────────┴──────────────────────────┘         ├─ timeout ────► expired
                                                               └─ base moved ─► stale
```

- **computed**: planner ran (minimal-perturbation, → 05), validation and diff attached.
- **presented**: the diff was shown (app) or spoken (voice). Server computes `presentedHash = hash(result.version.terms, result.enrollment, diff.headline, validation issues)` and returns it.
- Appending an op to a presented scenario returns it to `computed` with a new hash on next present. The old hash is now invalid. This is what makes "yes" bind to what the student actually heard.
- **stale**: official version changed since `baseVersionId` (e.g. student edited in the app mid-call). Offer rebase: re-apply ops on the new base, recompute, re-present.
- **expired**: 7 days after last activity. Pending scenarios appear in the app as "Unfinished plan change" until then.

Concurrency: at most **one active voice scenario per call**; any number of app scenarios. Starting a new what-if in a call while one is presented → Max asks whether to discard, or the new ops are appended ("and also take summer courses") per intent.

## Commit

```ts
commitScenario({
  scenarioId,
  presentedHash,
  confirmation: {
    channel: "voice" | "app",
    utterance?: string,        // voice: the student's confirming words, verbatim from STT
    callId?: string
  }
}) → { ok: true, versionId, undoToken } | { ok: false, code, speakable }
```

Server checks, in order — any failure rejects:

1. Scenario belongs to the session's student (I6).
2. `status === "presented"` and `presentedHash` matches current.
3. `scenario.baseVersion === GeneratedPlan.version` (else `STALE`).
4. `validation.ok === true` (no ERRORs).
5. **Tier check**: if any op is `SET_MAJOR`, `SET_MINOR`, or `SET_SPECIALIZATIONS`, `channel` must be `app`. Voice gets `{ code: "REQUIRES_APP_CONFIRMATION", speakable: "..." }` and the server sends a push notification with a confirm deep link.
6. Voice only: `utterance` passes the affirmative check (below). This is a belt-and-braces check on the LLM's judgment, not a replacement.
7. Idempotency: `(scenarioId, presentedHash)` committed once; a retried webhook returns the original result.

On success, in one transaction:

- `commitPlanVersion()` (→ 03): bump `GeneratedPlan.version`, write the head, append `PlanVersion` (`createdBy: scenario_commit`, `scenarioId` set — its unique constraint makes a duplicate commit fail safely).
- If program ops: update `StudentProfile` major/minor/concentrationIds and the head's target fields together.
- Write committed `SET_PREFERENCE` values to `StudentPreference`.
- `AuditLog` entry with ops, hash, channel, utterance, callId.
- Emit `scenario.committed` to the UI channel (→ 09).

### Voice affirmative check

Deliberately simple and conservative:

- Accept: clear affirmatives ("yes," "yeah, do it," "go ahead," "confirm," "save it").
- Reject: hedges or conditionals ("I guess," "maybe," "sure but…," "yes, and also…"), questions, negations, or an utterance that also contains a new change request.
- Rejected → Max re-asks once with the headline; second ambiguity → Max says the change is saved as a draft in the app.

Implement as a small classifier or rules list; log every decision for eval (→ 12).

### Voice confirmation protocol (Max side, → 08)

Before calling commit, Max must, in the same turn or the previous one:

1. State the headline facts (graduation change first).
2. State any WARNINGs in plain words.
3. Ask a single yes/no question: "Want me to save this as your plan?"

## Undo and restore

- **Undo**: `undoToken` valid for the rest of the call or 30 minutes. Undo = `RESTORE_VERSION(parentVersion)` scenario that auto-presents and can be confirmed with a single yes. Still goes through commit; still a new version (I4).
- **Restore** any earlier version: from the app's version history, or Max ("go back to the plan I had last week") → Max lists up to 3 recent versions by date and headline difference, student picks, normal flow.

## discardScenario

Sets `discarded`. No effect on official state. Emits `scenario.discarded` so the UI drops the hypothetical view.

## Acceptance criteria

- No code path writes `GeneratedPlan` except through `commitPlanVersion()`.
- Commit with a hash from before the last op append is rejected (test).
- Voice commit containing a program op is rejected with `REQUIRES_APP_CONFIRMATION` (test).
- Duplicate commit webhook produces exactly one version (test).
- Every committed version is restorable, and restore produces a new version whose terms equal the target's.

## Decisions and rejected alternatives

- **Rejected: trust the LLM's decision that the user confirmed.** Prompt-level rules fail under STT errors and prompt injection; server checks don't.
- **Rejected: voice commits for program changes.** Changing a major has registrar and funding implications; a misheard "yes" is too costly. Voice can still explore them fully as what-ifs.
- **Rejected: `saveRoadmap` as an independent tool.** Every save goes through a scenario so there is one diff/validate/confirm path. `saveRoadmap` remains an internal function called only by commit.

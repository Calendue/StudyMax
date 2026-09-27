# Canvas sync + re-planning when a student drops or fails

**Pitch:** a plan goes out of date the moment a student drops a class or fails one. StudyMax connects to Canvas, notices it happened, and re-plans on its own: "You dropped CMPT 370. CMPT 371 moves to Fall 2027, and you now finish one term later. Here's the fix."

**Decisions already made:**
- **Auth:** the student pastes a Canvas **personal access token**, which is real data and works this weekend. There's also a **scripted mock Canvas** for the demo, so the demo never depends on USask's servers.
- **Fail flow:** the default is **re-plan with a retake**. StudyMax also **suggests alternatives** where the requirement slot allows another course.
- **Out of scope this weekend:** Canvas OAuth developer keys (this needs USask IT), webhooks or background polling, and early warnings from live grades. List them as "next" in the pitch.

**Owners:** TBD. There are three tracks:
- **A:** lib + checks, pure TypeScript, no UI.
- **B:** API route.
- **C:** UI. Coordinate with Ibraheem, who owns mobile.

---

## How it fits the code we already have

The plan is already a pure function of the student's course sets. In `useStudyMax()` (`src/App.tsx`), the plan is `buildStudentPlan(targets, planningSpecs, completed, uploadInProgress, coursesPerTerm, startTerm)` (`src/lib/plan.ts`). **Canvas only has to change `completed` and `uploadInProgress`; the plan, roadmap, overview and reveal recompute themselves.** There's no new planning engine.

### Prerequisite fixes (do first, ~30 min, also helps the rest of the app)

- **Persist more state.** Add `inProgress`, `startTerm`, `coursesPerTerm` to `SavedState` (`src/App.tsx`, `interface SavedState`). All three are lost on refresh today, so a synced student would lose their in-progress list.
- **Add new persisted state:**
  - `failed: string[]`
  - `dropped: string[]`
  - `avoid: string[]`: courses the student chose to swap out for an alternative
  - `canvasSnapshot: CanvasEnrollment[]`: the last sync result, **no token**
  - `planBefore: PlannedTerm[] | null`: the plan just before the last change, for the diff banner

## Track A: pure logic, `src/lib/canvas.ts` (new) + small additions to `src/lib/plan.ts`

There's no `fetch` here, which keeps it fully testable in a check script.

```ts
export interface CanvasEnrollment {
  canvasCourseCode: string          // raw, e.g. "CMPT 370 (01) 2026-27 T1"
  code: string | null               // catalogue code after mapping, e.g. "CMPT370"
  state: 'active' | 'completed' | 'inactive' | 'deleted' | 'invited' | 'rejected'
  currentScore: number | null
  finalScore: number | null
  finalGrade: string | null         // letter grade if the course uses one
  termName: string | null
}

export type CanvasEvent =
  | { kind: 'added'; code: string }
  | { kind: 'dropped'; code: string }   // enrollment went deleted / inactive while not completed
  | { kind: 'passed'; code: string }    // completed, final ≥ 50 (USask undergrad pass mark) and grade not F
  | { kind: 'failed'; code: string; score: number | null }
```

- **`toCatalogueCode(raw)`** returns a catalogue code or `null`.
  - Use a regex like `/\b([A-Z]{2,5})\s*-?\s*(\d{3})\b/`, then join to `SUBJ123` and keep it only if it's in `catalogueCourses` (`src/data/courses.ts`).
  - It must handle sections, cross-listed shells ("CMPT 370/CMPT 818"; take the first undergraduate match), labs and tutorials (drop them if their code equals the lecture code), and sandboxes or non-course shells (return `null`).
- **`diffEnrollments(prev, next)`** returns `CanvasEvent[]`, compared by `code`. It ignores `null` codes and the `invited`/`rejected` states.
- **`applyEvents(state, events)`** returns a new `{ completed, inProgress, failed, dropped }`. It must be idempotent: applying the same events twice gives the same result.
  - `added`: add to `inProgress`.
  - `dropped`: remove from `inProgress`, add to `dropped`.
  - `passed`: move from `inProgress` to `completed`; remove from `failed` (a retake passed).
  - `failed`: remove from `inProgress` **and** `completed`, add to `failed`.

### Re-plan and fail flow (additions to `src/lib/plan.ts`)

- **Retake (default) needs no code.** The failed or dropped course has left `completed`/`inProgress`, so its requirement slot is unsatisfied again and `buildStudentPlan` re-picks it. If it was a prerequisite, every dependant moves too, because `withPrerequisites` and `topologicalOrder` already handle ordering.
- **Alternatives:** `alternativesFor(code, targets, done)` returns `string[]`: the other options in the same unsatisfied group(s) that contain `code`, excluding done and avoided codes. Rank them the same way `selectCourses` does: advances more other specs, then fewer unmet prerequisites (`unmetPrerequisites`), then lower `courseLevel`, then alphabetical.
- **Avoid list:** add an optional `avoid: Set<string>` to `selectCourses` / `buildStudentPlan`. Skip avoided codes when ranking a slot's options, **unless** skipping them would leave the slot short (never make a plan impossible).
- **`planDiff(before, after)`** returns this, which feeds the banner:
  ```ts
  { finishBefore: string | null, finishAfter: string | null,
    added: string[], removed: string[],
    moved: { code: string, from: string, to: string }[] }
  ```

## Track B: API route `api/canvas-sync.ts` (new)

The browser can't call Canvas directly (CORS), so this route is a thin, locked-down proxy.

- `POST { token }` returns `{ enrollments: CanvasEnrollment[] }`.
- The **base URL is fixed server-side** to `https://canvas.usask.ca` (or an env var `CANVAS_BASE_URL`). **The route never accepts a URL from the client**, so it can't become an open proxy.
- It calls `GET /api/v1/users/self/enrollments?type[]=StudentEnrollment&state[]=active&state[]=completed&state[]=inactive&state[]=deleted&include[]=course&per_page=100` with `Authorization: Bearer <token>`, following the `Link: rel="next"` header for more pages.
- It maps each enrollment to `CanvasEnrollment`:
  - `course.course_code` or `course.name` becomes `canvasCourseCode`
  - `grades.current_score` / `final_score` / `final_grade` become the score and grade fields
  - `code = toCatalogueCode(...)`, imported from `src/lib/canvas.ts` the same way other routes import `src/lib/*`
- **Errors, with messages safe to show the student:**
  - 401: "That token was rejected — make a new one in Canvas → Account → Settings."
  - 403: "Your school doesn't allow student tokens — use demo mode."
  - timeout or 5xx: "Canvas didn't answer — try again."
- **Token hygiene:** it's used only for this request. It's never logged, never echoed back in errors, and never written to the DB or KV.
- Gate the route behind `/api/features` like AI and call (`src/features.ts`) if it needs an env var.

## Track C: UI (build from `src/ui/primitives.tsx`, `src/ui/Sheet.tsx`, `src/ui/chrome.tsx`)

1. **Connect Canvas.** Add a row on `CoursesScreen` and in `AccountSheet`. It opens a sheet with steps (Canvas → Account → Settings → "+ New Access Token"), a token field, a **Sync** button, and a **"Try demo Canvas"** link.
   - The token is kept in memory only (React state). **Never write it to localStorage or the DB.** Re-sync means pasting it again. That's acceptable for the weekend; say "secure storage" is next.
2. **Sync result sheet.** List the events found ("CMPT 370: dropped", "CMPT 332: failed (42%)", "MATH 266: passed") and apply them with a single **Update my plan** button.
3. **"Plan changed" banner** on `PlanTab`, showing `planDiff`: "Finish moved Winter 2027 → Fall 2027. CMPT 371 moved to Fall 2027 (needs CMPT 370)." Include a dismiss control. The roadmap redraws automatically.
4. **Failed-course sheet**, opened by tapping a failed course or from the banner:
   - **Retake CMPT 332** is the default, already in the plan.
   - **Take instead:** the top 3 from `alternativesFor`, each showing what it also counts toward. Picking one adds the failed code to `avoid`.
   - A link to USask academic advising (on the same `usask.resources` style as the awards).

## Demo mock: `src/data/canvasDemo.ts` (never depends on USask)

The mock is a scripted timeline for the **CS sample student** (`computerScience.sampleInProgress`: CMPT 332, 340, 353, 360, 370, 434, MATH 266):

| Sync # | What Canvas "returns" | Events | What the judge sees |
|---|---|---|---|
| 1 | all 7 active | none | "You're in sync" |
| 2 | CMPT 370 `deleted` | dropped CMPT 370 | the finish term slips; CMPT 370 is back in the plan with its dependants moved |
| 3 | CMPT 332 `completed`, final 42 | failed CMPT 332 | retake planned; the alternatives sheet shows other options for that slot |
| 4 | MATH 266 `completed`, final 81 | passed MATH 266 | the progress ring ticks up |

"Try demo Canvas" steps through the timeline one sync per tap, using the same `diffEnrollments` → `applyEvents` path as the real sync. It works offline.

**Tie-in:** after sync 2 or 3, offer the phone call ("Your plan changed…"). See `win-features.md` #2, and fix the `call-me` validation first.

---

## Test plan

### Automated: `scripts/check-canvas.ts` (new, plain `node:assert`)

- **`toCatalogueCode`:**
  - `"CMPT 370 (01) 2026-27 T1"` → `CMPT370`
  - `"CMPT370-02"` → `CMPT370`
  - `"MATH 266 L01"` → `MATH266`
  - a cross-listed shell → the first real code
  - `"Sandbox - Jane"` → `null`
  - `"ABCD 999"` (not in the catalogue) → `null`
- **`diffEnrollments`:** each transition, active → deleted/inactive/completed(pass)/completed(fail), gives exactly one correct event. Unchanged enrollments give none, and `null` codes are ignored.
- **Pass/fail edges:** a final of exactly 50 passes; 49.9 fails; grade "F" fails even with a missing score; a missing final score on `completed` is treated as passed (Canvas often leaves it blank). Log that last case.
- **`applyEvents`:**
  - It's idempotent (applying twice changes nothing).
  - A failed course is in neither `completed` nor `inProgress`.
  - Passing a retake clears `failed`.
- **Re-plan:**
  - After `failed CMPT332` for the CS sample, `buildStudentPlan` includes CMPT332, and everything whose prereq is CMPT332 lands in a later term.
  - After `dropped CMPT370`, the same holds for CMPT370.
- **Alternatives:**
  - They never include done, avoided or unrelated-group codes.
  - With `avoid = {CMPT332}` the plan omits CMPT332 when the slot has another option, and keeps it when it doesn't.
- **`planDiff`:** run the whole mock timeline end to end; the finish term is non-decreasing after drops and fails, and `moved` lists the dependants.
- **Every major:** reuse the synthetic students from `check-all-programs.ts`. Fail one random in-progress course per spec; the coverage invariant (#8 in `test-plan-majors.md`) still holds.

### Manual

- [ ] Real sync with a teammate's USask token (read-only). The enrollments list looks right and the codes map correctly.
- [ ] A bad token gives the friendly 401 message; airplane mode gives the friendly timeout message; there's no spinner forever.
- [ ] The token is absent from localStorage, sessionStorage, Vercel logs and the network response (check in DevTools).
- [ ] The demo timeline, on an iOS phone, an Android phone and the web: banner, roadmap redraw and alternatives sheet all work.
- [ ] Refresh after sync 3: `failed` / `dropped` persist and the plan is the same.
- [ ] Pick an alternative: the plan swaps the course and the banner updates; undo by choosing "Retake".
- [ ] **The CS sample path without Canvas is unchanged.** This is the demo safety net.

## Risks

- **USask may disable student tokens.** The demo mock covers this; check it with a real account early, before building UI around it.
- **Canvas course codes vary by instructor.** Anything unmapped is ignored (`code: null`), never guessed. Show "3 Canvas courses we couldn't match" so it's honest.
- **Letter grades vs percentages differ by course.** The rule is written once in `canvas.ts`; change it in one place.

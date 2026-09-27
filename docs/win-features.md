# Features to win: ranked, with test checklists

These are ranked by **judge impact ÷ build time**, protecting the CS demo path first. Everything here reuses the deterministic engine (`src/lib/match.ts`, `plan.ts`, `credentials.ts`, `roadmapLayout.ts`). None of it needs a new planning system. Flag to the team before starting one (CLAUDE.md), and claim it by writing your name in **Owner**.

| # | Feature | Build time | Demo risk | Owner |
|---|---|---|---|---|
| 0 | Fix `call-me` trust hole (blocker for #2) | 30 min | none | TBD |
| 1 | What-if mode | 2–3 h | low | TBD |
| 2 | Canvas → phone call | 1 h after Canvas + #0 | low | TBD |
| 3 | Shareable roadmap card | 2–3 h | low | TBD |
| 4 | Sample student per major | 1–2 h after fixtures | low | TBD |
| 5 | Advisor one-pager | 1–2 h | none | TBD |

---

## 0. Fix the `call-me` trust hole (do before showing the call anywhere public)

**Problem:** `api/call-me.ts` builds the spoken script from client-supplied `context` and only checks that `specializationName` exists. Anyone can POST any phone number with arbitrary text. The text is embedded in quotes inside Bland's task (`buildCallTask`, `src/lib/callScript.ts`), so it can also break out of the script. The result is a StudyMax-branded robocall relay billed to our Bland account.

**Fix (server side only):**
- Look up `specializationName` against the specialization names in `programs` (`src/data/programs/index.ts`).
- Look up `awardName` against `usask.resources`.
- Clamp `coursesRemaining` to an integer from 0 to 60.
- Reject anything else with a 400.

**Test:**
- [ ] Add cases to `scripts/check-call-script.ts`: a quote or instruction text in the name is rejected, unknown award is rejected, `coursesRemaining` of -1 or 9999 is clamped or rejected.
- [ ] A real call still works from the CS sample.

## 1. What-if mode: "What if I fail or drop this?"

**Pitch:** tap any in-progress course and choose "What if I fail it?" or "What if I drop it?". The plan and roadmap immediately show the consequence: "You'd finish Fall 2027 instead of Winter 2027; CMPT 371 slides with it." Then tap Undo.

**Why it wins:** it's the Canvas story without needing Canvas, it's instant, it works offline, and it's visually dramatic on the roadmap. It is also the fallback demo if Canvas tokens don't work at USask.

**Build:**
- Reuse `applyEvents` and `planDiff` from `docs/canvas-and-replan.md` (Track A). A what-if is simply a `failed` / `dropped` event applied to a **copy** of the state.
- Add `whatIf: CanvasEvent | null` to `useStudyMax()`. When it's set, the plan is computed from `applyEvents(state, [whatIf])`, and a sticky banner shows the diff with **Undo** and **Make it real** buttons.
- UI goes in `PlanTab` / `PlanRoadmap`: a per-course action sheet (`src/ui/Sheet.tsx`). Highlight moved nodes on the roadmap using `moved` from `planDiff`.

**Test:**
- [ ] `check-canvas.ts` already covers the logic. Add: a what-if never mutates the real `completed` / `inProgress`, and Undo gives back an identical plan.
- [ ] Manual, on phone: what-if on each of the CS sample's 7 in-progress courses. The banner makes sense, the roadmap highlights moved courses, and Undo restores the plan.
- [ ] A what-if on a course with no dependants reads "No change to your finish term", not an empty banner.

## 2. Canvas → phone call: "Your plan just changed"

**Pitch:** when a Canvas sync (or a what-if you make real) finds a drop or fail, StudyMax offers to call you. The call says: "You dropped CMPT 370. You're still two courses from Social Computing, and you now finish in Fall 2027. Your updated plan is in the app." It closes the loop between the product's two emotional beats: the reveal and the call.

**Build:**
- Extend `CallContext` / `buildCallScript` (`src/lib/callScript.ts`) with an optional `change: { course: string; kind: 'dropped' | 'failed'; finishAfter: string }`.
- Validate `change` server-side, the same way as #0: the course must be in the catalogue, the kind must be from the enum, and the term must match `^(Fall|Winter) \d{4}$`.
- Add an entry point from the "Plan changed" banner that goes to the existing `CallScreen`.

**Test:**
- [ ] `check-call-script.ts`: a change script contains the course, the finish term and no raw user text.
- [ ] Manual: demo Canvas sync 2, then call. The phone rings and the script matches the banner.
- [ ] Missing `BLAND_API_KEY`: the entry point is hidden (`/api/features`), not broken.

## 3. Shareable roadmap card

**Pitch:** a single tap produces a clean image, "I'm 1 course from the Social Computing specialization", with a mini roadmap. It opens the native share sheet on phones and downloads the image on the web. This gives the product a viral, show-your-friends moment; show judges the image you just shared.

**Build:**
- Render a fixed-size SVG from `buildRoadmapLayout` (`src/lib/roadmapLayout.ts`) with the brand palette from CLAUDE.md (Old Lace, Cherry Rose, Jet Black). Convert SVG → canvas → PNG in the browser; no new dependency.
- Share with `navigator.share({ files })` where it's supported, otherwise download.
- On native, if file sharing is flaky, fall back to saving the image. Check with Ibraheem before adding a Capacitor share plugin.

**Test:**
- [ ] The image renders for CS, engineering (a big plan, so cap it to the first N terms with "+ K more"), and a first-year student.
- [ ] Text never overflows; it looks good in both light and dark share previews.
- [ ] iOS share sheet, Android share sheet, and desktop download all work.

## 4. Sample student per major

**Pitch:** "It's not just CS." One tap loads a realistic engineering, nursing or commerce student, and the whole app (reveal, plan, roadmap, awards) works. This addresses the breadth gap (#2 in CLAUDE.md) directly and in front of judges.

**Build:**
- Promote the fixture students from `docs/test-plan-majors.md` Step 2 into `sampleTranscript` / `sampleInProgress` on each program (the `Program` type in `src/data/programs/types.ts` already has these fields).
- Generalise `loadSampleStudent` (`src/App.tsx`) to take a program id. It currently hard-codes `computerScience`.
- Only ship a sample for a major once its row in the QA table is all green.

**Test:**
- [ ] `check-all-programs.ts` pinned expectations pass for every shipped sample.
- [ ] Manual: every sample goes onboarding → reveal → plan → roadmap → awards on a phone.
- [ ] **The CS sample is unchanged and still the default.** It remains the demo safety net.

## 5. Advisor one-pager

**Pitch:** "Send this to your advisor." It produces a printable, one-page plan: targets, a term-by-term table, each hidden prerequisite with the catalogue's verbatim rule, and in-progress assumptions. Advisors are the adoption channel, so this is the "real product" signal.

**Build:**
- Extend the existing copy-plan text (the plan section in `PlanTab`) into a print stylesheet or HTML view. The data is already in `PlannedCourse` (`reason`, `neededBy`, `prerequisiteText`, `alsoAdvances`).
- Use `window.print()` on web; on native, share the text or PDF.

**Test:**
- [ ] Print preview fits on one page for CS; engineering flows onto page 2 cleanly.
- [ ] Every prerequisite row shows its verbatim rule.

---

## Ideas considered and parked (mention in the pitch as "next")

- **Early warning from live Canvas grades** ("you're at 48% in CMPT 332; here's the plan if it doesn't turn around"). Needs grade trends and careful wording.
- **Spring/Summer terms**, needed for nursing and for catching up after a fail. Changes `nextTerm` and the `Season` type; touches every plan check.
- **Two-way voice call**, answering "what should I take next term?". Only worth trying if #2 is rock solid.
- **More schools.** Adding programs is a data task, but only once the multi-major checks exist, so new data can't silently break the demo.

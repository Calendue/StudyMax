# StudyMax — hackathon context

This is an active hackathon submission, not a normal side project. **The clock is running now**: submission/demo is this weekend — today (all day and night) and a bit of tomorrow morning. Team: Ayo Ogunade, Sam Lafiaji, Tobi Salam, Ibraheem Arif. Optimizing for **general/overall best hack** — there's no single sponsor track to chase, so prioritize whatever makes judges say yes.

## What StudyMax is (see README.md for full detail)

Upload a transcript → StudyMax tells you what credential (specialization/certificate/minor) you're closest to finishing, the one course that advances the most of it, a term-by-term plan, and it calls your phone about the scholarship deadline closing soonest. Fully working end-to-end only for **Computer Science at University of Saskatchewan** right now; other programs are partially mapped or unmapped.

Matching/planning are deterministic (`src/lib/match.ts`, `src/lib/plan.ts`, `src/lib/credentials.ts`); an OpenAI model (`gpt-5-mini`, called only from `api/_openai.ts`) handles just the parts that need real reasoning (transcript parsing, scholarship "why this fits you" copy, guidance for unmapped schools).

## Current features (what's actually built and demoable today)

- Transcript upload (PDF — DegreeWorks audit or unofficial transcript), parsed by the model into completed vs. in-progress courses.
- Manual course entry: search across the full catalogue by code or title, or browse the Arts & Science course list and tick courses by hand.
- Credential matching: what specialization/certificate/minor you're closest to finishing, and the single highest-overlap course you haven't taken yet.
- Term-by-term plan generator, with prerequisite chains expanded automatically (including prereqs the specialization page itself never lists).
- Certificates/minors detector — surfaces credentials a student is partway through without knowing it.
- Scholarships/awards ranked by deadline, with AI-generated "why this fits you" copy.
- Outbound phone call (via Bland) about the award closing soonest — one-way, says its piece, hangs up.
- "Load a sample student" — a bulletproof canned path for demoing without a real transcript.
- Full end-to-end support for Computer Science at University of Saskatchewan; partial data (plan-only, no credential detection) for Applied Mathematics, Physics, and Applied Computing; every other Arts & Science subject reaches only the scholarship side.

## Scaling ideas toward a winning product

Brainstorm list — none of these are commitments until someone actually starts building them. Flag to the team before sinking real time into one.

- **Academic journey roadmap/graph UI (currently being explored).** Turn the term-by-term plan into a visual, graph-like roadmap: courses taken, in progress, and remaining laid out as connected nodes (prerequisite chains as edges), so a student can *see* their path to a credential at a glance instead of reading a list. This is the leading candidate for the "wow" feature from the gaps above — likely the single highest-impact visual upgrade for judging, since it turns an already-real feature (the plan) into something demoable at a glance from across a room.
- Mobile-first product (built — iOS and Android via Capacitor, see Mobile build below) as its own differentiator: most transcript/planning tools are desktop-only dashboards; a genuinely good phone experience is a visible point of difference in a room full of laptop demos.
- A shareable/exportable version of the roadmap or "what you're closest to" result (image or link) — gives the product a viral, show-your-friends moment beyond the live demo.
- GPA or "what-if" simulation on top of the existing deterministic planner (e.g., "what if I dropped this specialization for that one") — reuses `src/lib/plan.ts` and `src/lib/match.ts` rather than needing new infrastructure.
- Expanding the phone call from one-way to something more interactive, if Bland's capabilities allow it within the time left — higher risk, only worth it if the one-way call is already rock solid.

## Ownership

- **Ibraheem is currently owning everything mobile.** StudyMax is meant to be a **mobile-primary product** — the phone experience is the product, not a responsive afterthought. If you're touching layout, navigation, or interaction patterns, check with Ibraheem or look for in-flight mobile work before assuming desktop-first is the default to design against.

## Brand color palette

The five colors below are the canonical brand palette — use these for any new UI, design work, or the roadmap/graph visual explorations mentioned above.

| Name | Hex | RGB |
| --- | --- | --- |
| Old Lace | `#fff8eb` | 255, 248, 235 |
| Cherry Rose | `#982649` | 152, 38, 73 |
| Jet Black | `#12262b` | 18, 38, 43 |
| Ultrasonic Blue | `#0921d7` | 9, 33, 215 |
| Rosy Taupe | `#c38d94` | 195, 141, 148 |

**Note:** `tokens.css` currently has a provisional palette under similar names (Dark Teal, Ultrasonic Blue, Old Lace, Cherry Rose, Rosy Taupe) with different hex values and a full 50–950 shade scale for each — that was an earlier stand-in, not this canonical set. Whoever picks up UI/theming work next should reconcile `tokens.css` against the five hex values above (this is the source of truth going forward), swapping in the black instead of the earlier teal.

## Code structure: component-first, no more god pages

The app is a screen flow, not one page. `src/App.tsx` owns the state in one `useStudyMax()` hook and hands it to screens through `ModelContext` (`src/model.ts`, read with `useModel()`); it renders exactly one screen at a time with a directional transition. Keep it that way:

- Screens live in `src/screens/` (Welcome, the onboarding steps, Courses, Reading, Reveal, Results with its Overview/Plan/Awards tabs, Call, AccountSheet). Shared UI lives in `src/ui/`: `primitives.tsx` (Button, Group, Row, Appear, Ring, Chip…), `chrome.tsx` (TopBar, ScreenBody, ScreenTitle, ActionBar), `Sheet.tsx`, `motion.ts`, `Icon.tsx`. Build new UI from those, not from new CSS.
- The design system is `tokens.css` + `src/App.css`: Old Lace #FFF8EB page, ink #12262B, Cherry Rose #982649 as the single accent, Rosy Taupe #C38D94 as its tonal partner, no pure white/black. No component invents a colour, size or duration; it asks the tokens.
- A new piece of UI gets its own file with clearly typed props (or reads the model), not another inline block in `App.tsx`. Logic that isn't UI (matching, planning, credentials) stays in `src/lib/`.
- `src/platform.ts` wraps everything native (haptics, Android back button, splash, keyboard, the API base URL); `src/auth.ts` is the one sign-in module for native and web.

## Why we're not done: the three gaps to a winning submission

Ranked by what actually swings judges, in order of what to protect first:

1. **Demo polish & story.** The pitch and the live-demo path have to be flawless — no rough loading/error/empty states, no dead ends judges can wander into. The "reveal" moment (finding what you're close to) and the phone call at the end are the emotional payoff of the pitch; they need to land every single time we run the demo, including offline/no-real-transcript scenarios. **The sample data path ("Load a sample student" on the Courses screen) is the demo's safety net — it must never break.**
2. **Breadth beyond CS/USask.** Right now the "wow, it actually works" moment only exists for one program at one school. Per the README, adding a program is a **data task, not an engineering one**: one file in `src/data/programs/`, registered in `index.ts`, and matching/planning/credentials pick it up automatically. This is the highest-leverage way to make the product look bigger than it is — but only add programs if the data is trustworthy enough not to visibly break the demo (see `check-course-codes.ts`, `check-schools.ts`).
3. **A standout "wow" feature.** We need at least one moment in the demo that judges haven't seen in another submission. Not yet decided what this is — flag ideas to the team rather than unilaterally committing to a large new feature.

## Mobile build

The same Vite app ships as iOS and Android apps through Capacitor 8 (`capacitor.config.ts`, `ios/`, `android/`; app id `ai.calendue.studymax`). Native Apple and Google sign-in go through `@capacitor-firebase/authentication` against Firebase project `studymax-3a090`; the web uses the Firebase JS SDK only when the four `VITE_FIREBASE_*` vars are set, otherwise it starts as a guest. The native apps call the API at `https://study-max-theta.vercel.app` (`src/platform.ts`). Features that need `OPENAI_API_KEY` or `BLAND_API_KEY` are gated by `/api/features` (`src/features.ts`), so they stay hidden until those keys are in Vercel.

- `npm run build` then `npx cap sync` copies `dist/` into both native projects; open `ios/App/App.xcodeproj` or `android/` to run on a simulator/emulator.
- `npm run build:ios` builds the signed ad hoc IPA into `release/`; `npm run build:android` builds the signed APK. `npm run cap:assets` regenerates icons and splash.
- Never committed (gitignored): `ios/App/App/GoogleService-Info.plist`, `android/app/google-services.json`, `android/keystore.properties` and keystores, `release/`, `.env.local`. Get them from a teammate or the Firebase console.
- Native API calls go to the deployed Vercel site (`API_BASE` in `src/platform.ts`), so `api/` changes must be deployed before the app sees them.

## How to work during this sprint

- **Speed over ceremony.** This is a hackathon, not production software — favor small, shippable increments over the "right" long-term abstraction. It's fine to hardcode something for a specific demo path if it removes real risk.
- **Don't break the deployed demo.** The app is live on Vercel and gets demoed directly from it. Treat `main` as "must always be demoable" — prefer smaller, verifiable commits over big risky refactors close to demo time, and call out anything that could jeopardize the CS/USask happy path *before* touching it.
- **Keep the cheap safety nets, skip the expensive ones.** The `scripts/check-*.ts` asserts and `npm run lint && npm run build` are fast and catch exactly the kind of silent data breakage (a course code the catalogue dropped, a scholarship link that 404s) that would be embarrassing live — keep running them before calling something done. Don't add new test infrastructure or heavy process during the sprint.
- **Four people editing the same small codebase.** Keep diffs scoped and legible so teammates can tell what changed and why at a glance; avoid unrelated drive-by refactors while everyone's moving fast in parallel.
- **When in doubt, ask.** With this little runway, a wrong guess that has to be unwound costs more than a 10-second clarifying question — especially for anything that touches the demo path or judging story.

TEAM_EMAIL=ayotundeogunade13@gmail.com,michealsalam06@gmail.com,lafiajisamuel@gmail.com,Ibraheem.Islam.2016@gmail.com,support@calendue.ai,calendue.dev@gmail.com

"SM" = "StudyMax"


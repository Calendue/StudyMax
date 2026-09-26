# StudyMax

Your university hides things in plain sight. Specializations that go on your transcript, certificates and minors you are most of the way through, scholarships with deadlines you never hear about. They exist, they are just spread across dozens of pages nobody reads end to end.

StudyMax takes your transcript and shows you what you are close to, the single course that advances the most of it at once, and a term by term path to finish. Then it calls your phone about the award closing soonest, because nobody reopens a dashboard.

Live at [studymax-one.vercel.app](https://studymax-one.vercel.app/).

## Scope: Computer Science

**This is built for Computer Science at the University of Saskatchewan.** That is where the requirement data is complete, and it is the only program where every feature works end to end:

- 12 CS specializations, fully enumerated from the program pages
- 4 certificates and 1 minor that a CS student is usually partway through without knowing
- Prerequisite chains scraped from the catalogue for the ~240 courses the planner reasons about

Applied Mathematics, Physics and Applied Computing are mapped too and will produce a plan. Every other Arts and Science subject is pickable, but without requirement data those students only reach the scholarship side of the app. Adding a program is a data task, not an engineering one: write one file in `src/data/programs/`, register it in `index.ts`, and the matcher, planner and credential detector pick it up.

## Try it

1. Open the site and answer the onboarding questions: existing student, University of Saskatchewan, your degree, Computer Science, an optional minor, and any specializations you are aiming for. First-years skip straight to their plan.
2. Upload a DegreeWorks audit or unofficial transcript as a PDF. Claude reads every course in every subject and separates what you finished from what you are taking now.
3. No transcript handy? Use **Load a sample student**, or search the catalogue and tick off courses by hand.
4. Press **Reveal what my school hides**.

You will get: what you are closest to finishing, the highest overlap course you have not taken, a term by term plan including the prerequisites the specialization page never lists, certificates and minors you are partway through, awards ranked by deadline, and the call at the end.

## Run it locally

```bash
npm install
npm run dev
```

The site runs at `http://localhost:5173`. Everything except the four serverless routes works with no keys at all, including matching, planning and the sample student.

For the API routes (transcript reading, scholarship personalization, guidance, phone calls) you need `vercel dev` and two keys:

```bash
npm i -g vercel
vercel dev
```

| Variable | Used by | Required |
| --- | --- | --- |
| `ANTHROPIC_API_KEY` | transcript parsing, why this award fits you, guidance for unmapped schools | yes, for those routes |
| `BLAND_API_KEY` | the outbound phone call | yes, for the call |
| `BLAND_VOICE` | voice preset, defaults to `maya` | no |
| `BLAND_FROM_NUMBER` | pins caller ID to one owned Bland number instead of their shared pool | no |

Google/Apple sign-in on the web needs the Firebase project (`studymax-3a090`) with those two providers turned on and the site's domain allow-listed, and reads its config from four client-side `VITE_FIREBASE_*` variables, e.g. in a gitignored `.env.local`:

| Variable | Used by | Required |
| --- | --- | --- |
| `VITE_FIREBASE_API_KEY` | Google/Apple sign-in | yes, for sign-in |
| `VITE_FIREBASE_AUTH_DOMAIN` | Google/Apple sign-in | yes, for sign-in |
| `VITE_FIREBASE_PROJECT_ID` | Google/Apple sign-in | yes, for sign-in |
| `VITE_FIREBASE_APP_ID` | Google/Apple sign-in | yes, for sign-in |

Without them the web build has no sign-in: it skips the welcome screen and starts onboarding as a guest. The iOS and Android apps always offer Apple and Google sign-in natively, from the Firebase config files described in `CLAUDE.md`. Everything works without an account either way.

A missing key switches its features off rather than letting them fail. At startup the app asks `/api/features`, which reports only whether each key is set. Without `ANTHROPIC_API_KEY`, the transcript upload, the "why you" notes and the "Another university" path are hidden, and awards show their own descriptions. Without `BLAND_API_KEY`, the call button is hidden. Adding a key in Vercel turns its features back on for the site and the installed apps, with no rebuild. Under plain `npm run dev` there is no `/api`, so both are off.

## Checks

Every feature has a plain `assert` script, no test framework. Run all of them, then lint and build:

```bash
for f in scripts/check-*.ts; do node --experimental-strip-types "$f"; done && npm run lint && npm run build
```

These are worth reading before changing anything: `check-plan.ts` covers course selection and term sequencing, `check-course-codes.ts` fails the moment a program references a course the catalogue dropped, and `check-schools.ts` enforces that every award links to a page a signed out visitor can actually open.

## How it is put together

```
src/data/programs/    requirement data, one file per program
src/data/schools/     awards, deadlines and links per school
src/data/prereqs.ts   prerequisite chains, scraped, quoted verbatim
src/lib/match.ts      what you are close to, and course overlap
src/lib/plan.ts       course selection, prerequisite expansion, term packing
src/lib/credentials.ts  certificates and minors you are partway through
api/                  serverless routes: transcript, why-you, guidance, call, and features (which keys are set)
scripts/scrape-*.ts   catalogue scrapers that regenerate the data files
```

Matching and planning are deterministic. They read requirement data and produce the same answer every time, which is the part you would not want a model guessing at. Claude handles the parts that genuinely need reasoning.

## Known limits

- Course offerings by term are not published in a form we can read, so the plan sequences prerequisites correctly but cannot know whether a course actually runs in Fall or Winter. The app says so, right under the plan.
- Nine course codes in the program data no longer exist in the catalogue. They are pinned in `check-course-codes.ts` so a tenth one fails the build instead of slipping through.
- Requirements written in credit units are approximated as course counts where a group mixes credit weights. The affected files say which groups and why.
- The call is one way. It says its piece and hangs up. It cannot answer questions, and it deliberately does not try.

## Built with

React, TypeScript, Vite, deployed on Vercel. The Claude API for transcript reading and scholarship reasoning. Bland for the phone call.

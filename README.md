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

1. Open the site and choose University of Saskatchewan, then Computer Science.
2. Upload a DegreeWorks audit or unofficial transcript as a PDF. Claude reads every course in every subject and separates what you finished from what you are taking now.
3. No transcript handy? Use **Load sample student data (USask CS)** in the footer, or search the catalogue and tick off courses by hand.
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

Google/Apple sign-in (the onboarding wizard) needs a Firebase project with those two providers turned on, and reads its config from four client-side `VITE_FIREBASE_*` variables instead:

| Variable | Used by | Required |
| --- | --- | --- |
| `VITE_FIREBASE_API_KEY` | Google/Apple sign-in | yes, for sign-in |
| `VITE_FIREBASE_AUTH_DOMAIN` | Google/Apple sign-in | yes, for sign-in |
| `VITE_FIREBASE_PROJECT_ID` | Google/Apple sign-in | yes, for sign-in |
| `VITE_FIREBASE_APP_ID` | Google/Apple sign-in | yes, for sign-in |

Without them, the "Continue with Google/Apple" buttons show a clear "sign-in isn't set up yet" message rather than failing silently — onboarding itself, and the rest of the app, work fully without an account either way ("Continue without an account" / "Skip onboarding, just let me in").

Under plain `npm run dev` the upload button returns a clear message saying the reader is a serverless function, rather than failing silently.

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
api/                  four serverless routes: transcript, why-you, guidance, call
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

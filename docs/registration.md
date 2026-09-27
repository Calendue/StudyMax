# Registration with Max

Max plans your registration and fills it in for you in your own PAWS session; you press Submit.

From the Plan, Max takes the next planned term, picks one clash-free set of real USask sections for
it from the public class search, and shows them on the Register screen. In the iOS and Android apps
he can then type those CRNs into Banner's Enter CRNs panel, after the student has signed in on
USask's own page, and stop at Submit. On the web he hands the CRNs over to copy. A practice run
plays the same picks out on a simulated page.

This replaces `docs/mock-registration.md` (the simulated-only plan) and the old handoff. What they
got wrong is under [Corrections](#8-corrections-to-the-old-handoff).

## 1. The rules, and why

USask gives nobody an approved way to register for a student, so the student does every step that
needs their account and Max only does the typing on a page they already opened.

- **Accounts can't be shared.** The IT Use policy: "Accounts and authorization are not
  transferable", and students protect their account by keeping "their password secret" and giving
  others access only through delegated access permissions
  (https://policies.usask.ca/policies/operations-and-general-administration/information-technology-use.php).
  The Service Catalogue: "Accounts must not be shared."
  (https://servicecatalogue.usask.ca/it/accounts-and-access.php). A StudyMax that takes an NSID and
  password and signs in, even once, breaks both.
- **The only delegation can't register.** A PAWS Proxy Access proxy "cannot make changes to the data
  (e.g., register or drop classes, pay tuition)"
  (https://teamdynamix.usask.ca/TDClient/33/Portal/KB/ArticleDet?ID=1313).
- **The student carries the risk.** Breaching the Computer Use Policy, or "misuse or abuse of
  university services", is non-academic misconduct for the student
  (https://governance.usask.ca/student-conduct-appeals/non-academic-misconduct.php).
- **CAS treats a copy as phishing.** The sign-in page at https://cas.usask.ca/cas/login carries a
  script that, on any host not ending in `.usask.ca`, reports the page's URL to USask and sends the
  browser to phishnet.usask.ca. CAS sends `X-Frame-Options: DENY` and Banner sends
  `frame-ancestors 'self' https://*.usask.ca`, so neither can be framed from our origins anyway.
- **Submit costs money.** "Tuition and student fees are charged to students at the time of
  registration" (https://students.usask.ca/academics/registration/student-responsibility.php).
  Pressing Submit is the student's financial act.
- **No hammering.** The IT Use policy says resources are not to be "used in such a way as to deny or
  restrict access to others". No rule names bots, but repeated or automatic attempts are what that
  clause covers.
- **MFA is Microsoft Authenticator**, not Duo
  (https://teamdynamix.usask.ca/TDClient/33/Portal/KB/ArticleDet?ID=119).

What StudyMax never does:

- Ask for, see, store, send or log an NSID, password, MFA code or approval. There is no credential
  field anywhere, web or native, and the practice run has no sign-in step.
- Sign in from a server. `api/` only reads the public class search; `scripts/check-paws-agent.ts`
  fails if any `api/` file mentions CAS or Banner's registration paths.
- Keep cookies. The web view stores no site data, starts signed out and has its cookies cleared when
  it closes.
- Iframe, proxy, mirror or imitate CAS.
- Run any script on cas.usask.ca or a login or MFA host (login.microsoftonline.com and the like).
  Max's script runs only on `https://banner.usask.ca/StudentRegistrationSsb/ssb/classRegistration...`,
  after the student has signed in.
- Press Submit, real or simulated. The script never even looks Submit up; it outlines it with a CSS
  rule.
- Retry, loop or register by itself. One tap is one attempt; nothing registers when a seat opens.
- Claim USask approved or partnered on this.

## 2. The flow

### iOS and Android

1. **Plan.** "Register for Winter 2027 with Max" shows under the targets whenever the plan's next
   term has something to register (`RegisterEntry` in `src/screens/PlanTab.tsx`, also on the desktop
   Plan page).
2. **Register screen.** Max checks that term's sections live and lists his picks per course (lecture
   and its linked lab or tutorial, seats, CRN), what he couldn't place and why, and the courses
   already registered. If Banner lists the term as view-only, a notice says PAWS isn't taking
   registrations for it yet, and the PAWS button waits.
3. **Fill it in on PAWS** opens a confirm sheet: the exact sections and CRNs, "You sign in on
   USask's own page", "Use Microsoft Authenticator push or a code. Passkeys don't work here", "You
   review it and press Submit yourself", and that tuition is charged when you register.
4. **Open PAWS** opens an in-app web view on Banner's registration entry
   (`registerPostSignIn?mode=registration`), which sends the student to cas.usask.ca.
5. **The student signs in** on the real CAS page and approves with Microsoft Authenticator (a push
   or a code). Passkeys, Face ID and Touch ID don't work inside an embedded web view.
6. **The student picks the term** on Banner's term page and presses Continue. The app says "Choose
   Winter 2027 and press Continue."; the term page is never scripted.
7. **Max fills it in.** Once Banner's class registration page has finished loading, and only when
   the view got there by leaving Banner to sign in and coming back, the script runs once: it opens
   Enter CRNs, types each CRN at a readable pace (pressing Add Another CRN for more boxes), presses
   Add to Summary, relays Banner's own notices ("Banner says: ..."), outlines Submit
   in Cherry Rose and says everything's in the summary. If the page doesn't show the plan's term, it
   says to stop.
8. **The student reviews the summary and presses Submit.**
9. **Closing** the view, or leaving the Register screen, clears its cookies. Max can't see whether
   Submit was pressed, so he says so: after a filled summary, "If you pressed Submit there, PAWS has
   your schedule; if you didn't, nothing was registered.", otherwise "Nothing was submitted by
   Max."

If a step fails, Max stops with "Max stopped while ... Nothing was submitted.", lists the CRNs to
add by hand and offers Copy diagnostics (see [Tuning the selectors](#6-tuning-the-selectors)).

### Web

A page can't reach into another site, so there's no fill. The Register screen shows **Open PAWS
registration** (a new tab on the same entry URL), the CRNs numbered with Copy and Copy all, and the
three steps: sign in, pick the term and Continue, Enter CRNs then Add to Summary then Submit. On a
wide layout there's also an optional bookmarklet, "Fill it in for me": dragged to the bookmarks bar
and clicked on PAWS's Enter CRNs page, it runs the same script (without the diagnostics) and still
stops at Submit.

### Practice run

**Practice run** opens a simulated look-alike of Banner's Register for Classes page: the layout
only, a "Simulated · demo" tag, no crest or wordmark, no sign-in step, its own `--reg-*` palette, light
in dark mode. Max plays out his real picks (real CRNs, sections, times, seats): types each subject
and number, searches, adds each section, then stops with everything in the summary, as on PAWS.
The student presses the simulated Submit; rows then read Registered, or Errors for a full section.
Nothing is sent anywhere. A finished run is kept per student (uid or guest), term and exact CRN
list; Run it again starts over. Under reduced motion it goes straight to the filled summary and
still waits for the student's Submit.

With no connection and nothing cached, the sections are hash-based practice sections whose CRNs
aren't USask's: the screen says so, and Practice run is the only action.

### A term Banner hasn't published

When Banner hasn't published the next term yet, Max plans on the latest term it lists for the same
season (Fall 2026's timetable for Fall 2027) as a preview, and says so. Its sections, times and CRNs
will change, so its CRNs aren't shown and it's never filled into PAWS or handed over to copy. The
practice run still plays it, marked with the timetable it used.

## 3. How Max picks sections

The request comes from the model alone (`registrationRequest()` in `src/lib/registration.ts`): the
plan's first term, its named courses not already taken, and the courses already registered that
term (never registered again, and their times kept free).

- **Elective slots.** A slot whose requirement list has real courses gets up to 8 candidates: the
  group's preferred picks first, then what Banner ran that season (`src/data/offerings.ts`) before
  what the catalogue alone lists, then lower level, then courses that run in more seasons, then the
  page's order. Candidates must be eligible: prerequisites and credit rules met by what's completed
  or in progress (a course booked for the same term isn't passed yet), no antirequisite completed,
  in progress or booked. None is a course the plan already names. Free and senior electives get
  none.
- **Spring/Summer isn't offered.** Banner splits it into a Spring and a Summer term and which one
  isn't Max's guess, so a plan whose next term is Spring/Summer gets no Register button.
- **Main campus only**, from Banner's campus field (with an older API: no web `W`, regional `C` or
  online sections).
- **Open seats.** Status open and `openSeats() > 0`, which counts only unreserved seats when Banner
  publishes the reserved split.
- **Link groups.** Lecture `M<n>` goes with the `L<n>` labs and `T<n>` tutorials of the same group:
  one open main-campus section of each linked kind that fits. When a lecture's labs don't fit, the
  next lecture is tried before calling it a clash; a lecture whose labs run only off the main campus
  can't be had here.
- **Credits on lectures only** (Banner gives a linked lab the lecture's credit hours too); 3 when
  Banner doesn't say.
- **Booked courses block time with their first main-campus lecture.** Which section the student is
  in isn't known, so this is an assumption; the screen says PAWS flags a clash if they're in
  another.
- **Order.** Booked courses' times, then named courses in plan order, then each slot's first
  candidate that places. What can't be placed is listed as full (with a waitlist hint), a clash
  (naming the courses) or not offered, and contributes no sections.

Loading (`src/lib/registrationData.ts`), all through `/api/classes` on the public class search:

- Banner throttles bursts by answering empty, so at most **2 requests are in flight** and an empty
  answer gets **one second look** after 1.2 s.
- Each request gives up after **12 s**, which counts as a network failure.
- Each course's last good answer is **cached** on the device (`studymax:sections:<term>:<code>`);
  when the live answer fails the plan says "Seats as of ...". With nothing cached, the course gets
  the **offline** practice sections, and an offline plan never goes near PAWS.
- A slot looks up at most 6 candidates, two at a time, and stops at the first that places.
- The term is looked up first (`/api/classes?op=terms`): open, view-only, or not listed yet, when
  the latest listed term of the same season stands in as the preview. Unreadable, it's the plan's
  own term, open or not unknown.

## 4. The in-app browser

`@capgo/capacitor-inappbrowser` 8.20.0: on Capacitor 8 it's the ready-made plugin that gives a real
top-level web view with `executeScript`, navigation and load events, page-to-app messages and cookie
controls on both platforms. SFSafariViewController and Chrome Custom Tabs can't run scripts, and
`@capacitor/inappbrowser` can't inject.

`openPawsAgent()` in `src/lib/pawsAgent.ts` opens it with `url: REG_URL`, a `PAWS · Register for
<term>` title, `ToolBarType.COMPACT` in ink and Old Lace, a white background, `persistWebViewData:
false`, `clearCookiesOnOpen: true` and `isInspectable: import.meta.env.DEV`. Its `urlChangeEvent`,
`browserPageLoaded`, `messageFromWebview` and `closeEvent` listeners are added before the view
opens. `executeScript` is called in one place, through `agentSession()`, which injects at most once
and only into a finished load of the class registration page reached through sign-in. The page reports back with
`window.mobileApp.postMessage`; `fromPage()` keeps only known message types and trims their text.
Closing clears the view's cookies, closes it, then clears all cookies. Not used, and checked:
`preShowScript`, proxy handlers, `useSharedDataStore`, custom headers, console capture,
`getCookies`.

The plugin runs JavaScript of its own on every page it loads (its `window.mobileApp` bridge,
document-start scripts, resize and scroll nudges), which would include CAS and Microsoft's sign-in.
`patches/@capgo+capacitor-inappbrowser+8.20.0.patch`, applied by patch-package from `postinstall`,
keeps all of it to `https://banner.usask.ca`:

- **iOS:** the plugin's document-start user scripts are set aside (main frame only) and the view
  starts with none. The main frame's navigation decisions, the request and then the final response
  after redirects, put them back only for a banner.usask.ca document and remove them before any
  other commits. Everything else the plugin evaluates by itself, bridge re-injection included, is
  skipped unless the committed document is on banner.usask.ca.
- **Android:** the bridge and document-start scripts are registered for the banner.usask.ca origin
  only, and everything the plugin evaluates by itself (blank-target and bridge injection, resize,
  clearing inputs on close) is skipped unless the committed main-frame document is on
  banner.usask.ca. Its pre-show interface is added only when a pre-show script is set (StudyMax sets
  none).

What's left on other pages is the web views' native message objects: iOS's script message handlers
and Android's JavaScript interfaces (Android has no per-origin `addJavascriptInterface`). They are
bindings, not scripts: nothing of the plugin's runs because of them. The app's own `executeScript`
is gated by `agentSession()`. A plugin upgrade needs the patch regenerated (`npx patch-package
@capgo/capacitor-inappbrowser`); patch-package says so when it no longer applies.

## 5. Files

- `src/lib/registration.ts`: the request from the plan, and the section picker (pure).
- `src/lib/registrationData.ts`: fetching sections, throttling, cache and offline fallback.
- `src/lib/pawsAgentScript.ts`: URL guards, the injection session and the agent script (pure).
- `src/lib/pawsAgent.ts`: the native wiring of the in-app browser.
- `src/lib/mockRegistration.ts`: the practice run's script, its saved runs and the offline sections.
- `src/screens/RegisterScreen.tsx`: switches between Max's plan and the practice run.
- `src/screens/register/RegisterPlan.tsx`: the Register screen, confirm sheet and PAWS session.
- `src/screens/register/PracticeRun.tsx`: the simulated registration page.
- `src/screens/register/Bookmarklet.tsx`: the web's optional bookmarklet.
- `src/screens/register/useRegistration.ts`: the request and the loaded plan, shared with the Plan.
- `src/screens/register/sectionText.ts`: how a section, its times and a reading's age read.
- `src/screens/register.css`: the Register screen and the practice run's scoped palette.
- `src/screens/PlanTab.tsx` (`RegisterEntry`) and `src/pages/PlanPage.tsx`: the entry button.
- `api/_banner.ts`: `normalizeSection` now passes campus and link identifier.
- `patches/@capgo+capacitor-inappbrowser+8.20.0.patch`: keeps the plugin's scripts to Banner.
- `scripts/check-registration.ts`: the request, the picker on real Winter 2027 rows
  (`scripts/fixtures/registration/`) and the loader's fallbacks.
- `scripts/check-paws-agent.ts`: URL guards, the session, the script in a fake Banner page, the
  plugin options, and `api/` staying off sign-in.
- `scripts/check-mock-registration.ts`: the practice run's script and saved runs.

## 6. Tuning the selectors

The selectors live in the `SCRIPT` string in `src/lib/pawsAgentScript.ts`: Banner 9's usual ids
(`enterCRNs-tab`, `txt_crn<n>`, `addAnotherCRN`, `addCRNbutton`, and `saveButton` for the outline
only; `s2id_txt_term`, `txt_term`, `term-go` to spot the term chooser), each with a text fallback
("Enter CRNs", "Add Another CRN", "Add to Summary").

When a step fails:

- The error names the step and what didn't show up: "Max stopped while finding CRN box 2. CRN box 2
  didn't show up in 10 seconds. Nothing was submitted."
- A dump follows: one row per visible control inside the registration content (never the header,
  navigation or user menu), as tag, id, classes, name, type and label. A field's label is its
  placeholder or aria-label; a button's or link's text is kept only when it's one of Banner's control
  words (Enter CRNs, Add to Summary, Submit, Continue...), so no name or student number gets in.
  Never a value; password and hidden fields are skipped. Banner's notices are read from the same
  area.
- In the app, **Copy diagnostics** under Max's error copies the dump.
- On an Android debug build, `chrome://inspect` lists the in-app web view for its console and DOM.
- On iOS, Safari's Develop menu shows it only when `isInspectable` is on, which is
  `import.meta.env.DEV`: an app running off the Vite dev server, not an `npm run build` build.

After changing a selector, update the fake Banner page in section 4 of
`scripts/check-paws-agent.ts` to match and run it:

```
node --experimental-strip-types scripts/check-paws-agent.ts
```

## 7. What's unverified

- **The Banner 9 selectors on USask's signed-in page.** They come from Banner 9's standard page and
  public tools for it; nobody has seen USask's signed-in Enter CRNs panel.
- **Term selection.** Whether Continue always lands on the class registration page. If the term
  chooser shows on that page instead, Max stops and asks the student to choose the term, press
  Continue, then close PAWS and tap Fill it in on PAWS again (one attempt per tap).
- **Registration windows, time tickets and holds.** Max doesn't know when a student's time ticket
  opens or whether they have a hold. Banner's notices are relayed, but the flow hasn't met them.
- **MFA inside the embedded view.** Authenticator push and codes are expected to work; nobody has
  signed in through the app's web view.

## 8. Corrections to the old handoff

`~/Downloads/mock-registration-handoff.md` and `docs/mock-registration.md` (now deleted) said, or
assumed:

- **Duo.** USask's MFA is Microsoft Authenticator (push or code), with SMS or phone as backup.
- **That the sample showed the button.** It never did: its Winter 2027 held only electives beside
  the booked CMPT 340, 353 and 434, and the old chip needed a named course. The handoff's single
  CMPT 412 wasn't there. The button now shows when Max can fill an elective slot.
- **That the phone Summary was cards.** It was the desktop table, moved above the schedule.
- **Real-looking seats and credits.** "Section 01 is full" was hard-coded for the first course,
  every course was a fixed 3 credits, and the footer counted rows not yet added. Seats and credits
  now come from Banner, and the footer counts the lectures in the summary.
- **That reduced motion worked.** Run it again under reduced motion reset to the first step with no
  timers to move it, and hung. It now goes straight to the filled summary.
- **One saved run.** It was one storage key, so another student, another term or a changed list
  opened someone else's finished run. It's now scoped to student, term and CRNs.
- **Max pressing Submit.** In the old practice run Max pressed the simulated Submit. The student
  does now, as on PAWS.

# Plan: simulated class registration ("Max registers for you")

For: Sonnet 5, executing solo. Scope: one demo moment, small diff, no backend.

**Revision 2.** Registration is now its **own screen/page** opened from a Register button, not a
sheet, and it follows the layout of the university's registration page (reference screenshot:
"Register for Classes" in the student self-service portal). Keep what's already built:
`src/lib/mockRegistration.ts` and `scripts/check-mock-registration.ts` stay as they are. The UI in
`src/screens/RegistrationSheet.tsx` becomes `src/screens/RegisterScreen.tsx`. Its CSS moves out of
`src/App.css` into its own file.

## The demo beat

On the Plan, **Register with Max** opens the registration page. Max drives it like a person would:
a cursor moves, he types `CMPT` and `370` into the search fields, clicks Search, finds section 01
full, adds section 02 instead, and does the same for each course. Each course lands in the Summary
as *Pending*, then he clicks **Submit**. Every row flips to **Registered** and the week schedule
fills in with checkmarked blocks. Reload the app and it's still registered. **Reset demo** starts
it over.

Everything is fake and deterministic. No network, works offline and with the sample student.

## Hard rules

- **The look, not the brand.** Match the portal's layout, spacing, colours and controls closely
  (see Visual spec). Don't use the university crest or wordmark, and don't show a real student's
  name. The header's logo slot reads `Registration` with a `Simulated · demo` tag. The name
  comes from the model (sample student or signed-in first name), falling back to "Student". No
  login step, no credential fields.
- **Palette exception, scoped.** This page imitates another system, so it gets its own colours:
  `--reg-*` variables declared on `.reg` in `src/screens/register.css`, and nowhere else. The
  rest of the app is untouched. The page stays light in dark mode, like the launch splash. The
  only StudyMax-branded element on it is Max's narration bubble (tokens, Cherry Rose), so it's
  clear who is doing the driving.
- Don't touch matching or planning. Read `m.plan[0]`, skip electives with `isElective`, and
  take titles from `catalogueTitle`.

## Visual spec (from the screenshot)

Top to bottom, desktop:

1. **Top bar**: full-width dark green (`--reg-brand: #1b5e3b`), 56px tall. On the left, an apps-grid
   icon and the logo slot (see Hard rules). On the right, a darker green block
   (`--reg-brand-dark: #154a2e`) with a gear icon, an avatar circle and the student's name in
   white.
2. **Breadcrumb**: `Student • Registration • Select a Term • Register for Classes`. The first
   three are underlined blue links (`--reg-link: #1a5fb4`) and the last is plain blue, separated
   by grey dots. Page background `#f4f4f4`. Leftmost is a `‹ Back to plan` link that really
   navigates.
3. **H1**: "Register for Classes", ~22px, dark grey, on white, with a hairline under it.
4. **Tab strip**: `Find Classes` (active: blue fill `--reg-tab: #1a6fcf`, white text) and then
   `Enter CRNs`, `Plans`, `Schedule and Options` (grey text, inactive, not clickable).
5. **Search panel**: a white box with a grey border inside a light-grey frame. Header text "Enter Your
   Search Criteria" (bold) with an info icon, and "Term: {termLabel}" (bold, small). Label-right
   form rows: Subject (wide input), Course Number (e.g. 110) (short input), Campus (wide input).
   Then a grey rounded `Search` button, an underlined `Clear` link and a `▸ Advanced Search` link.
   While Max searches, the panel swaps to a **search results** table: CRN, Section, Type, Days,
   Time, Seats, and an `Add` button per row. The full section shows `FULL` in red and its Add is
   disabled.
6. **A splitter bar** (thin grey with the three little ▲ • ▼ tabs, decorative), then two panes side
   by side:
   - **Left: schedule.** Tabs `Schedule` (active, blue with a calendar icon) and `Schedule
     Details`. A caption bar reads "Class Schedule for {termLabel}". The grid has Sunday to
     Saturday columns and hour rows from 8am to 6pm with light rules, and scrolls on its own. Each
     block shows a check icon and the underlined course title, and is coloured by course from
     a fixed set: green `#7cc47f`, orange `#f0a24a`, pink `#e56a8f`, blue `#6aa8e0`, purple
     `#a98ad8`. Pending is a dashed outline, registered is filled with the check.
   - **Right: Summary.** A header bar with a table icon and "Summary". The table columns are CRN,
     Details (`CMPT 370 02`), Title (underlined link style), Schedule Type, Credits, Status and
     Action. Status is a pill: `Pending` grey, `Registered` light-green pill
     (`#dff3d8` bg, `#2e6b1f` italic text), `Errors` red. The Action column is a `None ▾` select
     (decorative). Footer: `Total Credits | Registered: N | Credits: N | CEU: 0 | Min: 0 | Max: 18`.
7. **Bottom bar**: a `Panels ▾` button on the left. On the right, a disabled checkbox "Switch class
   sections (prior to registration deadline)" and the **Submit** button, disabled grey until
   something is Pending and then blue.

**Agent layer** (on top of the page):
- **Cursor**: an absolutely positioned pointer that glides (~400ms, ease-out) to each target
  element's bounding box before its action, with a small ripple on "click". Typing puts
  characters into the real input values ~60ms apart.
- **Max bubble**: a floating card at the bottom right (on a phone, docked at the bottom above the
  bottom bar). It has the Max avatar, the current step line and a spinner, the finished steps
  collapsed above it, and a **Skip** link that jumps to the final state. When it's done:
  "Registered: N credit units for {termLabel}", with **Back to plan** and **Reset demo**.
- Script (from `pickSchedule`'s log): open the term, then for each course type subject, type
  number, Search, (for the first course, a note that 01 is full and he's taking 02), Add. Then
  Submit and flip every row to Registered, one ~150ms apart, with a `haptic` for each.
- Reduced motion: no cursor or typing. It renders the final state straight away with the bubble's
  summary.

**Phone (<768px):** same order, compressed. The top bar is 48px with the name hidden behind the avatar.
The breadcrumb is only `‹ Back to plan`. The tab strip scrolls sideways. Search fields stack
full-width with their labels above. The splitter is dropped and Summary comes before Schedule:
each summary row is a card (Details + Title, CRN · Type · Credits, status pill). The schedule
shows only Mon–Fri and scrolls sideways. Submit sits in the bottom bar at full width.

## Files

1. `src/lib/mockRegistration.ts`: keep. If the cursor script needs per-step targets, extend the log
   entries to `{ text, action: 'type-subject' | 'type-number' | 'search' | 'add' | 'submit', rowIndex? }`
   and update the check script to match.
2. `scripts/check-mock-registration.ts`: keep it passing.
3. `src/screens/RegisterScreen.tsx`: renamed from RegistrationSheet.tsx. No `Sheet`. One
   component serves as both the phone screen and the desktop page. The state machine is driven by
   one `useEffect` timer chain over the script. It saves to storage when Submit finishes, and on
   open a saved state for the same term renders final.
4. `src/screens/register.css`: all `.reg*` styles, imported by RegisterScreen. Remove the reg
   styles Sonnet added to `src/App.css`.
5. **Routing**: a new screen `'register'`, done exactly the way `'call'` is:
   - `src/App.tsx`: add `'register'` to `Screen`, add a `case 'register'` in the screen switch
     rendering `RegisterScreen`, and add it to the `inShell` check.
   - `src/shell/AppShell.tsx`: add `register: RegisterScreen` to `PAGES`, and extend the `page`
     pick to `m.screen === 'register'`.
   - `src/shell/Header.tsx`: title "Class registration" when `m.screen === 'register'`.
     (Optional: hide the shell header on this page, since it has its own top bar. Decide by eye.)
   - Android back and the page's `‹ Back to plan` both return to results on the Plan tab
     (`m.navigate('plan')`).
   - **Not** in `DESTINATIONS`. It isn't a nav tab; you only reach it from the button.
6. **Entry points**: `src/screens/PlanTab.tsx` (phone) and `src/pages/PlanPage.tsx` (desktop side
   panel) get a primary `Button` reading "Register with Max" (or "View registration" once saved),
   with `onClick={() => m.go('register')}`. Hide it when the plan has no non-elective courses in
   its first term.

## Out of scope

Real Banner sections (`api/classes.ts`), DB sync, working Enter CRNs/Plans/Schedule tabs, drop/swap,
editing the picks.

## Done when

- `npx tsx scripts/check-mock-registration.ts`, `npm run lint` and `npm run build` pass.
- Walk through it: load the sample student, open Plan, click Register with Max. The cursor types,
  searches, falls back from the full section, adds, submits, and everything turns Registered. A
  reload shows the saved state, Reset reruns it, and Back returns to Plan. Check at 375px and at
  1280px, and in dark mode (the page stays light).
- Place it side by side with the reference screenshot at 1280px: same regions in the same order.
- The sample-student path and the rest of the Plan tab are unchanged.
- One commit: `feat: simulated class registration page from the plan`.

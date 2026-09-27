# 06 — Vapi Voice Integration and "Ping Max"

Wires everything from `01`–`05` into an actual phone call, and the app screen that starts one.

## Identity simplification for this weekend

There is no real per-visitor identity resolution (→ `00-overview.md` persistence gap) — whoever opens
the app, signed in or as a guest, is demoing against **the one seeded student** from `01`. Don't build
"resolve the current Firebase user to a `UserInfo` row" — every new endpoint below (`verify phone`,
`grant consent`, `place call`) operates on a single known `userId`, looked up server-side once by the
seed script's fixed `authUid` (e.g. `"baymax-demo-student"`), never passed from the client. This is
actually consistent with I6's spirit (identity never comes from a client-supplied id) even though the
reason here is "there's only one possible identity this weekend," not real session resolution.

## Phone verification — the linking gotcha

Real Firebase Phone Auth was the resolved choice (→ spec `03`/`11`), not a stub. **Use
`linkWithPhoneNumber`** (web: `firebase/auth`; native: `@capacitor-firebase/authentication`'s phone
methods) against whatever Firebase session is currently active, **not** `signInWithPhoneNumber`. Phone
sign-in creates/switches to a *different* Firebase user session — using it here would silently sign the
demo device out of whatever account it was using. Linking attaches the phone credential to the existing
session without disturbing it. On success, write `MaxSettings.phoneE164` + `phoneVerifiedAt` for the one
seeded `userId` (see above — not derived from the linked Firebase uid, since that's the presenter's own
account, not the demo student's).

**Edge case**: `linkWithPhoneNumber` requires an already-signed-in Firebase `user` object — it has
nothing to link to for a guest session (per `src/auth.ts`, the web app starts as a guest whenever
Firebase isn't configured, and a guest is also possible even when it is). Check for a signed-in user
first; if there isn't one, fall back to plain `signInWithPhoneNumber` instead (no session to preserve
in that case, so the "don't disrupt an existing session" concern doesn't apply). Test the demo device's
actual state before the day of the demo rather than assuming it'll be signed in.

Practical note: `RecaptchaVerifier` (web) needs a real container element and only works on
non-`localhost` origins in some configurations — test this against the actual Vercel deployment early,
not just `vite dev`, so this isn't discovered the night before the demo.

## Consent

A simple checkbox + timestamp is enough (→ spec `11`, mechanics without counsel review): store
`callConsentGranted: true`, `callConsentVersion` (any string identifying the copy shown, e.g.
`"v1-2026-09-26"`), `callConsentAt` on the same `MaxSettings` row. Show the consent text once, before
the first "Ping Max" tap; a revoke toggle in `AccountSheet.tsx` sets `callConsentGranted: false`, which
must immediately block the next call attempt (spec `11` acceptance criterion).

## Outbound call flow

New route `api/max/call.ts` (POST), following spec `09`'s flow:

1. Look up the demo `userId` (see above) and its `MaxSettings`.
2. Check: `phoneVerifiedAt` not null, `callConsentGranted`, no existing `MaxCall` with status in
   `queued/ringing/in_progress` for this user (the raw-SQL partial unique index from `02` enforces this
   at the DB level too — catch the constraint violation and return a friendly "already on a call"
   error).
3. Build `variableValues` from `get_student_overview`'s shape (→ `05`) — call that same logic directly
   here rather than round-tripping through the tool webhook.
4. Insert a `MaxCall` row (`status: "queued"`).
5. Call Vapi's create-call API with `assistantId`, `phoneNumberId`, `customer.number`,
   `assistantOverrides.variableValues`, `metadata: { callRowId }`.
6. Store the returned `vapiCallId` on the `MaxCall` row.

A second route, `api/max/webhook.ts`, handles Vapi's status/end-of-call events (→ spec `09`'s event
table) — update `MaxCall.status`; on end-of-call, no summary generation is needed this weekend
(`ConversationSummary` is deferred, → `07` — the demo is a single call, so cross-call memory doesn't
matter yet).

## Assistant configuration

Apply spec `09`'s config table. Two things worth calling out for a fresh implementer:

- **Set the server URL secret** (currently unset per spec `09`) before testing with a real phone
  number — `05`'s tool gateway checks it.
- **`model.messages`**: use spec `08`'s system prompt template, but only paste in the S1/S2/S5/S7 skill
  summaries — leave S3/S4/S6/S8/S9 out of the prompt entirely rather than including-but-unused; a
  shorter prompt is also a latency win (→ spec `09` turn-latency budgets).

## The "Ping Max" screen

Add a new entry point rather than repurposing `CallScreen.tsx` — that screen is the Bland one-way call
and stays untouched as the fallback (→ spec README). A new `src/screens/PingMaxScreen.tsx`:

- Phone verification step (link + OTP) if `MaxSettings.phoneVerifiedAt` is null.
- Consent step if not yet granted.
- A "Ping Max" button that calls `POST /api/max/call`, then shows a calling/connected state (reuse the
  pulse UI pattern from `CallScreen.tsx`'s `CallState` component rather than inventing a new one).

**Feature-flag it.** Add `max: boolean` to `api/features.ts` (gate on whatever env vars Vapi needs —
e.g. `VAPI_API_KEY` and `VAPI_ASSISTANT_ID` both set) and `src/features.ts`, following the exact
pattern `ai`/`call` already use. Only show "Ping Max" in the UI when `features.max` is true, so a
deployment without Vapi keys configured shows nothing broken — same rule the existing Bland feature
already follows. Keep `features.call` (the existing Bland flag) independent and untouched: the fallback
must keep working even if `max` is on but broken.

## Definition of done

- [ ] Tapping "Ping Max" with no verified phone shows the verification step, not an error.
- [ ] `linkWithPhoneNumber` succeeds against a real phone number without signing the device out of its
      current session.
- [ ] Revoking consent in `AccountSheet.tsx` blocks the next "Ping Max" tap immediately.
- [ ] A real call connects, Max speaks the first-call opening line, and reading `get_student_overview`'s
      injected variables back matches the seeded student's actual data.
- [ ] With `VAPI_API_KEY`/`VAPI_ASSISTANT_ID` unset, "Ping Max" doesn't appear and nothing else breaks.
- [ ] The existing "Call me now" (Bland) screen and its feature flag are unaffected by any of the above.

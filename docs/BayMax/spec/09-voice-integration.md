# 09 — Voice Integration (Vapi)

> Vapi field and event names below reflect the API as understood at time of writing. Verify each against current Vapi docs during implementation; treat names as intent, not contract.

**RESOLVED (2026-09-26)**: the Bland → Vapi and gpt-5-mini → GPT-4.1 switch below is decided, not open — the team has aligned on it. Max's call replaces the existing one-way Bland scholarship-deadline call as the product's calling feature going forward (Max carries no scholarship content, → 08). Because this is new integration attempted under a tight deadline, `api/call-me.ts` (the Bland call) stays in the codebase, feature-flagged, as a fallback for the actual demo if Vapi isn't proven live in time — a demo safety net, not a change of product direction (→ README).

## Outbound call flow ("Ping Max")

```
App: tap Ping Max
  ↓
POST /calls  (auth: student session)
  ├─ checks: phoneVerifiedAt, callConsent.granted, no active call,
  │          rate limit, quiet hours in student timezone
  ├─ build context (→ 08 variables) from DB
  ├─ create Call row (status: queued)
  └─ Vapi: create call
       assistantId: Max
       phoneNumberId: StudyMax outbound number
       customer.number: student.phoneE164
       assistantOverrides:
         variableValues: { name, programLine, ..., isFirstCall }
         firstMessage: (first-call or returning template)
       metadata: { callRowId }   // never the only identity check (I6)
  ↓
Store vapiCallId → Call row
  ↓
App shows "Max is calling…" and subscribes to the session UI channel
```

Server events from Vapi arrive at the assistant's server URL:

| Event | Handler |
|---|---|
| tool calls | tool gateway (→ 07): resolve `vapiCallId → Call → studentId`, authorize, execute |
| status updates | update `Call.status`; push to app |
| end-of-call report | finalize `Call`, trigger summary job (→ 10), expire voice-only drafts to app drafts |
| hang / transcript events | optional; logging only |

Webhook authenticity: the current config shows `isServerUrlSecretSet: false`. **Set a server URL secret (or equivalent auth) before any real call.** Reject events that fail verification.

## Assistant configuration changes

Starting from the current config:

| Setting | Current | Change to |
|---|---|---|
| model.messages (system) | blank template | template from `08`, with `{{variables}}` |
| model.model | gpt-4.1 | keep for v1; benchmark a smaller model for latency once evals exist (→ 12) |
| model.temperature | default | low (≈ 0.3) — consistency over creativity |
| model.tools | none | the 9 agent tools (→ 07), each with server URL and `request-start` / delayed / failed messages |
| firstMessage | "Hello." | override per call; e.g. "Hi {{name}}, this is Max from StudyMax." |
| firstMessageInterruptionsEnabled | false | keep false for the first line (identifies caller before the student talks over it) |
| voicemailMessage | "Please call back when you're available." | "Hi, this is Max from StudyMax returning your request. Open the app whenever you'd like to talk." — no name, no academic info (→ 11). Tapping Ping Max is how they "call back"; there's no inbound line in v1. |
| voicemail detection | not configured | enable; on detection, play voicemail and end; `Call.status = voicemail` |
| endCallMessage | "Goodbye." | "Talk soon, {{name}}. Everything we changed is in the app." |
| recording / disclosure | — | if recording is on, disclose in the first message or right after (→ 11) |
| max duration | default | 20 minutes; at 18, Max wraps up |
| silence timeout | default | ~30 s, then "Still there?" then end |
| serverUrl secret | not set | set |
| transcriber | soniox stt-rt-v5, en | keep; add keyword/vocabulary boosting for subject codes and common course names if the provider supports it |
| analysisPlan.summaryPlan | disabled | keep disabled; we generate our own summary with structured events (→ 10) |

### Course codes and STT

STT will mangle codes ("see em pee tee two fifteen," "CMP 215"). Handling, in order:

1. Transcriber vocabulary boosting (if available).
2. Tools accept raw strings; backend normalizes and fuzzy-matches against the catalog (→ 07 tool 4).
3. Fuzzy/ambiguous → Max confirms with the student before any op uses the code.

## Latency

Budget for one conversational turn with a tool:

| Segment | Target |
|---|---|
| End-of-speech detection | provider default |
| LLM to tool call | ≤ 700 ms |
| Tool execution | per `07` table |
| LLM to first spoken token after tool | ≤ 700 ms |

Mitigations: tool `request-start` message ("Let me check that") for any tool with p95 > 500 ms; pre-injected context so most calls need zero tools; `run_scenario` does the whole pipeline in one call.

## UI sync during a call

The original design says "the UI updates while Max explains." That assumes the student has the app open while holding a phone call, which on a single phone often means speaker mode or they're not looking.

- Realtime channel per student session (WebSocket/SSE). Events: `call.status`, `scenario.presented`, `scenario.committed`, `scenario.discarded`, `confirmation.required`.
- Server tracks whether any client is subscribed → `uiVisible` in `run_scenario` responses so Max knows whether "it's on your screen" is true.
- If not visible: push notification after the call ends with a deep link to any presented/committed scenario.
- `confirmation.required` (program ops): push notification immediately, deep link to a confirm sheet showing the diff.

## Failure handling

| Failure | Handling |
|---|---|
| No answer / busy | `Call.status = no_answer`; app: "Max couldn't reach you. Try again?" No auto-retry. |
| Voicemail | as above |
| Drop mid-call | End-of-call report still processes. Presented scenarios stay `presented` → app shows "Unfinished plan change." Commit never inferred. |
| Tool timeout | Tool returns `{ ok: false, code: "TIMEOUT", speakable }`; Max offers to continue or finish in the app. |
| Duplicate tool-call delivery | Tool gateway dedupes by tool-call ID; `commit_scenario` also idempotent on `(scenarioId, presentedHash)` (→ 06). |
| Vapi outage | Ping Max shows unavailable; app features unaffected. |

## Rate limits and hours

- ≤ 1 active call per student; ≤ 5 initiated calls per student per day (cost + abuse).
- Quiet hours: no calls before 08:00 or after 22:00 in the student's timezone, even if they tap (show "Max is off until 8 AM").
- Global concurrency cap configurable (cost control).

## Inbound (v2, not built)

If added: caller ID alone is not authentication (spoofable). Require an in-app-generated one-time code or call-back verification before exposing any student data.

## Acceptance criteria

- p50 time from tap to phone ringing < 5 s.
- p95 turn latency without tool < 1.5 s; with `run_scenario` < 3 s.
- Server URL secret enforced; unsigned events rejected (test).
- Voicemail contains no student name or academic data (test on configured string).

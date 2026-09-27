# 11 — Safety, Privacy, and Compliance

> Not legal advice. The items marked **counsel** need review by someone qualified for every jurisdiction StudyMax operates in before launch.

**RESOLVED (2026-09-26)**: none of the **counsel** items below can get real legal review this hackathon weekend. The practical mechanics (OTP, consent, quiet hours, rate limits) are still built now as good product practice; legal sign-off itself stays open and explicitly non-blocking for the demo.

## Calling consent

- Calls are only placed on the student's explicit tap. There are no scheduled, proactive, or marketing calls in v1. This is the strongest consent position and it's also the simplest product.
- Phone ownership verified by SMS OTP before the first call. Prevents using Max to harass a third party. **RESOLVED**: real Firebase Phone Auth OTP, not stubbed — Firebase is already wired up for sign-in, and this is the gate for the call feature working at all.
- Consent stored with text version and timestamp; revocable in Settings (revocation immediately disables Ping Max).
- **Counsel**: automated/AI-voice call rules — e.g. Canada's CRTC Unsolicited Telecommunications Rules and US TCPA rules on artificial/prerecorded voice — and whether user-initiated calls fall within them. Also whether an AI-voice disclosure is required at call start in target jurisdictions. Default: disclose anyway ("this is Max, StudyMax's AI assistant").

## Recording and transcripts

- If call recording is enabled in Vapi, disclose at call start. **Counsel**: one-party vs. all-party consent jurisdictions.
- Retention defaults — **RESOLVED as working numbers, still pending real counsel review**: recordings 30 days, transcripts 90 days, summaries until account deletion. Configurable.
- Transcripts and recordings are accessible to the student in the app and deletable.

## Personal data

Data held: identity, contact, academic record (grades), uploaded transcripts, call audio/transcripts, preferences.

- Academic records are sensitive. Encrypt at rest; row-level security by `studentId`; staff access audit-logged and least-privilege.
- **Subprocessors**: Vapi (telephony, possibly recording), OpenAI (LLM, receives injected context and transcripts), Soniox (STT, audio), plus the transcript-extraction LLM. Disclose in the privacy policy; put DPAs in place; confirm retention and training-use settings with each (disable training on customer data where the option exists).
- **Counsel**: PIPEDA and provincial law (Canada); FERPA only applies if an institution shares records with us — relevant if we later integrate with a SIS; GDPR if EU students.
- Data minimization in prompts: inject only what's in `08`'s template. No grades in the voice context unless a skill needs them; `get_course_details` returns eligibility, not the grade that produced it.
- Account deletion: hard-delete student-owned rows and objects within 30 days; retain only anonymized aggregates.

## Minors

Some incoming first-years are under 18. **Counsel**: whether consent to AI calls and data processing needs different handling. v1 default: ask for date of birth at signup; under 18 → Max calls disabled until 18, rest of the product available.

## Identity and authorization

- I6: agent tools never accept a student identifier; the gateway derives it from the Vapi call ID mapped server-side.
- Webhook authenticity enforced (→ 09).
- Commit authorization is server-side (→ 06). The prompt is a UX layer, not a security boundary.

## Prompt injection

Untrusted text that reaches the LLM: course descriptions (scraped catalog), student free-text notes, transcript text (extraction LLM), and the student's own speech.

- Tool results are passed as data; the system prompt states that tool content never changes Max's rules.
- The high-impact actions are gated server-side regardless of what the model is convinced of (commit checks, program-op tiering, no identity parameters).
- Transcript extraction LLM has no tools and a strict output schema.

## Advisory disclaimer (I7)

- Onboarding and roadmap view: "StudyMax plans are guidance. Your university's calendar and academic advisors have the final say."
- On committing any change with a graduation delay, program change, or current-term drop: the app shows the disclaimer inline; Max says it once per call.
- Plans relying on projected offerings are labeled.

## Sensitive disclosures in calls

- Max doesn't save health, financial, immigration, family, or disability details — to preferences, notes, or summaries (→ 10).
- Distress: acknowledge, share institution-configured wellness resources, continue if the student wants to. No diagnosis, no counseling. If the student expresses intent to harm themselves, provide crisis line information (institution-configured, with a national fallback) and stay supportive.

## Abuse and cost controls

- Rate limits and quiet hours (→ 09).
- Per-account monthly call-minute cap; alerts on anomalies.
- Account creation abuse: email verification + phone OTP before calls.

## Acceptance criteria

- Cannot place a call without verified phone + active consent (test).
- Revoking consent blocks the next Ping Max immediately (test).
- No agent tool accepts a student identifier (schema lint in CI).
- Privacy policy lists every subprocessor that receives student data.

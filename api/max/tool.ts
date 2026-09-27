// The webhook Vapi calls mid-call when Max invokes a tool (docs/BayMax/spec/07-tool-surface.md,
// docs/BayMax/implementation/05-agent-tool-gateway.md). This is the I6/I2 enforcement point: no tool
// ever accepts a student identifier as an argument — identity comes only from the Vapi call id,
// resolved server-side against MaxCall.
//
// Vapi's tool-calls webhook envelope and expected response shape are per current public docs at
// implementation time (spec 09's own caveat applies: verify against the real payload the first time
// this is wired to a live assistant, and adjust extractToolCalls()/the response shape if it differs).
import { Prisma } from '@prisma/client'
import { db, hasDatabase } from '../_db.js'
import {
  adapterInput,
  checkDecline,
  commitScenario,
  discardScenario,
  normalizeCourseCode,
  droppedAt,
  loadCurrentSnapshot,
  presentScenario,
  runScenario,
  snapshotFromCall,
  type CallScope,
} from './_scenarios.js'
import { publish, uiVisible } from './_live.js'
import { DEMO_AUTH_UID } from './_demoUser.js'
import type { AppAction, CallPlanInputs } from '../../src/lib/max/live.js'
import type { ScenarioOp } from '../../src/lib/max/types.js'
import { maxSkills } from '../../src/lib/max/skills.generated.js'
import { planOptions, type OptionTopic } from '../../src/lib/max/options.js'
import { programName, regenerate, speakableCourse, specializationName, underWayByTerm } from '../../src/lib/max/planningAdapter.js'
import { computeMatches } from '../../src/lib/match.js'
import { programs } from '../../src/data/programs/index.js'
import { currentTermOf } from '../../src/lib/plan.js'

interface VercelRequest {
  method?: string
  headers?: Record<string, string | string[] | undefined>
  body?: unknown
}

interface VercelResponse {
  status: (code: number) => VercelResponse
  json: (body: unknown) => void
}

interface RawToolCall {
  id: string
  name: string
  arguments: Record<string, unknown>
}

/** Vapi has used a couple of shapes for this over time; accept the common ones. */
function extractToolCalls(body: unknown): { vapiCallId: string | null; calls: RawToolCall[] } {
  const message = (body as { message?: Record<string, unknown> } | null)?.message ?? {}
  const call = message.call as { id?: string } | undefined
  const vapiCallId = call?.id ?? null

  const list = (message.toolCallList ?? message.toolCalls ?? []) as Array<{
    id?: string
    toolCallId?: string
    name?: string
    function?: { name?: string; arguments?: unknown }
    arguments?: unknown
  }>

  const calls: RawToolCall[] = list.map((raw) => {
    const args = raw.function?.arguments ?? raw.arguments ?? {}
    return {
      id: raw.id ?? raw.toolCallId ?? '',
      name: raw.function?.name ?? raw.name ?? '',
      arguments: (typeof args === 'string' ? safeParseJson(args) : args) as Record<string, unknown>,
    }
  })

  return { vapiCallId, calls }
}

function safeParseJson(text: string): unknown {
  try {
    return JSON.parse(text)
  } catch {
    return {}
  }
}

function getHeader(req: VercelRequest, name: string): string | null {
  const value = req.headers?.[name]
  return (Array.isArray(value) ? value[0] : value) ?? null
}

/** Fails closed: no configured secret means nothing runs, not "anything goes" (spec 09/11). */
function verifiedByServerSecret(req: VercelRequest): boolean {
  const configured = process.env.VAPI_SERVER_SECRET
  if (!configured) return false
  return getHeader(req, 'x-vapi-secret') === configured
}

interface ResolvedCall {
  callId: bigint
  userId: bigint
  /** The live Plan-tab channel for this call (null: placed by an app without live support). */
  liveToken: string | null
  /** The app's plan inputs at call time, advanced on each save — Max plans exactly what's on screen. */
  planInputs: CallPlanInputs | null
  uiSeenAt: Date | null
  /** The shared demo student: nothing personal may be written to it (it reaches the next guest). */
  isGuest: boolean
}

async function resolveCall(vapiCallId: string | null): Promise<ResolvedCall | null> {
  if (!vapiCallId) return null
  const call = await db().maxCall.findUnique({ where: { vapiCallId }, include: { user: { select: { authUid: true } } } })
  if (!call || call.status === 'ended' || call.status === 'failed') return null
  return {
    callId: call.callId,
    userId: call.userId,
    liveToken: call.liveToken,
    planInputs: (call.planInputs as CallPlanInputs | null) ?? null,
    uiSeenAt: call.uiSeenAt,
    isGuest: call.user.authUid === DEMO_AUTH_UID,
  }
}

const scopeOf = (call: ResolvedCall): CallScope => ({ callId: call.callId, planInputs: call.planInputs, isGuest: call.isGuest })

type ToolResponse = Record<string, unknown>

// Which skill each tool maps to (docs/BayMax/implementation/08-skills-progressive-disclosure.md) —
// for readable logs only; the model doesn't report which skill it's following, so this is inferred
// from the tool name, not literal. load_skill's own skill is read from its arguments instead (below).
const SKILL_BY_TOOL: Record<string, string> = {
  get_student_overview: 'summarize_roadmap',
  run_scenario: 'what_if/manage_roadmap',
  discard_scenario: 'what_if/manage_roadmap',
  commit_scenario: 'manage_roadmap',
  update_name: 'correct_name',
  get_plan_options: 'recommend_plan',
  app_action: 'manage_roadmap',
}

/** One short, tool-specific fact worth seeing in a log line — never the full payload. */
function digest(name: string, result: ToolResponse): string {
  if (result.ok === false) return String(result.code ?? '')
  switch (name) {
    case 'run_scenario': {
      const headline = Array.isArray(result.headline) ? (result.headline as string[]) : []
      return headline[0] ? `"${headline[0]}"` : ''
    }
    case 'get_student_overview': {
      const roadmap = result.roadmap as { projectedGraduation?: string } | undefined
      return roadmap?.projectedGraduation ? `grad ${roadmap.projectedGraduation}` : ''
    }
    case 'commit_scenario':
      return result.versionId ? `v${result.versionId}` : ''
    case 'update_name':
    case 'load_skill':
      return typeof result.name === 'string' ? `"${result.name}"` : ''
    default:
      return ''
  }
}

/** What a call-scoped overview says: the plan on the student's screen, from the call's own inputs. */
async function overviewFromCall(call: ResolvedCall, p: CallPlanInputs): Promise<ToolResponse> {
  const s = snapshotFromCall(p)
  const terms = regenerate(adapterInput(s)).terms
  const program = programs.find((x) => x.id === p.programId)
  const degree = program?.degrees?.find((d) => d.variant === p.degreeVariant) ?? program?.degree
  const [activeScenario, saved] = await Promise.all([
    db().scenario.findFirst({
      where: { userId: call.userId, callId: call.callId, status: { in: ['computed', 'presented'] } },
      orderBy: { updatedAt: 'desc' },
    }),
    db().scenario.count({ where: { callId: call.callId, status: 'committed' } }),
  ])
  const currentTerm = currentTermOf(s.today)
  const own = new Set(program?.specializations.map((x) => x.id) ?? [])
  return {
    program: {
      major: programName(p.programId),
      minor: p.minorId ? programName(p.minorId) : null,
      specializations: p.targetIds.filter((id) => own.has(id)).map((id) => specializationName(p.programId, id)),
    },
    currentTerm: `${currentTerm.season} ${currentTerm.year}`,
    currentCourses: s.enrolled,
    // Term by term: "what am I taking in Fall" is answered from its own term, never the whole year's list.
    currentCoursesByTerm: underWayByTerm(adapterInput(s)),
    // Already passed: never "add" one of these; "have I done X" is answered from here.
    completedCourses: [...p.completed].sort(),
    ...(s.droppedCourses.length > 0 ? { droppedInSavedPlan: s.droppedCourses } : {}),
    roadmap: {
      projectedGraduation: terms[terms.length - 1]?.label ?? null,
      nextTerms: terms.slice(0, 3).map((t) => ({ term: t.label, courses: t.courses.map((c) => speakableCourse(c.code)) })),
      // Every term to graduation, so "what's in Winter 2028" is read from here, never guessed.
      allTerms: Object.fromEntries(terms.map((t) => [t.label, t.courses.map((c) => speakableCourse(c.code))])),
    },
    preferences: { coursesPerTerm: s.coursesPerTerm, springSummer: s.springSummer, summerCoursesPerTerm: s.summerPerTerm },
    // What Max may switch to, with how much each has left — for get_plan_options and a spoken name.
    availableSpecializations: computeMatches(program?.specializations ?? [], new Set(s.completed), degree)
      .filter((m) => m.remaining > 0 && !m.spec.unavailable)
      .map((m) => ({ id: m.spec.id, name: m.spec.name, remaining: m.remaining })),
    // What else run_scenario can switch: minors, majors, degree variants; and what the student placed themselves.
    availableMinors: programs.filter((x) => x.kind === 'minor').map((x) => x.name),
    availableMajors: programs.filter((x) => (x.kind === undefined || x.kind === 'major') && x.specializations.length > 0).map((x) => x.name),
    ...(program?.degrees && program.degrees.length > 1
      ? { degree: degree?.name ?? null, availableDegrees: program.degrees.map((d) => d.name) }
      : {}),
    ...(Object.keys(s.pinned).length > 0 ? { coursesYouPlaced: s.pinned } : {}),
    internshipYear: s.internship ?? null,
    ...(saved > 0 ? { savedThisCall: saved } : {}),
    uiVisible: uiVisible(call),
    ...(activeScenario
      ? {
          activeScenario: {
            id: String(activeScenario.scenarioId),
            status: activeScenario.status,
            opsSummary: (activeScenario.operations as unknown as ScenarioOp[]).map((op) => op.op),
          },
        }
      : {}),
  }
}

async function runGetStudentOverview(call: ResolvedCall): Promise<ToolResponse> {
  if (call.planInputs) return overviewFromCall(call, call.planInputs)
  const { userId, callId } = call
  const [profile, plan, courses, activeScenario] = await Promise.all([
    db().studentProfile.findUnique({ where: { userId } }),
    db().generatedPlan.findUnique({ where: { userId } }),
    db().studentCourse.findMany({ where: { userId } }),
    db().scenario.findFirst({
      where: { userId, callId, status: { in: ['computed', 'presented'] } },
      orderBy: { updatedAt: 'desc' },
    }),
  ])

  if (!profile || !plan) {
    return { ok: false, code: 'NO_PLAN', speakable: "I don't have a roadmap on file for you yet." }
  }

  // Transcript in-progress and onboarding's "registered this term" are both what they're taking now.
  const currentCourses = [
    ...new Set(courses.filter((c) => c.status === 'in_progress' || c.status === 'registered').map((c) => c.courseCode)),
  ]
  // Courses the saved plan has dropped: still enrolled until they drop with the registrar (spec 06).
  const droppedInPlan = (await droppedAt(plan.planId, plan.version)).filter((code) => currentCourses.includes(code))
  // plan.terms only holds courses not yet taken (buildStudentPlan assumes in-progress ones are done
  // "by start") — its last entry is the graduation term, never the term running now.
  const terms = plan.terms as unknown as { label: string; courses: { code: string }[] }[]
  const lastTerm = terms[terms.length - 1]
  const currentTerm = currentTermOf(new Date())

  return {
    program: {
      major: programName(profile.majorProgramId),
      minor: profile.minorProgramId ? programName(profile.minorProgramId) : null,
      specializations: plan.targetSpecializationIds.map((id) => specializationName(profile.majorProgramId, id)),
    },
    currentTerm: `${currentTerm.season} ${currentTerm.year}`,
    currentCourses,
    ...(droppedInPlan.length > 0 ? { droppedInSavedPlan: droppedInPlan } : {}),
    roadmap: {
      versionNumber: plan.version,
      projectedGraduation: lastTerm?.label ?? null,
      nextTerms: terms.slice(0, 3).map((t) => ({ term: t.label, courses: t.courses.map((c) => speakableCourse(c.code)) })),
    },
    // No StudentPreference rows exist yet this weekend (nothing writes them) — empty, not an error.
    preferences: [],
    ...(activeScenario
      ? {
          activeScenario: {
            id: String(activeScenario.scenarioId),
            status: activeScenario.status,
            opsSummary: (activeScenario.operations as unknown as ScenarioOp[]).map((op) => op.op),
          },
        }
      : {}),
  }
}

/** A scenario id from the model: digits only, else null (BigInt("abc") would throw mid-call). */
function scenarioIdOf(value: unknown): bigint | null {
  const text = typeof value === 'number' ? String(value) : typeof value === 'string' ? value.trim() : ''
  return /^\d+$/.test(text) ? BigInt(text) : null
}

const UNKNOWN_SCENARIO = { ok: false, code: 'UNKNOWN_SCENARIO', speakable: "I've lost track of that plan change — let's start a new one." }

async function runRunScenario(call: ResolvedCall, args: Record<string, unknown>): Promise<ToolResponse> {
  const scenarioId = args.scenarioId === undefined || args.scenarioId === null || args.scenarioId === '' ? undefined : scenarioIdOf(args.scenarioId)
  if (scenarioId === null) return UNKNOWN_SCENARIO

  // A new proposal (no scenarioId) replaces any still open from earlier in this call: that one was
  // passed over, so it's left — the app's Not now — rather than kept tappable under the new one.
  if (scenarioId === undefined) {
    const stale = await db().scenario.findMany({
      where: { userId: call.userId, callId: call.callId, status: { in: ['computed', 'presented'] } },
      select: { scenarioId: true },
    })
    for (const s of stale) {
      await discardScenario(call.userId, s.scenarioId)
      await publish(call.liveToken, { type: 'scenario.discarded', scenarioId: String(s.scenarioId) })
    }
  }

  // "Max is looking…" on the student's screen while the plans are built (not awaited against the tool).
  const working = publish(call.liveToken, { type: 'max.working', tool: 'run_scenario' })
  const result = await runScenario(call.userId, args.ops, { scenarioId, scope: scopeOf(call) })
  if ('code' in result) {
    await working
    return result
  }

  // Marking "presented" at return time is deliberate: the tool result is exactly what Max will
  // speak (spec 07), and what the live tree shows at the same moment.
  const presented = await presentScenario(call.userId, result.scenarioId, 'voice')
  if ('code' in presented) {
    await working
    return presented
  }

  const errors = result.validation.issues.filter((i) => i.severity === 'ERROR').map((i) => i.message)
  await working
  await publish(call.liveToken, {
    type: 'scenario.presented',
    scenario: {
      scenarioId: String(result.scenarioId),
      status: 'presented',
      presentedHash: presented.presentedHash,
      requiresAppConfirmation: result.requiresAppConfirmation,
      headline: result.diff.headline,
      errors,
      graduation: { before: result.diff.graduation.before, after: result.diff.graduation.after },
      frames: result.frames,
    },
  })

  return {
    scenarioId: String(result.scenarioId),
    presentedHash: presented.presentedHash,
    feasible: result.validation.ok,
    headline: result.diff.headline,
    warnings: result.validation.issues.filter((i) => i.severity === 'WARNING').map((i) => i.message),
    errors,
    // Always false now: every change saves on a clear spoken yes (src/lib/max/types.ts PROGRAM_OPS).
    requiresAppConfirmation: result.requiresAppConfirmation,
    uiVisible: uiVisible(call),
  }
}

async function runDiscardScenario(call: ResolvedCall, args: Record<string, unknown>): Promise<ToolResponse> {
  if (!args.scenarioId) return { ok: false, code: 'MISSING_SCENARIO_ID', speakable: "I don't know which change to leave." }
  const scenarioId = scenarioIdOf(args.scenarioId)
  if (scenarioId === null) return UNKNOWN_SCENARIO
  const result = await discardScenario(call.userId, scenarioId)
  if (!('code' in result)) await publish(call.liveToken, { type: 'scenario.discarded', scenarioId: String(scenarioId) })
  return result
}

async function runCommitScenario(call: ResolvedCall, args: Record<string, unknown>): Promise<ToolResponse> {
  if (!args.scenarioId || !args.presentedHash) {
    return { ok: false, code: 'MISSING_ARGS', speakable: "I don't have enough to save that yet." }
  }
  const scenarioId = scenarioIdOf(args.scenarioId)
  if (scenarioId === null) return UNKNOWN_SCENARIO
  // Their words were a no: leave the proposal, exactly as tapping Not now would.
  const utterance = typeof args.confirmationUtterance === 'string' ? args.confirmationUtterance : ''
  if (checkDecline(utterance)) {
    const left = await discardScenario(call.userId, scenarioId)
    if ('code' in left) return left
    await publish(call.liveToken, { type: 'scenario.discarded', scenarioId: String(scenarioId) })
    return { ok: true, saved: false, discarded: true, speakable: "Okay, I've left your plan as it was." }
  }
  const result = await commitScenario(call.userId, scenarioId, String(args.presentedHash), {
    channel: 'voice',
    utterance: typeof args.confirmationUtterance === 'string' ? args.confirmationUtterance : '',
  })
  if ('code' in result) return result
  // The app adopts the saved plan; Max only hears that it's saved (the plan itself isn't for speaking).
  const { live, ...forMax } = result
  await publish(call.liveToken, { type: 'scenario.committed', scenarioId: live.scenarioId, inputs: live.inputs, terms: live.terms })
  return { ...forMax, uiVisible: uiVisible(call) }
}

const TABS = new Set(['overview', 'plan', 'awards', 'classes'])

/** Max doing something in the app outside the plan: open a tab, or look a course up in the Class
 * Tracker so the student can watch a section. Only while the app is open on this call. */
async function runAppAction(call: ResolvedCall, args: Record<string, unknown>): Promise<ToolResponse> {
  if (!uiVisible(call)) {
    return { ok: false, code: 'APP_NOT_OPEN', speakable: "I can only do that while the app's open — open StudyMax and I'll do it from there." }
  }
  let action: AppAction
  if (args.action === 'open_tab' && typeof args.tab === 'string' && TABS.has(args.tab)) {
    action = { kind: 'open_tab', tab: args.tab as 'overview' | 'plan' | 'awards' | 'classes' }
  } else if (args.action === 'find_class') {
    const code = normalizeCourseCode(args.courseCode)
    if (!/^[A-Z]{2,5}\d{3}$/.test(code)) return { ok: false, code: 'INVALID_COURSE', speakable: "I didn't catch which course — could you say the code again?" }
    action = { kind: 'find_class', courseCode: code }
  } else {
    return { ok: false, code: 'UNKNOWN_ACTION', speakable: 'I can open a tab in the app, or look up a course in the Class Tracker.' }
  }
  await publish(call.liveToken, { type: 'app.action', action })
  return { ok: true, done: action.kind === 'open_tab' ? `opened ${action.tab}` : `showing ${action.courseCode}'s sections in the Class Tracker` }
}

const TOPICS = new Set<OptionTopic>(['specialization', 'pace', 'summer'])

/** Max's recommendations: real alternatives, each scored by the plan it would give (src/lib/max/options.ts). */
async function runGetPlanOptions(call: ResolvedCall, args: Record<string, unknown>): Promise<ToolResponse> {
  const about = args.about as OptionTopic
  if (!TOPICS.has(about)) return { ok: false, code: 'UNKNOWN_TOPIC', speakable: 'I can look at your pace, summers, or a different specialization.' }
  // Without the app's plan (a call placed by phone number), compare against the student's saved plan.
  const snapshot = call.planInputs ? snapshotFromCall(call.planInputs) : (await loadCurrentSnapshot(call.userId, scopeOf(call)))?.snapshot
  if (!snapshot) {
    return { ok: false, code: 'NO_LIVE_PLAN', speakable: "I can't compare options on this call — open the app and call me from there." }
  }
  const working = publish(call.liveToken, { type: 'max.working', tool: 'get_plan_options' })
  const result = planOptions(adapterInput(snapshot), about)
  await working
  await publish(call.liveToken, {
    type: 'options.presented',
    about,
    options: result.options.map(({ label, graduation, vsNow, coursesLeft }) => ({ label, graduation, vsNow, coursesLeft })),
    recommended: result.recommended?.label ?? null,
  })
  return { ...result, uiVisible: uiVisible(call) }
}

/** Returns a skill's full playbook by name (docs/BayMax/skills/<name>/SKILL.md, compiled by
 * scripts/build-skills.ts into skills.generated.ts — no runtime file I/O). No DB or identity
 * involved; this is a pure lookup, so it can't fail for any reason but an unknown name. */
function runLoadSkill(args: Record<string, unknown>): ToolResponse {
  const name = typeof args.name === 'string' ? args.name : ''
  const skill = maxSkills[name]
  if (!skill) return { ok: false, code: 'UNKNOWN_SKILL', speakable: "I don't have a playbook for that." }
  return { ok: true, name: skill.name, instructions: skill.instructions }
}

const NAME_RE = /^.{1,60}$/

/** Lets Max update the student's name mid-call (e.g. "actually, call me James") and use it for the
 * rest of that same call — Vapi bakes {{name}} into the system prompt once at call start and never
 * re-templates it, so a tool result is the only way a correction actually takes for the rest of the call. */
async function runUpdateName(call: ResolvedCall, args: Record<string, unknown>): Promise<ToolResponse> {
  const name = typeof args.name === 'string' ? args.name.trim() : ''
  if (!NAME_RE.test(name)) return { ok: false, code: 'INVALID_NAME', speakable: "I didn't catch a usable name there." }
  // A guest is the demo student every guest shares: saving their name there would greet the next guest
  // by it. The tool result alone carries it through this call.
  // The app shows it too (a guest's only for their session, kept in the app, not on the shared account).
  await publish(call.liveToken, { type: 'profile.name', name })
  if (call.isGuest) return { ok: true, name }
  const user = await db().userInfo.update({ where: { userId: call.userId }, data: { firstName: name } })
  return { ok: true, name: user.firstName }
}

async function executeTool(name: string, call: ResolvedCall, args: Record<string, unknown>): Promise<ToolResponse> {
  switch (name) {
    case 'get_student_overview':
      return runGetStudentOverview(call)
    case 'run_scenario':
      return runRunScenario(call, args)
    case 'discard_scenario':
      return runDiscardScenario(call, args)
    case 'commit_scenario':
      return runCommitScenario(call, args)
    case 'get_plan_options':
      return runGetPlanOptions(call, args)
    case 'update_name':
      return runUpdateName(call, args)
    case 'load_skill':
      return runLoadSkill(args)
    case 'app_action':
      return runAppAction(call, args)
    default:
      return { ok: false, code: 'UNKNOWN_TOOL', speakable: "I don't have a way to do that yet." }
  }
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'POST only' })
    return
  }
  if (!hasDatabase()) {
    res.status(503).json({ error: 'database not configured' })
    return
  }
  if (!verifiedByServerSecret(req)) {
    res.status(401).json({ error: 'unauthorized' })
    return
  }

  const { vapiCallId, calls } = extractToolCalls(req.body)
  const resolved = await resolveCall(vapiCallId)

  const results = await Promise.all(
    calls.map(async (raw) => {
      if (!resolved) {
        return { toolCallId: raw.id, result: JSON.stringify({ ok: false, code: 'UNKNOWN_CALL', speakable: "I can't access that right now." }) }
      }

      // Dedupe: Vapi can redeliver webhooks. A cached result short-circuits re-execution.
      const existing = await db().maxToolCall.findUnique({ where: { toolCallId: raw.id } })
      if (existing?.result) {
        return { toolCallId: raw.id, result: JSON.stringify(existing.result) }
      }

      await db().maxToolCall.upsert({
        where: { toolCallId: raw.id },
        update: {},
        create: { toolCallId: raw.id, callId: resolved.callId, toolName: raw.name, args: raw.arguments as unknown as Prisma.InputJsonValue },
      })

      const startedAt = Date.now()
      let result: ToolResponse
      let ok = true
      let errorCode: string | null = null
      try {
        result = await executeTool(raw.name, resolved, raw.arguments)
        if (result.ok === false) {
          ok = false
          errorCode = String(result.code ?? 'ERROR')
        }
      } catch (e) {
        ok = false
        errorCode = 'INTERNAL_ERROR'
        result = { ok: false, code: 'INTERNAL_ERROR', speakable: "Something went wrong on my end — let's try that again." }
        console.error('max tool execution failed', raw.name, (e as { message?: string })?.message ?? e)
      }

      const latencyMs = Date.now() - startedAt
      await db().maxToolCall.update({
        where: { toolCallId: raw.id },
        data: { result: result as unknown as Prisma.InputJsonValue, ok, errorCode, latencyMs },
      })

      const skill = raw.name === 'load_skill' ? String(raw.arguments.name ?? '?') : (SKILL_BY_TOOL[raw.name] ?? '?')
      const status = ok ? 'ok' : (errorCode ?? 'error')
      const extra = digest(raw.name, result)
      const argsPreview = JSON.stringify(raw.arguments).slice(0, 200)
      // "call {callId}" matches api/max/webhook.ts's own log prefix for the same call — grep one
      // callId across both routes' Vercel logs to see status/transcript/tool-call lines interleaved.
      console.log(`[Max] call ${resolved.callId} ${raw.name} (${skill}) args=${argsPreview} -> ${status}${extra ? ` ${extra}` : ''} [${latencyMs}ms]`)

      return { toolCallId: raw.id, result: JSON.stringify(result) }
    }),
  )

  res.status(200).json({ results })
}

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
import { commitScenario, discardScenario, presentScenario, runScenario } from './_scenarios.js'
import type { ScenarioOp } from '../../src/lib/max/types.js'
import { maxSkills } from '../../src/lib/max/skills.generated.js'
import { programName, specializationName } from '../../src/lib/max/planningAdapter.js'
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
}

async function resolveCall(vapiCallId: string | null): Promise<ResolvedCall | null> {
  if (!vapiCallId) return null
  const call = await db().maxCall.findUnique({ where: { vapiCallId } })
  if (!call || call.status === 'ended' || call.status === 'failed') return null
  return { callId: call.callId, userId: call.userId }
}

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

async function runGetStudentOverview(userId: bigint, callId: bigint): Promise<ToolResponse> {
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

  const currentCourses = courses.filter((c) => c.status === 'in_progress').map((c) => c.courseCode)
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
    roadmap: {
      versionNumber: plan.version,
      projectedGraduation: lastTerm?.label ?? null,
      nextTerms: terms.slice(0, 3).map((t) => ({ term: t.label, courses: t.courses.map((c) => c.code) })),
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

async function runRunScenario(userId: bigint, callId: bigint, args: Record<string, unknown>): Promise<ToolResponse> {
  const ops = Array.isArray(args.ops) ? (args.ops as ScenarioOp[]) : []
  const scenarioId = args.scenarioId ? BigInt(args.scenarioId as string | number) : undefined

  const result = await runScenario(userId, ops, { scenarioId, callId })
  if ('code' in result) return result

  // Marking "presented" at return time is deliberate: the tool result is exactly what Max will
  // speak (spec 07). uiVisible is hardcoded false — no realtime UI channel this weekend (→ 05, 07).
  const presented = await presentScenario(userId, result.scenarioId, 'voice')
  if ('code' in presented) return presented

  return {
    scenarioId: String(result.scenarioId),
    presentedHash: presented.presentedHash,
    feasible: result.validation.ok,
    headline: result.diff.headline,
    warnings: result.validation.issues.filter((i) => i.severity === 'WARNING').map((i) => i.message),
    errors: result.validation.issues.filter((i) => i.severity === 'ERROR').map((i) => i.message),
    requiresAppConfirmation: false,
    uiVisible: false,
  }
}

async function runDiscardScenario(userId: bigint, args: Record<string, unknown>): Promise<ToolResponse> {
  if (!args.scenarioId) return { ok: false, code: 'MISSING_SCENARIO_ID', speakable: "I don't know which change to drop." }
  const result = await discardScenario(userId, BigInt(args.scenarioId as string | number))
  return result
}

async function runCommitScenario(userId: bigint, callId: bigint, args: Record<string, unknown>): Promise<ToolResponse> {
  if (!args.scenarioId || !args.presentedHash) {
    return { ok: false, code: 'MISSING_ARGS', speakable: "I don't have enough to save that yet." }
  }
  const result = await commitScenario(userId, BigInt(args.scenarioId as string | number), String(args.presentedHash), {
    channel: 'voice',
    utterance: typeof args.confirmationUtterance === 'string' ? args.confirmationUtterance : '',
    callId,
  })
  return { ...result }
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
async function runUpdateName(userId: bigint, args: Record<string, unknown>): Promise<ToolResponse> {
  const name = typeof args.name === 'string' ? args.name.trim() : ''
  if (!NAME_RE.test(name)) return { ok: false, code: 'INVALID_NAME', speakable: "I didn't catch a usable name there." }
  const user = await db().userInfo.update({ where: { userId }, data: { firstName: name } })
  return { ok: true, name: user.firstName }
}

async function executeTool(name: string, userId: bigint, callId: bigint, args: Record<string, unknown>): Promise<ToolResponse> {
  switch (name) {
    case 'get_student_overview':
      return runGetStudentOverview(userId, callId)
    case 'run_scenario':
      return runRunScenario(userId, callId, args)
    case 'discard_scenario':
      return runDiscardScenario(userId, args)
    case 'commit_scenario':
      return runCommitScenario(userId, callId, args)
    case 'update_name':
      return runUpdateName(userId, args)
    case 'load_skill':
      return runLoadSkill(args)
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
        result = await executeTool(raw.name, resolved.userId, resolved.callId, raw.arguments)
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

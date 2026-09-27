// Rehearses a live Max call without a phone: plays Vapi's side (the call-status webhooks and Max's tool
// calls) against a dry-run call the app placed, so you can watch the Skill Tree reshape as "Max" works.
//
// 1. Server with MAX_DRY_RUN=1 (.env.local for `vercel dev`, or a Preview deployment — never Production).
// 2. In the app: Load a sample student → open it with ?rehearse=1 → Ping Max. The app jumps to the tree.
// 3. Run this. It finds the newest active dry-run call and plays, 4 s apart: the call connecting,
//    Max reading your plan, the pace options, a 4-a-term proposal, a drop added to it, a voice save,
//    the specialization options and a switch — which waits for you to tap Keep this plan — then the end.
//
// Run: node --experimental-strip-types --env-file=.env.local scripts/max-rehearse.ts [--base http://localhost:3000] [--fast]
import { PrismaClient } from '@prisma/client'

const args = process.argv.slice(2)
const base = (args[args.indexOf('--base') + 1] && args.includes('--base') ? args[args.indexOf('--base') + 1] : 'http://localhost:3000').replace(/\/$/, '')
const pause = args.includes('--fast') ? 800 : 4000
const secret = process.env.VAPI_SERVER_SECRET
if (!secret) throw new Error('VAPI_SERVER_SECRET must be set (the webhooks check it)')

const prisma = new PrismaClient()
const call = await prisma.maxCall.findFirst({
  where: { vapiCallId: { startsWith: 'dry-' }, status: { in: ['queued', 'ringing', 'in_progress'] } },
  orderBy: { createdAt: 'desc' },
})
if (!call?.vapiCallId) {
  console.error('No active dry-run call. In the app: Load a sample student, add ?rehearse=1 to the URL, then Ping Max.')
  await prisma.$disconnect()
  process.exit(1)
}
const vapiCallId = call.vapiCallId
console.log(`Rehearsing call ${call.callId} (${vapiCallId}) against ${base}\n`)

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))
const headers = { 'content-type': 'application/json', 'x-vapi-secret': secret }
let n = 0

async function webhook(message: Record<string, unknown>) {
  const res = await fetch(`${base}/api/max/webhook`, { method: 'POST', headers, body: JSON.stringify({ message: { ...message, call: { id: vapiCallId } } }) })
  if (!res.ok) throw new Error(`webhook ${message.type} -> ${res.status}`)
}

async function tool(name: string, toolArgs: Record<string, unknown>, say: string): Promise<Record<string, unknown>> {
  console.log(`▶ ${say}`)
  const res = await fetch(`${base}/api/max/tool`, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      message: { type: 'tool-calls', call: { id: vapiCallId }, toolCallList: [{ id: `rehearse-${call!.callId}-${Date.now()}-${n++}`, function: { name, arguments: toolArgs } }] },
    }),
  })
  if (!res.ok) throw new Error(`tool ${name} -> ${res.status}`)
  const body = (await res.json()) as { results: { result: string }[] }
  const result = JSON.parse(body.results[0].result) as Record<string, unknown>
  const spoken = result.ok === false ? `(${result.code}) ${result.speakable}` : summary(name, result)
  console.log(`  Max hears: ${spoken}\n`)
  await sleep(pause)
  return result
}

function summary(name: string, r: Record<string, unknown>): string {
  if (name === 'run_scenario') {
    return `${(r.headline as string[]).join(' ') || 'no change'} · uiVisible=${r.uiVisible} · requiresAppConfirmation=${r.requiresAppConfirmation}`
  }
  if (name === 'get_plan_options') {
    const opts = r.options as { label: string; graduation: string; vsNow: string }[]
    const rec = r.recommended as { label: string } | null
    return `${opts.map((o) => `${o.label} → ${o.graduation} (${o.vsNow})`).join(' | ')} · recommend: ${rec?.label ?? 'none'}`
  }
  if (name === 'get_student_overview') {
    const roadmap = r.roadmap as { projectedGraduation: string }
    return `graduation ${roadmap.projectedGraduation} · taking ${(r.currentCourses as string[]).join(', ')} · uiVisible=${r.uiVisible}`
  }
  if (name === 'commit_scenario') return `saved (v${r.versionId}) · uiVisible=${r.uiVisible}`
  return JSON.stringify(r).slice(0, 160)
}

try {
  console.log('▶ The phone is answered')
  await webhook({ type: 'status-update', status: 'in-progress' })
  await sleep(pause)

  await tool('get_student_overview', {}, '"Hi Max, where am I at?"')

  const pace = await tool('get_plan_options', { about: 'pace' }, '"Could I take a lighter load?"')
  const four = (pace.options as { label: string; ops: unknown[] }[] | undefined)?.find((o) => o.label.startsWith('4'))
  const paced = await tool('run_scenario', { ops: four?.ops ?? [{ op: 'SET_PREFERENCE', key: 'maxCoursesPerTerm', value: 4 }] }, '"Show me four a term."')

  const withDrop = await tool(
    'run_scenario',
    { ops: [{ op: 'DROP_COURSE', courseCode: 'CMPT 340' }], scenarioId: paced.scenarioId },
    '"And what if I drop CMPT 340 too?"',
  )
  if (withDrop.presentedHash) {
    await tool(
      'commit_scenario',
      { scenarioId: withDrop.scenarioId, presentedHash: withDrop.presentedHash, confirmationUtterance: 'Okay, yeah, save it' },
      '"Okay, yeah, save it."',
    )
  }

  const specs = await tool('get_plan_options', { about: 'specialization' }, '"Is there a specialization I could finish sooner?"')
  const pick = (specs.recommended ?? (specs.options as unknown[] | undefined)?.[0]) as { ops: unknown[]; label: string } | undefined
  if (pick) {
    const switched = await tool('run_scenario', { ops: pick.ops }, `"Show me ${pick.label}."`)
    if (switched.requiresAppConfirmation) {
      console.log('👉 Tap "Keep this plan" in the app (or "Not now"). Waiting up to 2 minutes…')
      const id = BigInt(String(switched.scenarioId))
      for (let i = 0; i < 120; i++) {
        const s = await prisma.scenario.findUnique({ where: { scenarioId: id }, select: { status: true } })
        if (s && s.status !== 'presented') {
          console.log(`  → ${s.status === 'committed' ? 'kept' : s.status}\n`)
          break
        }
        await sleep(1000)
      }
      await tool('get_student_overview', {}, '"Did that save?"')
    }
  }

  console.log('▶ Call ends')
  await webhook({ type: 'end-of-call-report', endedReason: 'customer-ended-call' })
  console.log('Done. Reseed the demo student before the real demo: npm run db:seed:demo-student')
} catch (e) {
  console.error('Rehearsal stopped:', (e as Error).message)
  // Never leave a dry run holding the one-active-call slot.
  await prisma.maxCall.update({ where: { callId: call.callId }, data: { status: 'ended', endedReason: 'rehearsal stopped' } }).catch(() => {})
} finally {
  await prisma.$disconnect()
}

// End-to-end of Max live on the Skill Tree, in-process: the real route handlers (call, webhook, tool,
// live) against the real shared DB, as the guest demo student — no HTTP server, no phone, no Vapi.
// Places a dry-run call with the app's plan inputs, then plays a whole call: overview, pace options,
// a proposal, a change stacked on it, a voice save, a specialization switch that voice may NOT save,
// a stale and a foreign tap refused, the real Keep tap, and the end. Supabase publishing is a no-op
// without SUPABASE_* env; everything is checked through the snapshot the app reads.
//
// It CHANGES the demo student's saved plan — reseed afterwards: npm run db:seed:demo-student
// Run: node --experimental-strip-types --experimental-loader ./scripts/_resolve-ts-loader.mjs --env-file=.env.local scripts/max-e2e.ts
import assert from 'node:assert/strict'
import { fileURLToPath } from 'node:url'
process.env.MAX_DRY_RUN = '1'
const root = fileURLToPath(new URL('..', import.meta.url)).replace(/\/$/, '')
const callHandler = (await import(`${root}/api/max/call.ts`)).default
const toolHandler = (await import(`${root}/api/max/tool.ts`)).default
const webhookHandler = (await import(`${root}/api/max/webhook.ts`)).default
const liveHandler = (await import(`${root}/api/max/live.ts`)).default
const { db } = await import(`${root}/api/_db.ts`)
const { regenerate, planHash } = await import(`${root}/src/lib/max/planningAdapter.ts`)
const { completedCourses, inProgressCourses, inProgressTerms } = await import(`${root}/src/data/transcript.ts`)

function res() {
  const r: { code: number; body: any; headers: Record<string, string> } = { code: 0, body: null, headers: {} }
  const o = {
    status(c: number) { r.code = c; return o },
    json(b: unknown) { r.body = b },
    setHeader(k: string, v: string) { r.headers[k] = v },
  }
  return { o, r }
}
const secret = process.env.VAPI_SERVER_SECRET!
const vapiHeaders = { 'x-vapi-secret': secret }

// The app's inputs for the sample student, as App.tsx builds them.
const planInputs = {
  v: 1, programId: 'computer-science', completed: completedCourses, inProgress: inProgressCourses,
  inProgressSeasons: inProgressTerms, targetIds: ['software-development'], concentrationIds: ['software-development'],
  minorId: null, degreeVariant: 'bsc-4', away: null, coursesPerTerm: 5, springSummer: false, summerPerTerm: 2,
  start: { season: 'Winter', year: 2027 }, today: '2026-09-27', planHash: '',
}
planInputs.planHash = planHash(regenerate({
  completed: new Set(completedCourses), inProgress: new Set(inProgressCourses), targetProgramId: 'computer-science',
  targetSpecializationIds: ['software-development'], minorProgramId: null, coursesPerTerm: 5, springSummer: false,
  summerPerTerm: 2, start: { season: 'Winter', year: 2027 }, today: new Date(2026, 8, 27), inProgressSeasons: inProgressTerms,
  degreeVariant: 'bsc-4', away: null,
}).terms)

// 1. Place the (dry-run) call from the "app"
let x = res()
await callHandler({ method: 'POST', headers: {}, body: { planInputs, dryRun: true } }, x.o)
console.log('call.ts ->', x.r.code, x.r.body)
assert.equal(x.r.code, 200)
assert.equal(x.r.body.parity, true, 'server plan == app plan')
const { liveToken, callId } = x.r.body
const vapiCallId = `dry-${callId}`

const hook = async (message: any) => { const y = res(); await webhookHandler({ method: 'POST', headers: vapiHeaders, body: { message: { ...message, call: { id: vapiCallId } } } }, y.o); return y.r }
let tc = 0
const tool = async (name: string, args: any) => {
  const y = res()
  await toolHandler({ method: 'POST', headers: vapiHeaders, body: { message: { type: 'tool-calls', call: { id: vapiCallId }, toolCallList: [{ id: `e2e-${callId}-${tc++}`, function: { name, arguments: args } }] } } }, y.o)
  assert.equal(y.r.code, 200, `${name} http`)
  return JSON.parse(y.r.body.results[0].result)
}
const snapshot = async () => { const y = res(); await liveHandler({ method: 'GET', query: { token: liveToken } }, y.o); return y.r }

// 2. Answered; the app is watching (heartbeat)
await hook({ type: 'status-update', status: 'in-progress' })
let s = await snapshot()
assert.equal(s.code, 200); assert.equal(s.body.call.status, 'in_progress'); assert.equal(s.body.parity, true)
console.log('snapshot: status', s.body.call.status, '| baseline grad', s.body.baseline.terms.at(-1).label)

// 3. Overview reflects the app's inputs, uiVisible true
const ov = await tool('get_student_overview', {})
console.log('overview: grad', ov.roadmap.projectedGraduation, '| uiVisible', ov.uiVisible, '| specs', ov.availableSpecializations.length)
assert.equal(ov.uiVisible, true)
assert.deepEqual(ov.currentCourses, inProgressCourses)

// 4. Pace options → show 4 a term
const pace = await tool('get_plan_options', { about: 'pace' })
console.log('pace options:', pace.options.map((o: any) => `${o.label}→${o.graduation}(${o.vsNow})`).join(' | '), '| rec', pace.recommended?.label ?? 'none')
const four = pace.options.find((o: any) => o.label.startsWith('4'))
const r1 = await tool('run_scenario', { ops: four.ops })
console.log('run 4/term:', r1.headline, '| uiVisible', r1.uiVisible)
assert.equal(r1.uiVisible, true); assert.equal(r1.requiresAppConfirmation, false)
// 5. Build on it: drop CMPT 340 (voice style code)
const r2 = await tool('run_scenario', { ops: [{ op: 'DROP_COURSE', courseCode: 'cmpt 340' }], scenarioId: r1.scenarioId })
console.log('+drop 340:', r2.headline)
assert.equal(r2.scenarioId, r1.scenarioId)
s = await snapshot()
assert.equal(s.body.scenario.status, 'presented'); assert.equal(s.body.scenario.scenarioId, r2.scenarioId)
// 6. Voice save
const c1 = await tool('commit_scenario', { scenarioId: r2.scenarioId, presentedHash: r2.presentedHash, confirmationUtterance: 'Okay, yeah, save it' })
console.log('voice commit:', c1.ok, c1.versionId, '| live leaked to Max?', 'live' in c1)
assert.equal(c1.ok, true); assert.ok(!('live' in c1), 'the plan payload is not sent to Max')
s = await snapshot()
assert.equal(s.body.scenario.status, 'committed')
assert.ok(!s.body.baseline.inputs.inProgress.includes('CMPT340'), 'call inputs advanced past the saved drop')
assert.equal(s.body.baseline.inputs.coursesPerTerm, 4)
const prof = await db().studentProfile.findFirst({ where: { user: { authUid: 'baymax-demo-student' } } })
assert.equal(prof.maxCoursesPerTerm, 4, 'a saved pace is the student preference now')
// 7. Specialization switch: voice save refused, app Keep works
const specs = await tool('get_plan_options', { about: 'specialization' })
console.log('spec options:', specs.options.map((o: any) => `${o.label}→${o.graduation}(${o.vsNow})`).join(' | '), '| rec', specs.recommended?.label ?? 'none')
const pick = specs.recommended ?? specs.options[0]
const r3 = await tool('run_scenario', { ops: pick.ops })
console.log('switch:', r3.headline, '| requiresAppConfirmation', r3.requiresAppConfirmation)
assert.equal(r3.requiresAppConfirmation, true)
const voiceTry = await tool('commit_scenario', { scenarioId: r3.scenarioId, presentedHash: r3.presentedHash, confirmationUtterance: 'yes' })
assert.equal(voiceTry.code, 'REQUIRES_APP_CONFIRMATION')
// a stale hash from the app is refused
let y = res()
await liveHandler({ method: 'POST', body: { action: 'commit', token: liveToken, scenarioId: r3.scenarioId, presentedHash: 'stale' } }, y.o)
assert.equal(y.r.code, 409); assert.equal(y.r.body.error, 'STALE_PRESENTATION')
// someone else's scenario id via this token is refused
y = res()
await liveHandler({ method: 'POST', body: { action: 'commit', token: liveToken, scenarioId: '1', presentedHash: 'x' } }, y.o)
assert.equal(y.r.code, 404)
// the real tap
y = res()
await liveHandler({ method: 'POST', body: { action: 'commit', token: liveToken, scenarioId: r3.scenarioId, presentedHash: r3.presentedHash } }, y.o)
console.log('app Keep:', y.r.code, y.r.body.ok, '| adopted targets', y.r.body.inputs?.targetIds)
assert.equal(y.r.code, 200)
const ov2 = await tool('get_student_overview', {})
assert.equal(ov2.savedThisCall, 2)
console.log('overview after: grad', ov2.roadmap.projectedGraduation, '| specs', ov2.program.specializations, '| savedThisCall', ov2.savedThisCall)
// 8. Bad token
y = res(); await liveHandler({ method: 'GET', query: { token: 'nope-nope-nope-nope-nope' } }, y.o); assert.equal(y.r.code, 404)
// 9. End of call
await hook({ type: 'end-of-call-report', endedReason: 'customer-ended-call' })
s = await snapshot()
assert.equal(s.body.call.status, 'ended')
console.log('\nmax-e2e.ts: the whole live call passed — call', callId)
console.log('Now reseed the demo student: npm run db:seed:demo-student')
await db().$disconnect()

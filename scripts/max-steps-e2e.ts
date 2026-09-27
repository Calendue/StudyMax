// The seven-step conversation, tool by tool, in-process against the real handlers and the real shared
// DB as the guest demo student (a dry-run call: no phone, no Vapi): summary, a what-if drop, saving
// it, going back to how it was, moving a course, a specialization switch, and a live seat check
// against USask's class search. Each step is checked on what the plan actually became, independently
// of the words Max would say. scripts/max-chat.ts runs the same steps with the real model choosing.
//
// It CHANGES the demo student's saved plan — reseed afterwards: npm run db:seed:demo-student
// Run: node --experimental-strip-types --experimental-loader ./scripts/_resolve-ts-loader.mjs --env-file=.env.local scripts/max-steps-e2e.ts
import assert from 'node:assert/strict'
import { fileURLToPath } from 'node:url'
process.env.MAX_DRY_RUN = '1'
const root = fileURLToPath(new URL('..', import.meta.url)).replace(/\/$/, '')
const callHandler = (await import(`${root}/api/max/call.ts`)).default
const toolHandler = (await import(`${root}/api/max/tool.ts`)).default
const webhookHandler = (await import(`${root}/api/max/webhook.ts`)).default
const liveHandler = (await import(`${root}/api/max/live.ts`)).default
const { db } = await import(`${root}/api/_db.ts`)
const { getTerms, searchCourse } = await import(`${root}/api/_banner.ts`)
const { openSeats } = await import(`${root}/src/lib/classTracker.ts`)
const { regenerate, planHash } = await import(`${root}/src/lib/max/planningAdapter.ts`)
const { courseRunsIn, termFromLabel, termOrder } = await import(`${root}/src/lib/plan.ts`)
const { completedCourses, inProgressCourses, inProgressTerms } = await import(`${root}/src/data/transcript.ts`)

function res() {
  const r: { code: number; body: any } = { code: 0, body: null }
  const o = { status(c: number) { r.code = c; return o }, json(b: unknown) { r.body = b }, setHeader() {} }
  return { o, r }
}
const vapiHeaders = { 'x-vapi-secret': process.env.VAPI_SERVER_SECRET! }

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

let x = res()
await callHandler({ method: 'POST', headers: {}, body: { planInputs, dryRun: true } }, x.o)
assert.equal(x.r.code, 200, JSON.stringify(x.r.body))
const { liveToken, callId } = x.r.body
const vapiCallId = `dry-${callId}`
const hook = async (message: any) => { const y = res(); await webhookHandler({ method: 'POST', headers: vapiHeaders, body: { message: { ...message, call: { id: vapiCallId } } } }, y.o) }
let tc = 0
const tool = async (name: string, args: any) => {
  const y = res()
  await toolHandler({ method: 'POST', headers: vapiHeaders, body: { message: { type: 'tool-calls', call: { id: vapiCallId }, toolCallList: [{ id: `steps-${callId}-${tc++}`, function: { name, arguments: args } }] } } }, y.o)
  assert.equal(y.r.code, 200, `${name} http`)
  return JSON.parse(y.r.body.results[0].result)
}
const baseline = async () => { const y = res(); await liveHandler({ method: 'GET', query: { token: liveToken } }, y.o); return y.r.body.baseline as { inputs: any; terms: any[] } }
const termOf = (terms: any[], code: string) => terms.find((t) => t.courses.some((c: any) => c.code === code))?.label ?? null
/** Independent of Max's code: whether USask's published timetable runs a course in a plan term (null: not published yet). */
async function runsInPublished(label: string, subject: string, number: string): Promise<boolean | null> {
  const t = termFromLabel(label)
  const months = t.season === 'Winter' ? ['01'] : t.season === 'Fall' ? ['09'] : ['05', '07']
  const listed = new Set((await getTerms()).map((x: any) => x.code))
  const codes = months.map((m) => `${t.year}${m}`).filter((c) => listed.has(c))
  if (codes.length === 0) return null
  for (const code of codes) {
    for (let attempt = 0; attempt < 2; attempt++) {
      if ((await searchCourse(code, subject, number)).length > 0) return true
      await new Promise((r) => setTimeout(r, 1200))
    }
  }
  return false
}
/** get_schedule must be the saved plan as it is now: every planned course of the live baseline, in its term. */
async function scheduleMatches(step: string) {
  const sched = await tool('get_schedule', {})
  const base = await baseline()
  const say = (c: string) => (c.startsWith('elective:') ? c.split(':').slice(2).join(':') : c.replace(/^([A-Z]+)(\d)/, '$1 $2'))
  for (const t of base.terms) {
    const entry = sched.schedule.find((e: any) => e.term === t.label)
    assert.ok(entry, `${step}: ${t.label} is in the schedule`)
    for (const c of t.courses) assert.ok(entry.planned.includes(say(c.code)) || entry.takingNow.includes(say(c.code)), `${step}: ${c.code} in ${t.label}`)
  }
  const under = sched.schedule.flatMap((e: any) => e.takingNow)
  for (const c of base.inputs.inProgress) assert.ok(under.includes(say(c)), `${step}: ${c} under way`)
  assert.equal(under.length, base.inputs.inProgress.length, `${step}: nothing extra under way`)
  return sched
}
const say = (step: string, what: unknown) => console.log(`\n${step}\n  ${typeof what === 'string' ? what : JSON.stringify(what)}`)

try {
  await hook({ type: 'status-update', status: 'in-progress' })
  const start = await baseline()
  const startHash = planHash(start.terms)

  // 1. "Give me a summary of my current roadmap"
  const ov = await tool('get_student_overview', {})
  say('1. summary', { grad: ov.roadmap.projectedGraduation, taking: ov.currentCourses, next: ov.roadmap.nextTerms[0] })
  assert.deepEqual(ov.currentCourses, inProgressCourses, 'the courses under way are the student\'s own')
  assert.equal(ov.roadmap.projectedGraduation, start.terms.at(-1).label, 'the summary is the plan on screen')
  await scheduleMatches('1')
  const w27 = await tool('get_schedule', { term: 'Winter 2027' })
  say('1b. what am I taking in Winter 2027', w27)
  assert.ok(w27.takingNow.length + w27.planned.length > 0 && !w27.nothingThen, 'Winter 2027 is not empty')
  const late = await tool('get_schedule', { term: 'Fall 2035' })
  assert.match(late.nothingThen ?? '', /after you finish/, 'a term after graduation says so')

  // 2. "What if I dropped CMPT 370?" — shown, not saved
  const whatIf = await tool('run_scenario', { ops: [{ op: 'DROP_COURSE', courseCode: 'CMPT 370' }] })
  say('2. what if I dropped CMPT 370', { headline: whatIf.headline, feasible: whatIf.feasible })
  assert.equal(whatIf.feasible, true)
  assert.equal(planHash((await baseline()).terms), startHash, 'a what-if changes nothing yet')

  // 3. "Drop it" — saved on a clear yes
  const saved = await tool('commit_scenario', { scenarioId: whatIf.scenarioId, presentedHash: whatIf.presentedHash, confirmationUtterance: 'Yes, drop it' })
  const afterDrop = await baseline()
  say('3. drop it', { ok: saved.ok, inProgress: afterDrop.inputs.inProgress })
  assert.equal(saved.ok, true)
  assert.ok(!afterDrop.inputs.inProgress.includes('CMPT370') && afterDrop.inputs.droppedCourses.includes('CMPT370'), 'CMPT 370 is dropped in the saved plan')
  const fallAfterDrop = await tool('get_schedule', { term: 'current' })
  assert.ok(!fallAfterDrop.takingNow.includes('CMPT 370'), 'the schedule follows the save: CMPT 370 no longer this term')
  await scheduleMatches('3')

  // 4. "Don't drop it — leave it as it was" — back to the plan before the save, saved on a yes
  // (passing the id of the change just saved, as the model sometimes does: a new proposal, not a dead end)
  const back = await tool('run_scenario', { ops: [{ op: 'RESTORE_VERSION', versionNumber: 'previous' }], scenarioId: whatIf.scenarioId })
  assert.ok(back.ok !== false, JSON.stringify(back))
  const restored = await tool('commit_scenario', { scenarioId: back.scenarioId, presentedHash: back.presentedHash, confirmationUtterance: 'Yes please' })
  const afterUndo = await baseline()
  say('4. leave it as it was', { headline: back.headline, ok: restored.ok, inProgress: afterUndo.inputs.inProgress })
  assert.equal(restored.ok, true)
  assert.ok(afterUndo.inputs.inProgress.includes('CMPT370'), 'CMPT 370 is back under way')
  assert.equal(planHash(afterUndo.terms), startHash, 'the plan is exactly as it was')
  assert.ok((await tool('get_schedule', { term: 'current' })).takingNow.includes('CMPT 370'), 'and the schedule has it back')
  await scheduleMatches('4')

  // 5. "Move CMPT 370" — one they're taking now goes to the next term that works, never refused
  const move = await tool('run_scenario', { ops: [{ op: 'MOVE_COURSE', courseCode: 'CMPT 370' }] })
  const moved = (await (async () => { const y = res(); await liveHandler({ method: 'GET', query: { token: liveToken } }, y.o); return y.r.body.scenario.frames.at(-1) })())
  const landed = termOf(moved.terms, 'CMPT370')
  say('5. move CMPT 370', { headline: move.headline, placement: move.placement, landed })
  assert.ok(move.ok !== false && move.feasible === true, JSON.stringify(move))
  assert.ok(landed && termOrder(termFromLabel(landed)) > termOrder({ season: 'Fall', year: 2026 }), 'in a later term')
  assert.ok(courseRunsIn('CMPT370', termFromLabel(landed).season, false), 'one that runs it')
  assert.notEqual(await runsInPublished(landed, 'CMPT', '370'), false, `and USask's published timetable runs it in ${landed}`)
  assert.ok(!moved.inputs.inProgress.includes('CMPT370'), 'dropped from this term')
  assert.ok(move.placement?.some((l: string) => l.includes(landed)), 'and Max is told where it landed')
  await tool('discard_scenario', { scenarioId: move.scenarioId })
  // Going back and then moving, in one proposal: the move builds on the version it went back to.
  const back2 = await tool('run_scenario', { ops: [{ op: 'RESTORE_VERSION', versionNumber: 'previous' }] })
  const onTop = await tool('run_scenario', { ops: [{ op: 'MOVE_COURSE', courseCode: 'CMPT370' }], scenarioId: back2.scenarioId })
  say('5b. go back, then move CMPT 370', { ok: onTop.ok !== false, feasible: onTop.feasible, placement: onTop.placement })
  assert.ok(onTop.ok !== false && onTop.feasible === true, JSON.stringify(onTop))
  await tool('discard_scenario', { scenarioId: onTop.scenarioId })

  // 6. "I want to specialize in Cybersecurity" — switched and saved on a yes
  const spec = await tool('run_scenario', { ops: [{ op: 'SET_SPECIALIZATIONS', specializationIds: ['Cybersecurity'] }] })
  const specSaved = await tool('commit_scenario', { scenarioId: spec.scenarioId, presentedHash: spec.presentedHash, confirmationUtterance: 'Yeah, save it' })
  const afterSpec = await baseline()
  say('6. specialize in Cybersecurity', { headline: spec.headline, ok: specSaved.ok, targets: afterSpec.inputs.targetIds })
  assert.equal(specSaved.ok, true)
  assert.equal(afterSpec.inputs.targetIds[0], 'cybersecurity', 'the plan now leads with Cybersecurity')
  await scheduleMatches('6')

  // 7. "Check seats for CMPT 370 next term" — live from USask, checked against a separate search
  const seats = await tool('check_seats', { courseCode: 'CMPT 370', term: 'next' })
  say('7. check seats for CMPT 370 next term', seats)
  assert.ok(seats.ok !== false, JSON.stringify(seats))
  if (seats.status !== 'not_published') {
    const code = { Fall: '09', Winter: '01', 'Spring/Summer': '05' }[termFromLabel(seats.term).season as 'Fall']
    const direct = (await searchCourse(`${termFromLabel(seats.term).year}${code}`, 'CMPT', '370')).filter((s: any) => s.scheduleType === null || /lecture/i.test(s.scheduleType))
    const open = direct.filter((s: any) => s.status === 'open')
    const expected = direct.length === 0 ? 'not_running' : open.length > 0 ? 'open' : direct.some((s: any) => s.status === 'waitlist') ? 'waitlist' : 'full'
    console.log(`  independent search: ${direct.length} lecture sections, ${open.reduce((n: number, s: any) => n + openSeats(s), 0)} open seats → ${expected}`)
    // Seats move by the minute; the status category is what must agree.
    assert.equal(seats.status, expected, 'Max reports what USask shows')
  }
  const bad = await tool('check_seats', { courseCode: 'the hard one' })
  assert.equal(bad.code, 'INVALID_COURSE')

  console.log('\nmax-steps-e2e.ts: all seven steps passed — call', callId)
} finally {
  await hook({ type: 'end-of-call-report', endedReason: 'customer-ended-call' })
  console.log('Now reseed the demo student: npm run db:seed:demo-student')
  await db().$disconnect()
}

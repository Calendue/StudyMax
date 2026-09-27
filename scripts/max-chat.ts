// The seven-step conversation with the real model choosing every tool: the same system prompt, tool
// schemas and per-call variables Vapi gets (scripts/_max-assistant.ts, api/max/call.ts's dry run),
// on the same model and temperature, talking in text instead of on the phone. Every tool call runs
// through the real api/max/tool.ts handler against the real shared DB, as the guest demo student.
//
// The student's lines are fixed; nothing is special-cased for them. Each step is judged on which tools
// the model actually called and what the saved plan became, plus a light check of what Max said.
// Costs a few dozen OpenAI calls (gpt-4.1). It CHANGES the demo student's saved plan — reseed after:
// npm run db:seed:demo-student
// Run: node --experimental-strip-types --experimental-loader ./scripts/_resolve-ts-loader.mjs --env-file=.env.local scripts/max-chat.ts
import { fileURLToPath } from 'node:url'
import { maxTools, SYSTEM_PROMPT } from './_max-assistant.ts'
process.env.MAX_DRY_RUN = '1'
const root = fileURLToPath(new URL('..', import.meta.url)).replace(/\/$/, '')
const callHandler = (await import(`${root}/api/max/call.ts`)).default
const toolHandler = (await import(`${root}/api/max/tool.ts`)).default
const webhookHandler = (await import(`${root}/api/max/webhook.ts`)).default
const liveHandler = (await import(`${root}/api/max/live.ts`)).default
const { db } = await import(`${root}/api/_db.ts`)
const { getTerms, searchCourse } = await import(`${root}/api/_banner.ts`)
const { regenerate, planHash } = await import(`${root}/src/lib/max/planningAdapter.ts`)
const { courseRunsIn, termFromLabel, termOrder } = await import(`${root}/src/lib/plan.ts`)
const { completedCourses, inProgressCourses, inProgressTerms } = await import(`${root}/src/data/transcript.ts`)

const OPENAI_KEY = process.env.OPENAI_API_KEY
if (!OPENAI_KEY) throw new Error('OPENAI_API_KEY must be set in .env.local')

function res() {
  const r: { code: number; body: any } = { code: 0, body: null }
  const o = { status(c: number) { r.code = c; return o }, json(b: unknown) { r.body = b }, setHeader() {} }
  return { o, r }
}
const vapiHeaders = { 'x-vapi-secret': process.env.VAPI_SERVER_SECRET! }

// The app's inputs for the sample student, as App.tsx builds them (the same as max-e2e.ts).
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
await callHandler({ method: 'POST', headers: {}, body: { planInputs, dryRun: true, name: 'Tobi' } }, x.o)
if (x.r.code !== 200) throw new Error(`call: ${x.r.code} ${JSON.stringify(x.r.body)}`)
const { liveToken, callId, variableValues, firstMessage } = x.r.body
const vapiCallId = `dry-${callId}`

// Vapi fills {{variables}} in the system prompt from the call's variableValues.
const system = SYSTEM_PROMPT.replace(/\{\{(\w+)\}\}/g, (_, k) => String(variableValues[k] ?? ''))
// Vapi's tool list, as the model sees it: the function tools, plus its built-in endCall.
const tools = [
  ...maxTools('local', {}).flatMap((t: any) => (t.type === 'function' ? [{ type: 'function', function: t.function }] : [])),
  { type: 'function', function: { name: 'endCall', description: 'Ends the call.', parameters: { type: 'object', properties: {} } } },
]

const hook = async (message: any) => { const y = res(); await webhookHandler({ method: 'POST', headers: vapiHeaders, body: { message: { ...message, call: { id: vapiCallId } } } }, y.o) }
let tc = 0
async function runTool(name: string, args: any): Promise<any> {
  if (name === 'endCall') return { ended: true }
  const y = res()
  await toolHandler({ method: 'POST', headers: vapiHeaders, body: { message: { type: 'tool-calls', call: { id: vapiCallId }, toolCallList: [{ id: `chat-${callId}-${tc++}`, function: { name, arguments: args } }] } } }, y.o)
  return JSON.parse(y.r.body.results[0].result)
}
const baseline = async () => { const y = res(); await liveHandler({ method: 'GET', query: { token: liveToken } }, y.o); return y.r.body.baseline as { inputs: any; terms: any[] } }

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

type Call = { name: string; args: any; result: any }
const allCalls: Call[] = []
const messages: any[] = [{ role: 'system', content: system }, { role: 'assistant', content: firstMessage }]
console.log(`MAX: ${firstMessage}`)

/** One student turn: the model answers, calling tools until it speaks. Returns what it said and did. */
async function turn(said: string): Promise<{ text: string; calls: Call[] }> {
  console.log(`\nSTUDENT: ${said}`)
  messages.push({ role: 'user', content: said })
  const calls: Call[] = []
  for (let hop = 0; hop < 8; hop++) {
    const r = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: { authorization: `Bearer ${OPENAI_KEY}`, 'content-type': 'application/json' },
      body: JSON.stringify({ model: 'gpt-4.1', temperature: 0.3, messages, tools }),
    })
    if (!r.ok) throw new Error(`OpenAI ${r.status}: ${(await r.text()).slice(0, 300)}`)
    const msg = (await r.json()).choices[0].message
    messages.push(msg)
    if (!msg.tool_calls?.length) {
      console.log(`MAX: ${msg.content}`)
      return { text: msg.content ?? '', calls }
    }
    for (const tcall of msg.tool_calls) {
      const args = JSON.parse(tcall.function.arguments || '{}')
      const result = await runTool(tcall.function.name, args)
      calls.push({ name: tcall.function.name, args, result })
      allCalls.push({ name: tcall.function.name, args, result })
      const shown = JSON.stringify(result)
      console.log(`  → ${tcall.function.name}(${JSON.stringify(args)}) = ${shown.length > 220 ? shown.slice(0, 220) + '…' : shown}`)
      messages.push({ role: 'tool', tool_call_id: tcall.id, content: JSON.stringify(result) })
    }
  }
  throw new Error('the model kept calling tools without answering')
}

/** A student turn, then answering Max's save question the way the step calls for, if he asks one. */
async function step(said: string, save: 'yes' | 'no' | null) {
  let last = await turn(said)
  const all = { text: last.text, calls: [...last.calls] }
  // A student who wants the change answers Max's direct questions yes ("save it?", "undo the drop?");
  // one who only wanted to look answers the save question no. "Anything else?" is left unanswered.
  for (let i = 0; i < 2 && save; i++) {
    const asked = /\?\s*$/.test(last.text.trim()) && !/anything else|what else|all set/i.test(last.text)
    const saveQuestion = asked && /save|keep (it|that|this)/i.test(last.text)
    if (!(save === 'yes' ? asked : saveQuestion)) break
    last = await turn(save === 'yes' ? 'Yes.' : 'No, leave it for now.')
    all.text += `\n${last.text}`
    all.calls.push(...last.calls)
    if (save === 'no') break
  }
  return all
}

const results: [string, boolean, string][] = []

const check = (name: string, ok: boolean, detail = '') => {
  results.push([name, ok, detail])
  console.log(`  ${ok ? 'PASS' : 'FAIL'} ${name}${detail ? ` — ${detail}` : ''}`)
}
/** A term question: answered from a get_schedule result fetched since the last save (this turn or an
 * earlier one — the plan hasn't changed since), naming what's actually in that term. */
async function termQuestion(tag: string, said: string, label: string, notUnder?: string) {
  const r = await step(said, null)
  const lastSave = allCalls.findLastIndex((c) => c.name === 'commit_scenario' && c.result.ok === true)
  const lastLook = allCalls.findLastIndex((c) => c.name === 'get_schedule')
  const call = lastLook > lastSave ? allCalls[lastLook] : undefined
  check(`${tag}: answered from the schedule as it is now`, Boolean(call), call ? JSON.stringify(call.args) : 'no get_schedule since the last save')
  const res = call?.result
  const entry = res?.schedule ? res.schedule.find((e: any) => e.term === label) : res?.term === label ? res : null
  check(`${tag}: for ${label}`, Boolean(entry), JSON.stringify(res ?? null).slice(0, 200))
  const items: string[] = [...(entry?.takingNow ?? []), ...(entry?.planned ?? [])]
  const named = items.filter((i) => r.text.toLowerCase().includes(i.toLowerCase().split(/[:(]/)[0].trim()))
  check(`${tag}: names what's there`, items.length > 0 && named.length > 0 && !/nothing (planned|scheduled)|no courses|don't have any courses/i.test(r.text), r.text)
  if (notUnder) check(`${tag}: follows the save (${notUnder} no longer under way)`, !(entry?.takingNow ?? []).includes(notUnder))
}
const ops = (calls: Call[]) => calls.filter((c) => c.name === 'run_scenario').flatMap((c) => c.args.ops ?? [])
const REFUSAL = /can(no|')t (be )?mov|not able to move|unable to move|you('d| would) (need|have) to drop/i

try {
  await hook({ type: 'status-update', status: 'in-progress' })
  const start = await baseline()
  const startHash = planHash(start.terms)
  const version0 = (await db().generatedPlan.findFirst({ where: { user: { authUid: 'baymax-demo-student' } } })).version

  // 1
  const s1 = await step('Hey Max, can you give me a summary of my current roadmap?', null)
  check('1 summary: looked up the roadmap', s1.calls.some((c) => c.name === 'get_student_overview' || (c.name === 'load_skill' && c.args.name === 'summarize_roadmap')))
  check('1 summary: names the graduation term', s1.text.includes(start.terms.at(-1).label.split(' ')[1]), start.terms.at(-1).label)

  await termQuestion('1b term', 'What am I taking in Winter 2027?', 'Winter 2027')

  // 2
  const s2 = await step('What if I dropped CMPT 370?', null)
  check('2 what-if: explored a drop of CMPT 370', ops(s2.calls).some((o: any) => o.op === 'DROP_COURSE' && /CMPT\s*370/i.test(o.courseCode)))
  check('2 what-if: nothing saved', !s2.calls.some((c) => c.name === 'commit_scenario') && planHash((await baseline()).terms) === startHash)

  // 3
  const s3 = await step('Okay, drop it.', 'yes')
  const afterDrop = await baseline()
  check('3 drop it: saved', s3.calls.some((c) => c.name === 'commit_scenario' && c.result.ok === true))
  check('3 drop it: CMPT 370 dropped in the saved plan', !afterDrop.inputs.inProgress.includes('CMPT370'))
  await termQuestion('3b term', 'So what am I taking this semester now?', 'Fall 2026', 'CMPT 370')

  // 4
  const s4 = await step("Actually, don't drop it. Leave it as it was.", 'yes')
  const afterUndo = await baseline()
  check('4 leave it as it was: CMPT 370 back', afterUndo.inputs.inProgress.includes('CMPT370'), s4.calls.map((c) => c.name).join(','))
  check('4 leave it as it was: plan exactly as it started', planHash(afterUndo.terms) === startHash)

  // 5
  const s5 = await step('Can you move CMPT 370 to a later term?', 'no')
  const move = s5.calls.find((c) => c.name === 'run_scenario' && (c.args.ops ?? []).some((o: any) => o.op === 'MOVE_COURSE'))
  check('5 move: ran MOVE_COURSE', Boolean(move))
  check('5 move: feasible, with where it landed', move?.result.feasible === true && Array.isArray(move?.result.placement), JSON.stringify(move?.result.placement ?? move?.result))
  const landed = move?.result.placement?.[0]?.match(/ is (Fall|Winter|Spring\/Summer) (\d{4})/)
  check('5 move: a later term that runs it', Boolean(landed && termOrder({ season: landed[1], year: Number(landed[2]) }) > termOrder({ season: 'Fall', year: 2026 }) && courseRunsIn('CMPT370', landed[1], false)))
  check("5 move: USask's published timetable runs it there", Boolean(landed) && (await runsInPublished(`${landed[1]} ${landed[2]}`, 'CMPT', '370')) !== false, landed?.[0])
  check('5 move: Max did not refuse', !REFUSAL.test(s5.text), s5.text.split('\n')[0])
  check('5 move: left unsaved when the student said no', planHash((await baseline()).terms) === startHash)

  // 6
  const s6 = await step('I want to specialize in Cybersecurity.', 'yes')
  const afterSpec = await baseline()
  check('6 specialize: switched', ops(s6.calls).some((o: any) => o.op === 'SET_SPECIALIZATIONS'))
  check('6 specialize: saved, plan leads with Cybersecurity', afterSpec.inputs.targetIds[0] === 'cybersecurity', afterSpec.inputs.targetIds.join(','))
  await termQuestion('6b term', "What's planned for me in Winter 2028 now?", 'Winter 2028')

  // 7
  for (const [said, when] of [['Is there a seat open in CMPT 370 this semester?', 'Fall 2026'], ['What about next term?', 'Winter 2027']] as const) {
    const s7 = await step(said, null)
    const seat = s7.calls.find((c) => c.name === 'check_seats')
    check(`7 seats (${when}): used check_seats`, Boolean(seat), JSON.stringify(seat?.args))
    check(`7 seats (${when}): for the right term`, seat?.result.term === when, seat?.result.term)
    const st = seat?.result.status
    const matches =
      st === 'open' ? new RegExp(`\\b${seat.result.seatsOpen}\\b|open|available`, 'i').test(s7.text)
      : st === 'not_running' ? /not (running|offered)|isn't (running|offered)|no (sections|classes)|doesn't run/i.test(s7.text)
      : st === 'full' || st === 'waitlist' ? /full|waitlist/i.test(s7.text)
      : true
    check(`7 seats (${when}): said what the class search shows (${st})`, matches, s7.text)
  }

  const version1 = (await db().generatedPlan.findFirst({ where: { user: { authUid: 'baymax-demo-student' } } })).version
  console.log(`\nsaved versions this call: ${version1 - version0}`)
} finally {
  await hook({ type: 'end-of-call-report', endedReason: 'customer-ended-call' })
  await db().$disconnect()
}

const failed = results.filter(([, ok]) => !ok)
console.log(`\nmax-chat.ts: ${results.length - failed.length}/${results.length} checks passed${failed.length ? ` — FAILED: ${failed.map(([n]) => n).join('; ')}` : ''}`)
console.log('Now reseed the demo student: npm run db:seed:demo-student')
process.exit(failed.length ? 1 : 0)

// Real class registration: the request built from a plan, the section picker over real Banner rows,
// and the loader's fallbacks. Run:
//   node --experimental-strip-types --experimental-loader ./scripts/_resolve-ts-loader.mjs scripts/check-registration.ts
//
// Fixtures (scripts/fixtures/registration/*.json) are Winter 2027 (202701) rows from USask's public
// class search (banner.usask.ca searchResults, unauthenticated), taken 2026-09-27, cut down to the
// fields normalizeSection reads: instructor names and emails are stripped. They go through the real
// normalizeSection, so a change to it shows up here.
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { normalizeSection } from '../api/_banner.ts'
import type { Section } from '../src/lib/classTracker.ts'
import { MAX_SLOT_CANDIDATES, pickRealSchedule, placeSchedule, registrationRequest, slotPickLabel, type RegPick, type RegRequest } from '../src/lib/registration.ts'
import { computerScience } from '../src/data/programs/computerScience.ts'
import { usask } from '../src/data/schools/usask.ts'
import { completedCourses, inProgressCourses, inProgressTerms } from '../src/data/transcript.ts'
import { computeMatches } from '../src/lib/match.ts'
import { computeCredentials } from '../src/lib/credentials.ts'
import { buildStudentPlan, upcomingTerm, type Season } from '../src/lib/plan.ts'
import { bookedByTerm, seasonNow } from '../src/lib/currentTerms.ts'

type Raw = Record<string, unknown>
const raw = (code: string): Raw[] => JSON.parse(readFileSync(new URL(`./fixtures/registration/${code}.json`, import.meta.url), 'utf8'))
const CODES = ['CMPT145', 'CMPT280', 'CMPT340', 'CMPT353', 'MATH110', 'BIOL120', 'CHEM112']
const real: Record<string, Section[]> = Object.fromEntries(CODES.map((c) => [c, raw(c).map(normalizeSection)]))

/** A copy of a course's rows with every section open (no reserved split), for data that's full live. */
function opened(rows: Raw[], full: string[] = []): Section[] {
  return rows.map((r) =>
    normalizeSection({
      ...r,
      seatsAvailable: full.includes(String(r.sequenceNumber)) ? 0 : 20,
      maximumEnrollment: 40,
      waitAvailable: 0,
      reservedSeatSummary: null,
    }),
  )
}

const course = (code: string, title = code, slotLabel?: string) => ({ code, title, ...(slotLabel ? { slotLabel } : {}) })
const req = (courses: string[], booked: string[] = [], slots: RegRequest['slots'] = []): RegRequest => ({
  termLabel: 'Winter 2027',
  termCode: '202701',
  courses: courses.map((c) => course(c)),
  slots,
  booked: booked.map((c) => course(c)),
})
const mins = (t: string) => Number(t.slice(0, 2)) * 60 + Number(t.slice(3))
function assertClashFree(picks: RegPick[], label: string) {
  for (let i = 0; i < picks.length; i++) {
    for (let j = i + 1; j < picks.length; j++) {
      for (const a of picks[i].meetings) {
        for (const b of picks[j].meetings) {
          const clash = a.days.some((d) => b.days.includes(d)) && mins(a.start) < mins(b.end) && mins(b.start) < mins(a.end)
          assert.ok(!clash, `${label}: ${picks[i].code} ${picks[i].section} clashes with ${picks[j].code} ${picks[j].section}`)
        }
      }
    }
  }
}
const sectionOf = (code: string, crn: string) => real[code].find((s) => s.crn === crn)!

// ── normalizeSection: campus (leading space trimmed, entities decoded) and link identifiers ──
assert.equal(real.CMPT145[0].campus, 'USask - Main Saskatoon Campus')
assert.equal(real.MATH110.find((s) => s.sectionNumber === '96')!.campus, "St. Peter's College")
assert.equal(real.CMPT145.find((s) => s.sectionNumber === '04')!.linkIdentifier, 'M1')
assert.equal(real.CMPT145.find((s) => s.sectionNumber === 'L04')!.linkIdentifier, 'L1')
assert.equal(real.MATH110.find((s) => s.sectionNumber === '92')!.linkIdentifier, null)
assert.ok(real.CMPT145.every((s) => s.instructors.length === 0), 'fixtures carry no instructor names')

// ── CMPT 145: lecture 02 is full, so 04 (27177), with an open lab of its link group ──
const only145 = pickRealSchedule(req(['CMPT145']), real)
assert.deepEqual(only145.unplaced, [])
assert.equal(only145.picks[0].crn, '27177', 'CMPT 145 takes lecture 04 while 02 is full')
assert.equal(only145.picks[0].section, '04')
assert.equal(only145.picks.length, 2, 'CMPT 145: one lecture and one lab')
const lab145 = sectionOf('CMPT145', only145.picks[1].crn)
assert.equal(lab145.linkIdentifier, 'L1', 'the lab is in lecture M1’s group')
assert.equal(lab145.status, 'open')
assert.equal(only145.picks[1].section, 'L04', 'L02 is full, so the first open lab is L04 (Thu 16:00)')
assert.deepEqual(only145.picks[1].meetings, [{ days: ['Thu'], start: '16:00', end: '17:20' }])
assert.deepEqual(only145.picks[0].meetings, [{ days: ['Mon', 'Wed', 'Fri'], start: '08:30', end: '09:20' }])
// Credit units only on the lecture, although Banner's creditHourHigh gives the lab 3.
assert.equal(real.CMPT145.find((s) => s.sectionNumber === 'L04')!.creditHours, 3)
assert.equal(only145.picks[0].credits, 3)
assert.equal(only145.picks[1].credits, 0)
assert.equal(only145.picks[0].main, true)
assert.equal(only145.picks[1].main, false)
assert.equal(only145.picks[1].type, 'Laboratory')
assert.deepEqual(only145.crns, ['27177', '26267'])

// ── CMPT 145 + CMPT 280 together: clash-free, 280 at 14:30 with one tutorial ──
const both = pickRealSchedule(req(['CMPT145', 'CMPT280']), real)
assert.deepEqual(both.unplaced, [])
assertClashFree(both.picks, '145+280')
const lec280 = both.picks.find((p) => p.code === 'CMPT280' && p.main)!
assert.equal(lec280.section, '02', 'CMPT 280 takes lecture 02 (14:30), not 04 (08:30, CMPT 145’s time)')
assert.equal(lec280.meetings[0].start, '14:30')
assert.equal(both.picks.filter((p) => p.code === 'CMPT280' && !p.main).length, 1, 'CMPT 280: one tutorial')
assert.equal(both.picks.find((p) => p.code === 'CMPT280' && !p.main)!.type, 'Tutorial')
assert.deepEqual(
  both.crns,
  both.picks.map((p) => p.crn),
  'crns are the picks in order',
)
assert.deepEqual(both.picks.map((p) => [p.code, p.main]), [
  ['CMPT145', true],
  ['CMPT145', false],
  ['CMPT280', true],
  ['CMPT280', false],
], "each course's lecture, then its linked sections, in course order")
// With 280's 02 full, its only open lecture (04, MWF 08:30) clashes with 145's: unplaced, no sections.
const full280 = { ...real, CMPT280: real.CMPT280.map((s) => (s.sectionNumber === '02' ? { ...s, status: 'full' as const, seatsAvailable: 0, seatsAvailableUnreserved: 0 } : s)) }
const clash = pickRealSchedule(req(['CMPT145', 'CMPT280']), full280)
assert.equal(clash.unplaced.length, 1)
assert.equal(clash.unplaced[0].code, 'CMPT280')
assert.equal(clash.unplaced[0].reason, 'clash')
assert.match(clash.unplaced[0].text, /CMPT 145/)
assert.ok(!clash.picks.some((p) => p.code === 'CMPT280'), 'an unplaced course contributes no sections')
assert.ok(!clash.crns.some((crn) => real.CMPT280.some((s) => s.crn === crn)))

// ── link groups pair by their trailing group: BIOL 120 lecture M2 only takes L2 labs ──
const biolOpen = opened(raw('BIOL120'), ['01'])
const biol = pickRealSchedule(req(['BIOL120']), { BIOL120: biolOpen })
assert.equal(biol.picks[0].section, '02', 'with 01 full, BIOL 120 takes lecture 02 (M2)')
const biolLab = biolOpen.find((s) => s.crn === biol.picks[1].crn)!
assert.equal(biolLab.linkIdentifier, 'L2', 'lecture M2 pairs with an L2 lab, not an L1 one')
assert.equal(biolLab.sectionNumber, 'L01')
const biolM1 = pickRealSchedule(req(['BIOL120']), { BIOL120: opened(raw('BIOL120')) })
assert.equal(biolM1.picks[0].section, '01')
assert.equal(opened(raw('BIOL120')).find((s) => s.crn === biolM1.picks[1].crn)!.linkIdentifier, 'L1', 'lecture M1 pairs with an L1 lab')
// Every L2 lab clashing with something held: lecture 02 is given up for lecture 03 and its L3 lab.
const biolBlocked = placeSchedule(
  {
    ...req(['BIOL120']),
    booked: [course('CMPT340')],
  },
  {
    BIOL120: opened(raw('BIOL120'), ['01']).map((s) => (s.linkIdentifier === 'L2' ? { ...s, meetings: [{ ...s.meetings[0], days: ['monday', 'wednesday', 'friday'], beginTime: '1030', endTime: '1120' }] } : s)),
    CMPT340: real.CMPT340,
  },
)
assert.equal(biolBlocked.picks[0].section, '03', 'no L2 lab fits, so the next lecture group (M3) is tried')
assert.equal(biolBlocked.picks[1].section, 'L23')

// ── a full course is unplaced 'full': BIOL 120's main-campus lectures are all full ──
const fullBiol = pickRealSchedule(req(['BIOL120']), real)
assert.equal(fullBiol.picks.length, 0, 'the open Prince Albert and Northlands sections are never picked')
assert.equal(fullBiol.unplaced[0].reason, 'full')
assert.equal(fullBiol.unplaced[0].text, 'All main-campus sections of BIOL 120 are full')
// Not running at all.
const none = pickRealSchedule(req(['CMPT214']), { CMPT214: [] })
assert.equal(none.unplaced[0].reason, 'not-offered')

// ── booked CMPT 340 + CMPT 353 hold their times ──
const chemFree = pickRealSchedule(req(['CHEM112']), real)
assert.deepEqual(
  chemFree.picks.map((p) => p.section),
  ['04', 'LC4'],
  'CHEM 112: 02 has only reserved seats left, so 04; LC4 (Mon 13:30) is the first open lab',
)
const withBooked = pickRealSchedule(req(['CHEM112'], ['CMPT340', 'CMPT353']), real)
assert.deepEqual(
  withBooked.booked.map((b) => [b.code, b.section, b.crn]),
  [
    ['CMPT340', '04', '28326'],
    ['CMPT353', '02', '30463'],
  ],
  'a booked course is shown in its first main-campus lecture',
)
assert.deepEqual(withBooked.booked[0].meetings, [{ days: ['Mon', 'Wed', 'Fri'], start: '10:30', end: '11:20' }], 'CMPT 340’s MW and F meetings merge')
assert.ok(!withBooked.crns.includes('28326') && !withBooked.crns.includes('30463'), 'booked courses are never re-registered')
assert.deepEqual(withBooked.picks.map((p) => p.section), ['04', 'LH6'], 'LC4 clashes with booked CMPT 353 (MWF 13:30), so LH6')
assertClashFree([...withBooked.booked, ...withBooked.picks], 'CHEM 112 around the booked courses')
assert.ok(!withBooked.picks.some((p) => p.section === 'T92'), 'an unlinked tutorial is never added')
// A course that only runs at a booked course's time clashes.
const at1030 = real.MATH110.filter((s) => s.sectionNumber === '92').map((s) => ({ ...s, status: 'open' as const, seatsAvailable: 5, hasReservedSeats: false, seatsAvailableUnreserved: null }))
const blocked = pickRealSchedule(req(['MATH110'], ['CMPT340']), { MATH110: at1030, CMPT340: real.CMPT340 })
assert.equal(blocked.unplaced[0].reason, 'clash')
assert.equal(blocked.unplaced[0].text, 'Every open section of MATH 110 clashes with CMPT 340')

// ── campus: MATH 110's St. Peter's, off-campus and online sections are never picked ──
const mathLive = pickRealSchedule(req(['MATH110']), real)
assert.equal(mathLive.unplaced[0].reason, 'full', 'MATH 110: every main-campus lecture is full; St. Peter’s 96 and W02 are open but off campus')
const mathOpen = opened(raw('MATH110'), ['02', '04', '92'])
const mathOff = pickRealSchedule(req(['MATH110']), { MATH110: mathOpen })
assert.equal(mathOff.picks.length, 0)
assert.equal(mathOff.unplaced[0].reason, 'full')
const mathAll = pickRealSchedule(req(['MATH110']), { MATH110: opened(raw('MATH110')) })
assert.ok(mathAll.picks.length > 0)
for (const p of mathAll.picks) assert.equal(opened(raw('MATH110')).find((s) => s.crn === p.crn)!.campus, 'USask - Main Saskatoon Campus')
assert.equal(mathAll.picks[0].section, '02')
assert.equal(opened(raw('MATH110')).find((s) => s.crn === mathAll.picks[1].crn)!.linkIdentifier, 'L2')

// ── rows from an older API (no campus, no link identifier) still produce a pick ──
const oldApi = real.CMPT145.map(({ campus: _c, linkIdentifier: _l, ...s }) => s as Section)
const old = pickRealSchedule(req(['CMPT145']), { CMPT145: oldApi })
assert.deepEqual(old.crns, ['27177', '26267'], 'without link identifiers, any linked lab of the course')
const oldMath = pickRealSchedule(req(['MATH110']), { MATH110: opened(raw('MATH110')).map(({ campus: _c, linkIdentifier: _l, ...s }) => s as Section) })
assert.ok(!oldMath.picks.some((p) => p.section.startsWith('W')), 'without a campus, web sections are left out')

// ── determinism: same input, same answer, whatever order Banner lists sections in ──
const shuffled = Object.fromEntries(Object.entries(real).map(([c, list]) => [c, [...list].reverse()]))
const big = req(['CMPT145', 'CMPT280', 'CHEM112'], ['CMPT340', 'CMPT353'])
assert.deepEqual(pickRealSchedule(big, real), pickRealSchedule(big, real))
assert.deepEqual(pickRealSchedule(big, real), pickRealSchedule(big, shuffled))
assertClashFree([...pickRealSchedule(big, real).booked, ...pickRealSchedule(big, real).picks], 'three courses around two booked')

// ── slots: candidates in order, first that places; a missing candidate was never looked up ──
const slotReq = req([], ['CMPT340', 'CMPT353'], [
  { label: 'Junior science', candidates: [course('BIOL120', 'Biology', 'Junior science'), course('CHEM112', 'Chemistry', 'Junior science'), course('GEOL121', 'Earth', 'Junior science')] },
])
const slotted = placeSchedule(slotReq, real)
assert.equal(slotted.slotCodes[0], 'CHEM112', 'BIOL 120 is full, so the slot takes CHEM 112')
assert.ok(slotted.picks.every((p) => p.slotLabel === 'Junior science'))
const noneFit = placeSchedule({ ...slotReq, slots: [{ ...slotReq.slots[0], candidates: slotReq.slots[0].candidates.slice(0, 1) }] }, real)
assert.equal(noneFit.slotCodes[0], null)
assert.equal(noneFit.unplaced[0].slotLabel, 'Junior science')
assert.equal(noneFit.unplaced[0].code, 'BIOL120')
assert.equal(noneFit.unplaced[0].reason, 'full')
// Two slots of one requirement never take the same course.
const twice = placeSchedule({ ...slotReq, slots: [slotReq.slots[0], slotReq.slots[0]] }, real)
assert.deepEqual(twice.slotCodes, ['CHEM112', null])
assert.equal(new Set(twice.picks.filter((p) => p.main).map((p) => p.code)).size, twice.picks.filter((p) => p.main).length)

// ── slotPickLabel ──
assert.equal(slotPickLabel('Indigenous learning'), "Max's pick for your Indigenous learning slot")
assert.equal(slotPickLabel('Junior science: Biology, Chemistry or Earth Science'), "Max's pick for your junior science slot")
assert.equal(slotPickLabel('English writing'), "Max's pick for your English writing slot")
assert.equal(slotPickLabel('Senior CMPT elective'), "Max's pick for your senior CMPT elective slot")
assert.equal(slotPickLabel('CMPT elective (410 or higher)'), "Max's pick for your CMPT elective (410 or higher) slot")

// ── registrationRequest for the sample student, built the way App.tsx builds the plan ──
const TODAY = new Date(2026, 8, 27)
const SEASONS: Season[] = ['Fall', 'Winter', 'Spring/Summer']
const completed = new Set(completedCourses)
const inProgress = inProgressCourses.filter((c) => !completed.has(c))
const current = seasonNow(TODAY)
const from = SEASONS.indexOf(current)
const currentByTerm = [...SEASONS.slice(from), ...SEASONS.slice(0, from)]
  .map((season) => ({ season, courses: inProgress.filter((code) => ((inProgressTerms as Record<string, Season>)[code] ?? current) === season) }))
  .filter((g) => g.courses.length > 0)
const booked = bookedByTerm(currentByTerm, TODAY)
const degree = computerScience.degree!
const matches = computeMatches(computerScience.specializations, completed, degree)
const credentials = computeCredentials(usask.programs, completed, computerScience.id)
const plan = buildStudentPlan([matches[0]].filter((m) => m.remaining > 0).map((m) => m.spec), [...computerScience.specializations, ...credentials.map((c) => c.spec)], completed, inProgress, 5, upcomingTerm(TODAY), {
  springSummer: false,
  summerPerTerm: 2,
  degree,
  booked,
})
const sample = registrationRequest({ plan, booked, degree, taken: [...completed, ...inProgress] })
assert.ok(sample, 'the sample student has something to register for')
assert.equal(sample.termLabel, 'Winter 2027')
assert.equal(sample.termCode, '202701')
assert.deepEqual(sample.booked.map((c) => c.code).sort(), ['CMPT340', 'CMPT353', 'CMPT434'])
assert.deepEqual(sample.courses, [], "the sample's Winter 2027 names no course beyond what's booked")
assert.equal(sample.slots.length, 2)
assert.equal(sample.slots[0].label, 'Indigenous learning')
assert.match(sample.slots[1].label, /^Junior science/)
const takenAll = new Set([...completed, ...inProgress])
for (const slot of sample.slots) {
  assert.ok(slot.candidates.length > 0 && slot.candidates.length <= MAX_SLOT_CANDIDATES, `${slot.label}: 1-${MAX_SLOT_CANDIDATES} candidates`)
  for (const c of slot.candidates) {
    assert.equal(c.slotLabel, slot.label)
    assert.ok(!takenAll.has(c.code), `${slot.label}: ${c.code} isn't taken already`)
    assert.ok(c.title && c.title !== c.code, `${c.code} has its catalogue title`)
  }
}
assert.equal(sample.slots[0].candidates[0].code, 'INDG107', 'Indigenous learning: INDG 107 first')
const scienceAreas = new Set(['BIOL120', 'BIOL121', 'CHEM112', 'CHEM115', 'CHEM250', 'GEOG120', 'GEOL121', 'GEOL122'])
assert.ok(sample.slots[1].candidates.every((c) => scienceAreas.has(c.code)), 'Junior science: only the areas its label leaves open')
// Nothing left to register: null.
assert.equal(registrationRequest({ plan: [], booked: {}, degree, taken: [] }), null)
assert.equal(registrationRequest({ plan: [{ label: 'Winter 2027', courses: [{ code: 'elective:0:Free elective', reason: 'elective', alsoAdvances: [] }] }], booked: {}, degree, taken: [] }), null)

// ── loadRegistration: live, retry, cache, offline, two at a time, abort ──
const store = new Map<string, string>()
Object.assign(globalThis, {
  localStorage: {
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => void store.set(k, v),
    removeItem: (k: string) => void store.delete(k),
  },
})
const { loadRegistration } = await import('../src/lib/registrationData.ts')
let mode: 'live' | 'down' | 'empty-once' = 'live'
let inFlight = 0
let maxInFlight = 0
const asked: string[] = []
const emptied = new Set<string>()
globalThis.fetch = (async (input: string | URL, init?: RequestInit) => {
  const url = new URL(String(input), 'http://localhost')
  inFlight++
  maxInFlight = Math.max(maxInFlight, inFlight)
  try {
    await new Promise((r) => setTimeout(r, 5))
    if (init?.signal?.aborted) throw Object.assign(new Error('aborted'), { name: 'AbortError' })
    if (mode === 'down') throw new TypeError('network down')
    const body =
      url.searchParams.get('op') === 'terms'
        ? { terms: [{ code: '202701', description: 'Winter 2027', viewOnly: false }] }
        : (() => {
            const code = url.searchParams.get('course')!
            asked.push(code)
            if (mode === 'empty-once' && !emptied.has(code)) {
              emptied.add(code)
              return { sections: [] }
            }
            return { sections: real[code] ?? [] }
          })()
    return new Response(JSON.stringify(body), { status: 200, headers: { 'Content-Type': 'application/json' } })
  } finally {
    inFlight--
  }
}) as typeof fetch

const live = await loadRegistration(slotReq)
assert.equal(live.source, 'live')
assert.equal(live.termOpen, true)
assert.ok(live.fetchedAt)
assert.ok(maxInFlight <= 2, `at most two requests at once (saw ${maxInFlight})`)
assert.deepEqual(live.picks.map((p) => p.code), ['CHEM112', 'CHEM112'])
assert.ok(!asked.includes('GEOL121'), 'a slot stops looking once a candidate places')
assert.deepEqual(live.request, slotReq)
assert.ok(store.has('studymax:sections:202701:CHEM112'), 'a good answer is kept on the device')

mode = 'empty-once'
asked.length = 0
const t0 = Date.now()
const retried = await loadRegistration(req(['CMPT145']))
assert.equal(asked.filter((c) => c === 'CMPT145').length, 2, 'an empty answer gets one second look')
assert.ok(Date.now() - t0 >= 1100, 'after a pause')
assert.deepEqual(retried.crns, ['27177', '26267'])
assert.equal(retried.source, 'live')

mode = 'down'
const cachedPlan = await loadRegistration(slotReq)
assert.equal(cachedPlan.source, 'cached')
assert.equal(cachedPlan.termOpen, null)
assert.deepEqual(cachedPlan.crns, live.crns)
assert.ok(cachedPlan.fetchedAt && cachedPlan.fetchedAt <= live.fetchedAt!)

store.clear()
const offline = await loadRegistration(req(['CMPT370', 'CMPT371'], ['CMPT340']))
assert.equal(offline.source, 'offline')
assert.equal(offline.fetchedAt, null)
assert.equal(offline.picks.filter((p) => p.main).length, 2, 'offline: practice sections still make a schedule')
assertClashFree([...offline.booked, ...offline.picks], 'offline')

mode = 'live'
const controller = new AbortController()
const aborted = loadRegistration(req(['CMPT145', 'CMPT280']), { signal: controller.signal })
controller.abort()
await assert.rejects(aborted, (e: Error) => e.name === 'AbortError')

const s = pickRealSchedule(big, real)
console.log(
  `check-registration: ok. ${s.picks.length} sections for CMPT 145, 280 and CHEM 112 around CMPT 340 and 353: ${s.picks.map((p) => `${p.code} ${p.section}`).join(', ')}. Sample Winter 2027 slots: ${sample.slots.map((x) => `${x.label} [${x.candidates.map((c) => c.code).join(' ')}]`).join('; ')}`,
)

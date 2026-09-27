// The degree contract: every plan StudyMax draws must be a real, rule-abiding path through a real
// degree. This builds plans exactly as App.tsx does (buildStudentPlan with the program's degree, the
// in-progress courses booked in their own terms, the skill tree from layoutSkillTree) and checks them
// against the published rules, which are encoded HERE, independently of the engine's own data, so the
// engine can't grade itself.
//
// Run: node --experimental-strip-types --experimental-loader ./scripts/_resolve-ts-loader.mjs scripts/check-degree.ts
//   --p0       exit status ignores I5 (the credit-unit degree rules land in P1)
//   --legacy   call buildStudentPlan with its old positional arguments (main before the options object)
//   --verbose  print every violation, not just a sample
//
// Sources (2026-27 catalogue, effective May 1 2026 to April 30 2027):
//   https://programs.usask.ca/arts-and-science/computer-science/bsc-4-computer-science.php  C1-C5 lists
//   https://programs.usask.ca/arts-and-science/policies.php  120 cu, 66 senior, 15 cu per Fall/Winter term
//   https://www.cs.usask.ca/documents/advising/2024-bsc-4y-advising.pdf  Y1/Y2/Y3-4 tags per slot
//   https://www.cs.usask.ca/students/undergraduate/undergraduate-programs/templates/bsc-four-year.php
//     "Never take 12cu of CMPT courses (or more) in a single term at 300- and 400-level"
import { readFileSync } from 'node:fs'
import { computerScience } from '../src/data/programs/computerScience.ts'
import { usask } from '../src/data/schools/usask.ts'
import { courseInfo } from '../src/data/prereqs.ts'
import { creditPrereqs } from '../src/data/creditPrereqs.ts'
import { offerings } from '../src/data/offerings.ts'
import { catalogueCourses } from '../src/data/courses.ts'
import { completedCourses as sampleCompleted, inProgressCourses as sampleInProgress, inProgressTerms as sampleTerms } from '../src/data/transcript.ts'
import { computeCourseOverlap, computeMatches, type SpecializationMatch } from '../src/lib/match.ts'
import { computeCredentials } from '../src/lib/credentials.ts'
import { buildStudentPlan, DEFAULT_SUMMER_COURSES, electiveLabel, isElective, upcomingTerm, type PlannedTerm, type Season, type TermStart } from '../src/lib/plan.ts'
import { bookedByTerm, seasonNow, termLabel, withCurrentCourses } from '../src/lib/currentTerms.ts'
import { currentTermOf, layoutSkillTree, treeTargets } from '../src/lib/skillTree.ts'
import type { Specialization } from '../src/data/specializations.ts'

const LEGACY = process.argv.includes('--legacy')
const P0 = process.argv.includes('--p0')
const VERBOSE = process.argv.includes('--verbose')
const TODAY = new Date(2026, 8, 26) // demo day: Fall 2026 is running, Winter 2027 is next
const LOAD = 5 // A&S: "a maximum of 30 credit units (15 credit units per term) in Fall and Winter"
const MAX_CU = 15
const MAX_SENIOR_CMPT = 3

// Breadth program types from Banner, once T2's map exists (senior Humanities/Social Science courses).
let breadthTypes: Record<string, string[]> = {}
try {
  const mod = await import('../src/data/breadth.ts')
  breadthTypes = (mod as { breadth?: Record<string, string[]> }).breadth ?? {}
} catch {
  // Not generated yet: only the page's junior lists classify breadth.
}

// ───────────────────────── the published rules, independently ─────────────────────────

const codes = (s: string) => s.trim().split(/\s+/)
const catalogue = new Set(catalogueCourses.map((c) => c.code))
const cuOf = (code: string) => (isElective(code) ? 3 : (courseInfo[code]?.creditUnits ?? 3))
const levelOf = (code: string) => Number(code.match(/\d/)?.[0] ?? 0) * 100
const subjectOf = (code: string) => code.match(/^[A-Z]+/)?.[0] ?? ''
const numberOf = (code: string) => Number(code.match(/\d+/)?.[0] ?? 0)

const ELW = codes(`ANTH302 ANTH306 ANTH310 ANTH421 CMRS110 CMRS111 CPSJ203 ENG110 ENG111 ENG112 ENG113 ENG114 ENG120
  ENG210 ENG211 ENG212 ENG213 ENG394 ESL116 HIST115 HIST125 HIST135 HIST145 HIST155 HIST165 HIST175 HIST185 HIST193
  HIST194 MUS155 PHIL120 PHIL121 PHIL133 PHIL208 PHIL233 POLS236 POLS237 PSY323 PSY355 RLST280`)
const IL = codes(`ANTH202 ANTH350 ANTH480 DRAM111 ENG242 ENG243 ENG335 ENG338 GEOG465 HIST195 HIST257 HIST266 HIST315
  HIST316 INDG107 LING114 LING253 PLAN445 POLS222`)
const FINE_ARTS = codes(`ART110 ART122 ART123 ART124 ART125 ART136 ART141 ART151 ART152 ART161 ARTH120 ARTH121 DRAM101
  DRAM108 DRAM110 DRAM111 DRAM113 DRAM118 DRAM119 DRAM121 MUS101 MUS102 MUS104 MUS111 MUS112 MUS120 MUS121 MUS125
  MUS133 MUS134 MUS155 MUS156 MUS175 MUS184`)
const HUMANITIES = codes(`ARBC114 ARBC117 CHIN114 CHIN117 CLAS110 CLAS111 CMRS110 CMRS111 CREE101 CREE110 DENE110
  ENG110 ENG111 ENG112 ENG113 ENG114 ENG120 ESL115 ESL116 FREN103 FREN104 FREN106 FREN122 FREN123 FREN125 FREN160
  FREN218 GENS112 GERM114 GERM117 GRK112 GRK113 HEB114 HEB117 HIST115 HIST125 HIST135 HIST145 HIST155 HIST165 HIST175
  HIST185 HIST193 HIST194 HIST195 HNDI114 HNDI117 JPNS114 JPNS117 LATN112 LATN113 LING110 LING113 LING114 LIT110 LIT111
  MUS101 MUS111 MUS112 PHIL110 PHIL115 PHIL120 PHIL121 PHIL133 PHIL140 RLST111 RLST112 RLST113 SPAN114 SPAN117 UKR114
  UKR117`)
const SOCIAL = codes(`ANTH111 ANTH112 ANTH116 ECON111 ECON114 GENS112 GEOG130 HLST110 INDG107 LING111 LING112 LING113
  LING114 POLS110 POLS111 POLS112 PSY120 PSY121 SOC111 SOC112`)
const NO_TYPE = codes('CPSJ112 CPSJ203 INTS110 INTS111 INTS380')
const BREADTH_EXCLUDED = new Set(codes('CLAS101 CLAS103 CLAS104 CLAS105 CLAS107 CLAS203 PSY233 PSY234 SOC225 SOC325 MATH101 MATH102 STAT244'))
const SCIENCE_AREAS: Record<string, string[]> = {
  Biology: codes('BIOL120 BIOL121'),
  Chemistry: codes('CHEM112 CHEM115 CHEM250'),
  'Earth Science': codes('GEOG120 GEOL121 GEOL122'),
  'Physics & Astronomy': codes('ASTR113 ASTR213 PHYS115 PHYS117 PHYS125'),
}
const BUSINESS = codes('AREC230 COMM101 COMM105 COMM201 COMM203 COMM204 COMM205 COMM210 COMM304 ECON111 ECON114')
const CORE_SENIOR = codes('CMPT317 CMPT332 CMPT340 CMPT353 CMPT360 CMPT370 CMPT381')
const MATH_LIST = codes('MATH116 MATH134 MATH177 MATH211 MATH223 MATH225 MATH266 MATH276 MATH327 MATH328 MATH361 MATH362 MATH364 STAT241 STAT344 STAT345 STAT348 PHIL243')
const CORE_200 = ['CMPT214', 'CMPT215|CME331', 'CMPT260|CMPT263', 'CMPT270', 'CMPT280']

const humSoc = (code: string) =>
  HUMANITIES.includes(code) || SOCIAL.includes(code) || (levelOf(code) >= 200 && (breadthTypes[code] ?? []).some((t) => t === 'HUM' || t === 'SOCS'))
const breadthOk = (code: string) =>
  !BREADTH_EXCLUDED.has(code) &&
  (FINE_ARTS.includes(code) || HUMANITIES.includes(code) || SOCIAL.includes(code) || NO_TYPE.includes(code) ||
    (levelOf(code) >= 200 && (breadthTypes[code] ?? []).some((t) => t === 'HUM' || t === 'SOCS' || t === 'FNAR')))

interface Rule {
  id: string
  needCu: number
  accepts: (code: string) => boolean
  /** Unnamed plan slots that fill this rule, by label. */
  slot?: RegExp
  /** At most one of each set counts. */
  oneOf?: string[][]
  /** Counts only when every course of the set is present. */
  allOf?: string[][]
  /** Subject-capped: C1, C2 and C3's junior courses (6 cu per subject; 9 across ELW + IL). */
  capped?: boolean
  areas?: Record<string, string[]>
}
const one = (id: string, list: string[]): Rule => ({ id, needCu: 3, accepts: (c) => list.includes(c), oneOf: [list] })
const RULES: Rule[] = [
  { id: 'C1 English writing', needCu: 6, accepts: (c) => ELW.includes(c), slot: /english writing/i, capped: true },
  { id: 'C1 Indigenous learning', needCu: 3, accepts: (c) => IL.includes(c) || (subjectOf(c) === 'INDG' && levelOf(c) >= 200), slot: /indigenous/i, capped: true },
  { id: 'C1 MATH 163', needCu: 3, accepts: (c) => c === 'MATH163', capped: true },
  { id: 'C1 MATH 164', needCu: 3, accepts: (c) => c === 'MATH164', capped: true },
  { id: 'C2 Breadth', needCu: 9, accepts: breadthOk, slot: /breadth/i, capped: true },
  { id: 'C3 Junior science', needCu: 9, accepts: (c) => Object.values(SCIENCE_AREAS).flat().includes(c), slot: /science/i, oneOf: [['PHYS117', 'PHYS125']], capped: true, areas: SCIENCE_AREAS },
  one('C3 PHIL 232 or GE 449', ['PHIL232', 'GE449']),
  { id: 'C3 MATH 110/133/176', needCu: 3, accepts: (c) => ['MATH110', 'MATH133', 'MATH176'].includes(c) },
  { id: 'C3 Business', needCu: 3, accepts: (c) => BUSINESS.includes(c), slot: /business|economics/i },
  one('C4 CMPT 141', ['CMPT141', 'CMPT116']),
  one('C4 CMPT 145', ['CMPT145', 'CMPT117']),
  one('C4 CMPT 214', ['CMPT214']),
  one('C4 CMPT 215', ['CMPT215', 'CME331']),
  one('C4 CMPT 263', ['CMPT260', 'CMPT263']),
  one('C4 CMPT 270', ['CMPT270']),
  one('C4 CMPT 280', ['CMPT280']),
  { id: 'C4 Senior core', needCu: 18, accepts: (c) => CORE_SENIOR.includes(c) },
  { id: 'C4 CMPT 410+', needCu: 6, accepts: (c) => subjectOf(c) === 'CMPT' && numberOf(c) >= 410, slot: /410/ },
  {
    id: 'C4 Upper CMPT',
    needCu: 3,
    accepts: (c) => (subjectOf(c) === 'CMPT' && levelOf(c) >= 300) || ['CME332', 'CME341', 'CME342', 'CME433', 'CME435'].includes(c),
    slot: /senior cmpt|upper/i,
  },
  one('C4 Statistics', ['STAT242', 'STAT245', 'EE216']),
  { id: 'C4 Math list', needCu: 6, accepts: (c) => MATH_LIST.includes(c), slot: /math|statistic/i, oneOf: [['MATH116', 'MATH134', 'MATH177']], allOf: [['MATH361', 'MATH362']] },
]
// Slot labels are matched in this order ("Senior CMPT elective" before "Senior elective").
const SLOT_ORDER = ['C2 Breadth', 'C1 English writing', 'C1 Indigenous learning', 'C3 Business', 'C4 CMPT 410+', 'C4 Upper CMPT', 'C4 Math list', 'C3 Junior science']
const SENIOR_SLOT = /senior|200-level or higher|410/i
function ruleForSlot(label: string): Rule | null {
  if (/senior elective|200-level or higher|free elective/i.test(label)) return null
  for (const id of SLOT_ORDER) {
    const rule = RULES.find((r) => r.id === id)!
    if (rule.slot!.test(label)) return rule
  }
  return null
}

interface Audit {
  shortBy: Record<string, number>
  totalCu: number
  seniorCu: number
  problems: string[]
}

/** Credits every course and slot to at most one rule, maximising what's counted, then checks the degree. */
function auditPlan(named: string[], slots: string[]): Audit {
  const problems: string[] = []
  const all = new Set(named)
  const credit = new Map<string, string[]>() // rule id → courses/slots credited
  for (const r of RULES) credit.set(r.id, [])
  const creditedCu = (r: Rule, extra?: string) => {
    const list = [...credit.get(r.id)!, ...(extra ? [extra] : [])]
    let cu = 0
    const usedSets = new Set<number>()
    const byArea = new Map<string, number>()
    for (const code of list) {
      if (isElective(code)) {
        cu += 3
        continue
      }
      const set = (r.oneOf ?? []).findIndex((s) => s.includes(code))
      if (set >= 0) {
        if (usedSets.has(set)) continue
        usedSets.add(set)
      }
      if ((r.allOf ?? []).some((s) => s.includes(code) && !s.every((x) => all.has(x)))) continue
      const area = r.areas ? Object.keys(r.areas).find((a) => r.areas![a].includes(code)) : undefined
      if (area) {
        const before = byArea.get(area) ?? 0
        const add = Math.max(0, Math.min(cuOf(code), 6 - before))
        byArea.set(area, before + cuOf(code))
        cu += add
        continue
      }
      cu += cuOf(code)
    }
    return Math.min(r.needCu, cu)
  }
  const room = (r: Rule) => r.needCu - creditedCu(r)
  const gain = (r: Rule, code: string) => creditedCu(r, code) - creditedCu(r)
  const cappedCu = (subject: string) =>
    RULES.filter((r) => r.capped).reduce((n, r) => n + credit.get(r.id)!.filter((c) => subjectOf(c) === subject).reduce((m, c) => m + cuOf(c), 0), 0)
  const capOk = (r: Rule, code: string) => {
    if (!r.capped) return true
    const subject = subjectOf(code)
    const after = cappedCu(subject) + cuOf(code)
    if (after <= 6) return true
    // The exception: 9 cu of one subject when it covers English writing and Indigenous learning.
    const inWritingOrIL = RULES.filter((x) => x.id === 'C1 English writing' || x.id === 'C1 Indigenous learning')
    const elsewhere = RULES.filter((x) => x.capped && !inWritingOrIL.includes(x)).some((x) => credit.get(x.id)!.some((c) => subjectOf(c) === subject))
    return after <= 9 && inWritingOrIL.includes(r) && !elsewhere
  }

  for (const slot of slots) {
    const rule = ruleForSlot(electiveLabel(slot))
    if (rule && room(rule) > 0) credit.get(rule.id)!.push(slot)
  }
  // Most-constrained courses first; a course whose rules are full may bump one that has another home.
  const candidates = (code: string) => RULES.filter((r) => r.accepts(code))
  const order = [...named].sort((a, b) => candidates(a).length - candidates(b).length || a.localeCompare(b))
  const place = (code: string, depth: number): boolean => {
    for (const r of candidates(code)) {
      if (gain(r, code) > 0 && capOk(r, code)) {
        credit.get(r.id)!.push(code)
        return true
      }
    }
    if (depth > 0) {
      for (const r of candidates(code)) {
        for (const other of [...credit.get(r.id)!]) {
          if (isElective(other)) continue
          const list = credit.get(r.id)!
          list.splice(list.indexOf(other), 1)
          if (gain(r, code) > 0 && capOk(r, code) && place(other, depth - 1)) {
            list.push(code)
            return true
          }
          list.push(other)
        }
      }
    }
    return false
  }
  for (const code of order) place(code, 2)

  const shortBy: Record<string, number> = {}
  for (const r of RULES) {
    const got = creditedCu(r)
    if (got < r.needCu) shortBy[r.id] = r.needCu - got
  }
  for (const [id, cu] of Object.entries(shortBy)) problems.push(`${id} short by ${cu} cu`)

  // C2: at least 3 cu from Humanities or Social Science.
  const c2 = credit.get('C2 Breadth')!
  const humSocCu = c2.reduce((n, c) => n + (isElective(c) ? (/humanities or social science/i.test(electiveLabel(c)) ? 3 : 0) : humSoc(c) ? cuOf(c) : 0), 0)
  if (humSocCu < 3) problems.push(`C2 has ${humSocCu} cu of Humanities or Social Science (needs 3)`)

  // Totals: 120 cu, at least 66 of them at the 200 level or higher (so at most 54 junior count).
  let junior = 0
  let senior = 0
  for (const code of named) {
    if (levelOf(code) >= 200) senior += cuOf(code)
    else junior += cuOf(code)
  }
  for (const slot of slots) {
    if (SENIOR_SLOT.test(electiveLabel(slot))) senior += 3
    else junior += 3
  }
  const totalCu = senior + Math.min(junior, 54)
  if (totalCu < 120) problems.push(`degree totals ${totalCu} cu that count (needs 120; ${junior} junior, of which at most 54 count)`)
  if (senior < 66) problems.push(`${senior} cu at the 200 level or higher (needs 66)`)
  return { shortBy, totalCu, seniorCu: senior, problems }
}

// ───────────────────────── the plans, built as App.tsx builds them ─────────────────────────

const SEASONS: Season[] = ['Fall', 'Winter', 'Spring/Summer']
const RANK: Record<Season, number> = { Winter: 0, 'Spring/Summer': 1, Fall: 2 }
const parse = (label: string) => {
  const m = label.match(/^(Fall|Winter|Spring\/Summer) (\d{4})$/)
  return m ? { season: m[1] as Season, year: Number(m[2]) } : null
}
const orderOf = (label: string) => {
  const t = parse(label)
  return t ? t.year * 10 + RANK[t.season] : Number.MAX_SAFE_INTEGER
}

interface Case {
  name: string
  kind: 'sample' | 'A' | 'B' | 'C'
  spec?: Specialization
  completed: string[]
  inProgress: string[]
  terms: Record<string, Season>
  start: TermStart
}

type Legacy = (...args: unknown[]) => PlannedTerm[]

function build(c: Case) {
  const completed = new Set(c.completed)
  const inProgress = c.inProgress.filter((code) => !completed.has(code))
  const current = seasonNow(TODAY)
  const from = SEASONS.indexOf(current)
  const currentByTerm = [...SEASONS.slice(from), ...SEASONS.slice(0, from)]
    .map((season) => ({ season, courses: inProgress.filter((code) => (c.terms[code] ?? current) === season) }))
    .filter((g) => g.courses.length > 0)
  const booked = bookedByTerm(currentByTerm, TODAY)
  const specs = computerScience.specializations
  const matches = computeMatches(specs, completed)
  const credentials = computeCredentials(usask.programs, completed, computerScience.id)
  const planningSpecs = [...specs, ...credentials.map((x) => x.spec)]
  const hero = c.spec ? matches.find((m) => m.spec.id === c.spec!.id)! : matches[0]
  const targets = [hero].filter((m) => m.remaining > 0)
  const degree = computerScience.degree
  const plan = LEGACY
    ? (buildStudentPlan as unknown as Legacy)(targets.map((t) => t.spec), planningSpecs, completed, inProgress, LOAD, c.start, false, DEFAULT_SUMMER_COURSES, degree, booked)
    : buildStudentPlan(targets.map((t) => t.spec), planningSpecs, completed, inProgress, LOAD, c.start, {
        springSummer: false,
        summerPerTerm: DEFAULT_SUMMER_COURSES,
        degree,
        booked,
      } as never)
  const timeline = withCurrentCourses(plan, currentByTerm, TODAY)
  const inProgressTerms = Object.fromEntries(currentByTerm.flatMap((g) => g.courses.map((code) => [code, termLabel(g.season, TODAY)])))
  const tree = layoutSkillTree({
    completed,
    inProgress,
    plan,
    currentTerm: currentTermOf(TODAY),
    targets: treeTargets([{ match: hero, kind: 'specialization' }], credentials.map((x) => ({ match: x, kind: x.program.kind === 'minor' ? 'minor' : 'certificate' }))),
    bestNext: computeCourseOverlap(specs, completed)[0]?.course ?? null,
    width: 390,
    inProgressTerms,
    termLoad: LOAD,
    summerLoad: DEFAULT_SUMMER_COURSES,
  } as never)
  return { completed, inProgress, plan, timeline, tree, hero, matches, inProgressTerms }
}

// ───────────────────────── the invariants ─────────────────────────

type Inv = 'I1' | 'I2' | 'I3' | 'I4' | 'I5' | 'I6' | 'I7' | 'I8' | 'I9' | 'I10'
const INVS: Inv[] = ['I1', 'I2', 'I3', 'I4', 'I5', 'I6', 'I7', 'I8', 'I9', 'I10']

const runsIn = (code: string, season: Season): boolean | null => {
  const banner = offerings[code]
  if (banner && banner.length > 0) return banner.includes(season)
  const offered = courseInfo[code]?.offered
  if (!offered) return null
  if (offered === 'none') return null
  if (offered === 'either') return season !== 'Spring/Summer'
  if (offered === 'fall' || offered === 'full-year') return season === 'Fall'
  if (offered === 'winter') return season === 'Winter'
  return season === 'Spring/Summer'
}
const unscheduled = (code: string) => !(offerings[code]?.length) && courseInfo[code]?.offered === 'none'

function check(c: Case) {
  const v: Record<Inv, string[]> = Object.fromEntries(INVS.map((i) => [i, []])) as unknown as Record<Inv, string[]>
  const b = build(c)
  const { completed, inProgress, plan, timeline } = b
  const planned = plan.flatMap((t) => t.courses.map((x) => ({ ...x, term: t.label })))
  const named = planned.filter((x) => !isElective(x.code))
  const slots = planned.filter((x) => isElective(x.code))

  // I1: load, counting what's booked in each term.
  for (const t of timeline) {
    const season = parse(t.label)?.season
    const cap = season === 'Spring/Summer' ? DEFAULT_SUMMER_COURSES : LOAD
    const cu = t.courses.reduce((n, x) => n + cuOf(x.code), 0)
    if (!season) v.I1.push(`an unlabelled term "${t.label}"`)
    if (t.courses.length > cap) v.I1.push(`${t.label}: ${t.courses.length} courses (max ${cap})`)
    if (season !== 'Spring/Summer' && cu > MAX_CU) v.I1.push(`${t.label}: ${cu} cu (max ${MAX_CU})`)
  }

  // Everything passed before a term, and everything taken in it.
  const passedBefore = (label: string) => {
    const o = orderOf(label)
    const set = new Set(completed)
    for (const t of timeline) if (orderOf(t.label) < o) t.courses.forEach((x) => set.add(x.code))
    return set
  }
  const sameTerm = (label: string) => new Set(timeline.find((t) => t.label === label)?.courses.map((x) => x.code) ?? [])
  const cuIn = (set: Set<string>, pred: (code: string) => boolean = () => true) => [...set].filter((x) => !isElective(x) && pred(x)).reduce((n, x) => n + cuOf(x), 0)
  const allCu = (set: Set<string>) => [...set].reduce((n, x) => n + cuOf(x), 0)

  for (const x of named) {
    const season = parse(x.term)?.season
    // I2: offered in its season.
    if (season) {
      const ok = runsIn(x.code, season)
      if (ok === false) v.I2.push(`${x.code} in ${x.term}, but it runs ${(offerings[x.code] ?? [courseInfo[x.code]?.offered]).join('/')}`)
    }
    if (unscheduled(x.code)) v.I2.push(`${x.code} is not scheduled in 2025-27 (Banner) or 2026-27 (catalogue)`)
    if (!catalogue.has(x.code) && !courseInfo[x.code]) v.I2.push(`${x.code} is not in the 2026-27 catalogue`)

    // I3: prerequisites strictly before; concurrent ones may share the term.
    const before = passedBefore(x.term)
    const now = sameTerm(x.term)
    for (const group of courseInfo[x.code]?.requires ?? []) {
      if (group.length > 0 && !group.some((o) => before.has(o))) v.I3.push(`${x.code} (${x.term}) before its prerequisite ${group.join('/')}`)
    }
    for (const group of courseInfo[x.code]?.concurrent ?? []) {
      if (group.length > 0 && !group.some((o) => before.has(o) || now.has(o))) v.I3.push(`${x.code} (${x.term}) without its co-requisite ${group.join('/')}`)
    }
    for (const rule of [...(creditPrereqs[x.code] ?? []), ...(courseInfo[x.code]?.creditRequires ?? [])]) {
      if (rule.standing === 'honours') {
        v.I3.push(`${x.code} needs Honours standing, planned in a Four-year plan`)
        continue
      }
      const have = cuIn(before, (code) => (!rule.subjects || rule.subjects.includes(subjectOf(code))) && (!rule.level || levelOf(code) === rule.level))
      if (have < rule.cu) v.I3.push(`${x.code} (${x.term}) with ${have} of the ${rule.cu} cu${rule.level ? ` of ${rule.level}-level` : ''}${rule.subjects ? ` ${rule.subjects.join('/')}` : ''} it needs`)
    }
    const level = levelOf(x.code)
    const done = allCu(before)
    if (level === 300 && done < 30) v.I3.push(`${x.code} (300-level) in ${x.term} after only ${done} cu`)
    if (level >= 400 && done < 60) v.I3.push(`${x.code} (400-level) in ${x.term} after only ${done} cu`)
  }
  for (const x of slots) {
    const label = electiveLabel(x.code)
    const done = allCu(passedBefore(x.term))
    if (/410/.test(label) && done < 60) v.I3.push(`"${label}" in ${x.term} after only ${done} cu`)
    else if (/senior cmpt/i.test(label) && done < 30) v.I3.push(`"${label}" in ${x.term} after only ${done} cu`)
  }

  // I4: at most three 300/400-level CMPT courses a term, booked included.
  for (const t of timeline) {
    const senior = t.courses.filter((x) => (subjectOf(x.code) === 'CMPT' && levelOf(x.code) >= 300) || (isElective(x.code) && /cmpt/i.test(electiveLabel(x.code))))
    if (senior.length > MAX_SENIOR_CMPT) v.I4.push(`${t.label}: ${senior.length} senior CMPT (${senior.map((x) => (isElective(x.code) ? electiveLabel(x.code) : x.code)).join(', ')})`)
  }

  // I5: the whole degree, in credit units.
  const everything = [...completed, ...inProgress, ...named.map((x) => x.code)]
  const dup = everything.filter((code, i) => everything.indexOf(code) !== i)
  if (dup.length > 0) v.I5.push(`counted twice: ${[...new Set(dup)].join(', ')}`)
  const audit = auditPlan([...new Set(everything)], slots.map((x) => x.code))
  v.I5.push(...audit.problems)

  // I6: CS choices.
  const had = new Set([...completed, ...inProgress])
  for (const x of named) {
    if (had.has(x.code)) continue
    if (/^(GE|EE|CME)\d/.test(x.code) || ['CMPT111', 'MATH121', 'CMPT260'].includes(x.code)) v.I6.push(`${x.code} in a CS plan`)
    if (x.code === 'STAT245' && !had.has('STAT242')) v.I6.push('STAT245 instead of the recommended STAT242')
  }

  // I7: a first-year's shape.
  if (c.kind === 'A' || c.kind === 'B') {
    const fw = timeline.filter((t) => parse(t.label)?.season !== 'Spring/Summer' && t.courses.length > 0)
    const first = fw[0] ? orderOf(fw[0].label) : 0
    const last = fw.at(-1) ? orderOf(fw.at(-1)!.label) : 0
    let span = 0
    for (let o = first; o <= last; o++) if (o % 10 === 0 || o % 10 === 2) span++
    if (span !== 8) v.I7.push(`${span} Fall/Winter terms from ${fw[0]?.label} to ${fw.at(-1)?.label} (a four-year degree is 8)`)
    const yearOf = (label: string) => {
      let n = 0
      for (let o = first; o <= orderOf(label); o++) if (o % 10 === 0 || o % 10 === 2) n++
      return Math.ceil(n / 2)
    }
    const where = new Map<string, number>()
    for (const t of timeline) for (const x of t.courses) where.set(x.code, yearOf(t.label))
    const inYear = (pred: (code: string) => boolean, year: number) =>
      [...where.entries()].filter(([code, y]) => y === year && pred(code)).reduce((n, [code]) => n + cuOf(code), 0)
    const slotIs = (re: RegExp) => (code: string) => isElective(code) && re.test(electiveLabel(code)) && !/breadth/i.test(electiveLabel(code))
    const elw = inYear((code) => ELW.includes(code) || slotIs(/english writing/i)(code), 1)
    if (elw < 6) v.I7.push(`only ${elw} cu of English writing in Year 1`)
    const il = inYear((code) => IL.includes(code) || slotIs(/indigenous/i)(code), 1)
    if (il < 3) v.I7.push('Indigenous learning not in Year 1')
    for (const m of ['MATH163', 'MATH164']) if (where.get(m) !== 1) v.I7.push(`${m} in Year ${where.get(m) ?? '?'}, not Year 1`)
    const sci = inYear((code) => Object.values(SCIENCE_AREAS).flat().includes(code) || slotIs(/science/i)(code), 1)
    if (sci < 6) v.I7.push(`only ${sci} cu of junior science in Year 1`)
    for (const alt of CORE_200) {
      const code = alt.split('|').find((x) => where.has(x))
      if (code && where.get(code) !== 2 && !had.has(code)) v.I7.push(`${code} in Year ${where.get(code)}, not Year 2`)
    }
    const free = slots.filter((x) => /free elective|senior elective|200-level or higher/i.test(electiveLabel(x.code)))
    const lastYear = Math.max(...where.values())
    const late = free.filter((x) => yearOf(x.term) === lastYear)
    if (free.length > 1 && late.length > free.length / 2) v.I7.push(`${late.length} of ${free.length} free electives piled into the last year`)
  }

  // I8: the hero.
  const hero = b.hero
  if (!c.spec) {
    if (hero.spec.unavailable) v.I8.push(`default target ${hero.spec.name} can't be finished: ${hero.spec.unavailable}`)
    const dead = hero.spec.requirements.filter((g) => g.courses.filter((code) => catalogue.has(code)).length < g.need)
    if (dead.length > 0) v.I8.push(`default target ${hero.spec.name} needs a course missing from the 2026-27 catalogue (${dead.map((g) => g.courses.join('/')).join('; ')})`)
    const tied = b.matches.filter((m) => m.remaining === hero.remaining && !m.spec.unavailable)
    if (tied.length > 1) {
      const degreeCodes = new Set([...CORE_200.flatMap((x) => x.split('|')), 'CMPT141', 'CMPT145', ...CORE_SENIOR, ...MATH_LIST, 'STAT242', 'STAT245'])
      const overlap = (m: SpecializationMatch) => new Set(m.spec.requirements.flatMap((g) => g.courses).filter((code) => degreeCodes.has(code))).size
      const best = Math.max(...tied.map(overlap))
      if (overlap(hero) < best) v.I8.push(`default target ${hero.spec.name} wins a ${tied.length}-way tie on name, not on its overlap with the degree (${overlap(hero)} < ${best})`)
    }
  }

  // I9: the tree.
  const tree = b.tree
  const lanes = new Map<string, number>()
  for (const n of tree.nodes) lanes.set(`${n.year}|${n.lane}`, (lanes.get(`${n.year}|${n.lane}`) ?? 0) + 1)
  for (const [key, count] of lanes) {
    const lane = key.split('|')[1]
    const cap = lane === 'summer' ? DEFAULT_SUMMER_COURSES : LOAD
    if (count > cap) v.I9.push(`tree Year ${key.split('|')[0]} ${lane}: ${count} cards (max ${cap})`)
  }
  const onTree = new Set(tree.nodes.map((n) => n.code))
  for (const x of planned) if (!onTree.has(x.code)) v.I9.push(`${isElective(x.code) ? electiveLabel(x.code) : x.code} is planned but not on the tree`)
  for (const [code, label] of Object.entries(b.inProgressTerms)) {
    const node = tree.nodes.find((n) => n.code === code)
    if (node && node.term !== label) v.I9.push(`${code} sits in ${node.term} on the tree, but it's ${label}`)
  }

  return { v, b, audit }
}

// ───────────────────────── the cases ─────────────────────────

const next = upcomingTerm(TODAY)
const nextFall: TermStart = { season: 'Fall', year: next.season === 'Fall' ? next.year : next.year }
const cases: Case[] = [
  { name: 'sample', kind: 'sample', completed: sampleCompleted, inProgress: sampleInProgress, terms: sampleTerms, start: next },
]
const B_COURSES = ['CMPT141', 'MATH110', 'MATH163', 'ENG111', 'BIOL120']
const C_COURSES = ['CMPT141', 'CMPT145', 'MATH110', 'MATH163', 'MATH164', 'ENG111', 'ENG113', 'INDG107', 'BIOL120', 'PHYS115', 'CMPT214', 'CMPT270', 'PHIL232', 'ECON111', 'PSY120']
cases.push({ name: 'A default', kind: 'A', completed: [], inProgress: [], terms: {}, start: nextFall })
for (const spec of computerScience.specializations) {
  cases.push({ name: `A ${spec.id}`, kind: 'A', spec, completed: [], inProgress: [], terms: {}, start: nextFall })
  cases.push({ name: `B ${spec.id}`, kind: 'B', spec, completed: [], inProgress: B_COURSES, terms: Object.fromEntries(B_COURSES.map((x) => [x, 'Fall'])), start: next })
  cases.push({ name: `C ${spec.id}`, kind: 'C', spec, completed: C_COURSES, inProgress: [], terms: {}, start: next })
}

// I10: the inputs, read from App.tsx's source (they're React state, not pure functions).
const app = readFileSync(new URL('../src/App.tsx', import.meta.url), 'utf8')
const body = (name: string) => {
  const at = app.indexOf(`function ${name}(`)
  return at < 0 ? '' : app.slice(at, app.indexOf('\n  }\n', at))
}
const inputProblems: string[] = []
if (!/setRegistered\(\s*\[\s*\]\s*\)/.test(body('loadSampleStudent'))) inputProblems.push("loading the sample doesn't clear onboarding's registered picks")
const upload = body('handleTranscriptFile')
if (/\.\.\.prev,\s*\.\.\.inProgressCodes|\{\s*\.\.\.prev,\s*\.\.\.terms\s*\}/.test(upload)) inputProblems.push('a re-upload merges in-progress courses and terms instead of replacing them')
const takingNow = app.match(/const inProgressCourses = useMemo\(([\s\S]*?)\n  \)/)?.[1] ?? ''
if (!/completed/.test(takingNow)) inputProblems.push('in-progress courses are not filtered against completed ones')

// ───────────────────────── the scoreboard ─────────────────────────

const rows: string[] = []
const pad = (s: string | number, n: number) => String(s).padEnd(n)
rows.push(`${pad('case', 28)}${pad('hero', 26)}${pad('F/W', 5)}${pad('last', 13)}${pad('cu', 5)}${pad('senior', 7)}${INVS.map((i) => pad(i, 5)).join('')}`)
const totals: Record<Inv, number> = Object.fromEntries(INVS.map((i) => [i, 0])) as unknown as Record<Inv, number>
const samples: string[] = []
for (const c of cases) {
  const { v, b, audit } = check(c)
  if (c.kind === 'sample') v.I10.push(...inputProblems)
  const fw = b.timeline.filter((t) => parse(t.label)?.season !== 'Spring/Summer')
  for (const i of INVS) totals[i] += v[i].length
  rows.push(
    `${pad(c.name, 28)}${pad(b.hero.spec.name.slice(0, 24), 26)}${pad(fw.length, 5)}${pad(b.timeline.at(-1)?.label ?? '-', 13)}${pad(audit.totalCu, 5)}${pad(audit.seniorCu, 7)}${INVS.map((i) => pad(v[i].length || '.', 5)).join('')}`,
  )
  for (const i of INVS) for (const msg of VERBOSE ? v[i] : v[i].slice(0, 2)) samples.push(`  ${c.name} ${i}: ${msg}`)
}
console.log(rows.join('\n'))
console.log(`\nviolations: ${INVS.map((i) => `${i} ${totals[i]}`).join(' · ')}`)
const shown = VERBOSE ? samples : [...new Map(samples.map((s) => [s.replace(/^ {2}\S+ \S+ /, '  ').replace(/\s+\S+$/, ''), s])).values()].slice(0, 60)
if (shown.length > 0) console.log(`\n${shown.join('\n')}`)
const counted = INVS.filter((i) => !(P0 && i === 'I5'))
const failing = counted.reduce((n, i) => n + totals[i], 0)
if (failing > 0) {
  console.error(`\ncheck-degree: ${failing} violation(s)${P0 ? ' (I5 not counted: --p0)' : ''}`)
  process.exit(1)
}
console.log(`\ncheck-degree: all invariants hold${P0 ? ' (I5 not counted: --p0)' : ''}`)

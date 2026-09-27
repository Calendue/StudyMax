// The degree contract: every plan StudyMax draws must be a real, rule-abiding path through a real
// degree. This builds plans exactly as App.tsx does (buildStudentPlan with the program's degree, the
// in-progress courses booked in their own terms, the skill tree from layoutSkillTree) and checks them
// against the published rules, which are encoded HERE, independently of the engine's own data, so the
// engine can't grade itself. Each degree variant a student can pick (Four-year, Honours, Three-year)
// has its own rule set, written from its own page, and its own cases.
//
// Run: node --experimental-strip-types --experimental-loader ./scripts/_resolve-ts-loader.mjs scripts/check-degree.ts
//   --p0       exit status ignores I5 (the credit-unit degree rules land in P1)
//   --legacy   call buildStudentPlan with its old positional arguments (main before the options object)
//   --verbose  print every violation, not just a sample
//
// Sources (2026-27 catalogue, effective May 1 2026 to April 30 2027):
//   https://programs.usask.ca/arts-and-science/computer-science/bsc-4-computer-science.php  C1-C5 lists
//   https://programs.usask.ca/arts-and-science/computer-science/bsc-honours-computer-science.php  Honours C3-C4
//     (C4 60 cu: CMPT 360, 364, 400, STAT 241, 15 cu of the core, 6 cu CMPT 410+ or CME 433/435, MATH 116/134/177)
//   https://programs.usask.ca/arts-and-science/computer-science/bsc-3-computer-science.php  Three-year: 90 cu,
//     42 senior; C3 12 (no PHIL 232, no business); C4 33 (9 cu CMPT 300/400, at most one CME course)
//   https://programs.usask.ca/arts-and-science/policies.php  120 cu, 66 senior, 15 cu per Fall/Winter term,
//     "Maximum Junior Credit Units by Subject" (printable PDF pp. 32-33)
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
// "Maximum Junior Credit Units by Subject": 100-level credit past a subject's cap counts toward
// nothing. ART, DRAM, INCC, INTS, MUS and MUAP are unlimited, as is any subject not listed; CTST's
// "none" is 0. "May be taken in addition": ENG 120, BIOL 102, CHEM 142, GEOL 102, PHYS 152.
const JUNIOR_CAP: Record<string, number> = {
  ANTH: 9, ARBC: 6, ARTH: 6, ASTR: 9, BIOL: 12, BINF: 3, CTST: 0, CHEM: 9, CHIN: 6, CMRS: 6, CPSJ: 3, CLAS: 18,
  CMPT: 12, CREE: 6, ECON: 6, ENG: 6, FREN: 21, GEOG: 12, GEOL: 8, GERM: 6, GRK: 6, HEB: 6, HIST: 9, HNDI: 6,
  INDG: 3, IS: 3, JPNS: 6, LATN: 6, LING: 15, LIT: 6, MATH: 18, NRTH: 3, PHIL: 12, PHYS: 9, POLS: 9, PSY: 6,
  RLST: 9, RUSS: 6, SOC: 6, SPAN: 6, STAT: 6, UKR: 6, GENS: 3,
}
const JUNIOR_EXTRA = new Set(codes('ENG120 BIOL102 CHEM142 GEOL102 PHYS152'))
/** The junior cap a real course counts against, or undefined. */
const juniorCapOf = (code: string) =>
  isElective(code) || levelOf(code) >= 200 || JUNIOR_EXTRA.has(code) ? undefined : JUNIOR_CAP[subjectOf(code)]

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

// The other two variants, from their own pages. C1 and C2 are word for word the Four-year's.
const C1_C2 = RULES.filter((r) => /^C[12] /.test(r.id))
const INTRO = RULES.filter((r) => /^C4 CMPT \d{3}$/.test(r.id))
const STATS = RULES.find((r) => r.id === 'C4 Statistics')!
// Honours: C3 is the Four-year's (science, PHIL 232/GE 449, MATH 110/133/176, business).
const HONOURS_RULES: Rule[] = [
  ...RULES.filter((r) => /^C[123] /.test(r.id)),
  ...INTRO,
  one('C4 CMPT 360', ['CMPT360']),
  one('C4 CMPT 364', ['CMPT364']),
  one('C4 CMPT 400', ['CMPT400']),
  one('C4 STAT 241', ['STAT241']),
  { id: 'C4 Senior core', needCu: 15, accepts: (c) => codes('CMPT317 CMPT332 CMPT340 CMPT353 CMPT370 CMPT381').includes(c) },
  // "Choose 6 credit units of CMPT courses with number 410 or higher ... CME 433.3, CME 435.3"
  { id: 'C4 CMPT 410+', needCu: 6, accepts: (c) => (subjectOf(c) === 'CMPT' && numberOf(c) >= 410) || c === 'CME433' || c === 'CME435', slot: /410/ },
  one('C4 Calculus 2', ['MATH116', 'MATH134', 'MATH177']),
  STATS,
]
// Three-year: C3 is junior science and MATH 110/133/176 only; C4 the intro courses, 9 cu of CMPT 300/400
// ("at most 1 course from CME 332, CME 334, CME 341, CME 342, CME 433, CME 435") and the stats course.
const THREE_YEAR_CME = codes('CME332 CME334 CME341 CME342 CME433 CME435')
const THREE_YEAR_RULES: Rule[] = [
  ...C1_C2,
  ...RULES.filter((r) => r.id === 'C3 Junior science' || r.id === 'C3 MATH 110/133/176'),
  ...INTRO,
  {
    id: 'C4 Upper CMPT',
    needCu: 9,
    accepts: (c) => (subjectOf(c) === 'CMPT' && levelOf(c) >= 300) || THREE_YEAR_CME.includes(c),
    slot: /senior cmpt|upper/i,
    oneOf: [THREE_YEAR_CME],
  },
  STATS,
]

type Variant = 'bsc-4' | 'bsc-honours' | 'bsc-3'
interface RuleSet {
  name: string
  rules: Rule[]
  totalCu: number
  minSeniorCu: number
  /** Fall/Winter terms a first-year's plan takes at a full load. */
  terms: number
}
const VARIANTS: Record<Variant, RuleSet> = {
  'bsc-4': { name: 'four-year', rules: RULES, totalCu: 120, minSeniorCu: 66, terms: 8 },
  'bsc-honours': { name: 'Honours', rules: HONOURS_RULES, totalCu: 120, minSeniorCu: 66, terms: 8 },
  'bsc-3': { name: 'three-year', rules: THREE_YEAR_RULES, totalCu: 90, minSeniorCu: 42, terms: 6 },
}

// Slot labels are matched in this order ("Senior CMPT elective" before "Senior elective").
const SLOT_ORDER = ['C2 Breadth', 'C1 English writing', 'C1 Indigenous learning', 'C3 Business', 'C4 CMPT 410+', 'C4 Upper CMPT', 'C4 Math list', 'C3 Junior science']
const SENIOR_SLOT = /senior|200-level or higher|410/i
function ruleForSlot(label: string, rules: Rule[]): Rule | null {
  if (/senior elective|200-level or higher|free elective/i.test(label)) return null
  for (const id of SLOT_ORDER) {
    const rule = rules.find((r) => r.id === id)
    if (rule && rule.slot!.test(label)) return rule
  }
  return null
}

interface Audit {
  /** Courses credited to some rule. */
  credited: Set<string>
  /** Subjects whose junior credit is past its cap. */
  overJunior: Set<string>
  shortBy: Record<string, number>
  totalCu: number
  seniorCu: number
  problems: string[]
}

/** Credits every course and slot to at most one rule, maximising what's counted, then checks the degree. */
function auditPlan(named: string[], slots: string[], set: RuleSet): Audit {
  const RULES = set.rules
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
  // A rule only counts junior credit its subject's cap still allows (credit past the cap counts nowhere).
  const juniorOk = (code: string) => {
    const limit = juniorCapOf(code)
    if (limit === undefined) return true
    const inRules = [...credit.values()].flat().filter((c) => subjectOf(c) === subjectOf(code) && juniorCapOf(c) !== undefined)
    return inRules.reduce((n, c) => n + cuOf(c), 0) + cuOf(code) <= limit
  }

  for (const slot of slots) {
    const rule = ruleForSlot(electiveLabel(slot), RULES)
    if (rule && room(rule) > 0) credit.get(rule.id)!.push(slot)
  }
  // Most-constrained courses first; a course whose rules are full may bump one that has another home.
  const candidates = (code: string) => RULES.filter((r) => r.accepts(code))
  const order = [...named].sort((a, b) => candidates(a).length - candidates(b).length || a.localeCompare(b))
  const place = (code: string, depth: number): boolean => {
    for (const r of candidates(code)) {
      if (gain(r, code) > 0 && capOk(r, code) && juniorOk(code)) {
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
          if (gain(r, code) > 0 && capOk(r, code) && juniorOk(code)) {
            // Credited first, so the bumped course's new home sees it against the caps.
            list.push(code)
            if (place(other, depth - 1)) return true
            list.splice(list.indexOf(code), 1)
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

  // C2: at least 3 cu from Humanities or Social Science (every variant's C2).
  const c2 = credit.get('C2 Breadth')!
  const humSocCu = c2.reduce((n, c) => n + (isElective(c) ? (/humanities or social science/i.test(electiveLabel(c)) ? 3 : 0) : humSoc(c) ? cuOf(c) : 0), 0)
  if (humSocCu < 3) problems.push(`C2 has ${humSocCu} cu of Humanities or Social Science (needs 3)`)

  // Totals: 120 cu with at least 66 at the 200 level or higher (at most 54 junior count), or the
  // Three-year's 90 with 42 (at most 48 junior).
  let junior = 0
  let senior = 0
  const cappedJunior: Record<string, number> = {}
  for (const code of named) {
    if (juniorCapOf(code) !== undefined) cappedJunior[subjectOf(code)] = (cappedJunior[subjectOf(code)] ?? 0) + cuOf(code)
    else if (levelOf(code) >= 200) senior += cuOf(code)
    else junior += cuOf(code)
  }
  const overJunior = new Set<string>()
  for (const [subject, cu] of Object.entries(cappedJunior)) {
    junior += Math.min(cu, JUNIOR_CAP[subject])
    if (cu > JUNIOR_CAP[subject]) overJunior.add(subject)
  }
  for (const slot of slots) {
    if (SENIOR_SLOT.test(electiveLabel(slot))) senior += 3
    else junior += 3
  }
  const juniorMax = set.totalCu - set.minSeniorCu
  const totalCu = senior + Math.min(junior, juniorMax)
  if (totalCu < set.totalCu) problems.push(`degree totals ${totalCu} cu that count (needs ${set.totalCu}; ${junior} junior, of which at most ${juniorMax} count)`)
  if (senior < set.minSeniorCu) problems.push(`${senior} cu at the 200 level or higher (needs ${set.minSeniorCu})`)
  return { credited: new Set([...credit.values()].flat()), overJunior, shortBy, totalCu, seniorCu: senior, problems }
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
  /** Plan Spring/Summer terms too (DEFAULT_SUMMER_COURSES a term). */
  springSummer?: boolean
  /** The degree variant the student chose in the plan's settings; the Four-year when absent. */
  variant?: Variant
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
  // The variant's degree as App.tsx picks it (the chosen one of Program.degrees, else Program.degree).
  const variant = c.variant ?? 'bsc-4'
  const degree = computerScience.degrees?.find((d) => d.variant === variant) ?? (variant === 'bsc-4' ? computerScience.degree : undefined)
  if (!degree) throw new Error(`no ${variant} degree on the CS program`)
  const matches = computeMatches(specs, completed, degree as never)
  const credentials = computeCredentials(usask.programs, completed, computerScience.id)
  const planningSpecs = [...specs, ...credentials.map((x) => x.spec)]
  const hero = c.spec ? matches.find((m) => m.spec.id === c.spec!.id)! : matches[0]
  const targets = [hero].filter((m) => m.remaining > 0)
  const plan = LEGACY
    ? (buildStudentPlan as unknown as Legacy)(targets.map((t) => t.spec), planningSpecs, completed, inProgress, LOAD, c.start, c.springSummer ?? false, DEFAULT_SUMMER_COURSES, degree, booked)
    : buildStudentPlan(targets.map((t) => t.spec), planningSpecs, completed, inProgress, LOAD, c.start, {
        springSummer: c.springSummer ?? false,
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

/**
 * The fewest Fall/Winter terms (from a Fall, at 15 cu a term) that the plan's own named courses need:
 * each one after its prerequisites (the plan's pick where a group has one it takes; a concurrent one
 * may share the term), after the credit units its level or credit prerequisite asks for ("6 credit
 * units of 300-level CMPT" counted from the plan's own such courses), and in a season it runs.
 * Independent of the planner. CMPT 384 and 484 both run in Winter only, so Information Visualization
 * needs a fourth Winter whatever the degree; Programming Languages' CMPT 440 needs CMPT 340, both
 * Winter only, after CMPT 263 (Winter); Social Computing's CMPT 412 (Fall) needs CMPT 317 or 353 (both
 * Winter, after CMPT 280 in Year 2's Winter).
 */
function chainTerms(completed: string[], inProgress: string[], planned: string[]): { terms: number; via: string } {
  const done = new Set(completed)
  const now = new Set(inProgress)
  const mine = new Set([...completed, ...inProgress, ...planned])
  const doneCu = completed.reduce((n, code) => n + cuOf(code), 0)
  const memo = new Map<string, number>()
  const afterCu = (cu: number) => Math.max(0, Math.ceil((cu - doneCu) / MAX_CU))
  const earliest = (code: string, depth = 0): number => {
    if (done.has(code)) return -1
    if (now.has(code)) return 0
    if (memo.has(code) || depth > 20) return memo.get(code) ?? 0
    const info = courseInfo[code]
    const pick = (group: string[]) => (group.some((o) => mine.has(o)) ? group.filter((o) => mine.has(o)) : group)
    let t = 0
    for (const group of info?.requires ?? []) if (group.length > 0) t = Math.max(t, Math.min(...pick(group).map((o) => earliest(o, depth + 1))) + 1)
    for (const group of info?.concurrent ?? []) if (group.length > 0) t = Math.max(t, Math.min(...pick(group).map((o) => earliest(o, depth + 1))))
    const level = levelOf(code)
    if (level === 300) t = Math.max(t, afterCu(30))
    if (level >= 400) t = Math.max(t, afterCu(60))
    for (const rule of [...(creditPrereqs[code] ?? []), ...(courseInfo[code]?.creditRequires ?? [])]) {
      t = Math.max(t, afterCu(rule.cu))
      if (!rule.level && !rule.subjects) continue
      // Credit units of a given level or subject: the plan's own such courses, earliest first.
      const pool = [...mine]
        .filter((o) => o !== code && (!rule.subjects || rule.subjects.includes(subjectOf(o))) && (!rule.level || levelOf(o) === rule.level))
        .map((o) => ({ o, at: earliest(o, depth + 1) }))
        .sort((a, b) => a.at - b.at)
      let cu = 0
      for (const { o, at } of pool) {
        cu += cuOf(o)
        if (cu >= rule.cu) {
          t = Math.max(t, at + 1)
          break
        }
      }
    }
    for (let tries = 0; tries < 2 && runsIn(code, t % 2 === 0 ? 'Fall' : 'Winter') === false; tries++) t++
    memo.set(code, t)
    return t
  }
  let best = { terms: 0, via: '' }
  for (const code of planned) {
    const terms = earliest(code) + 1
    if (terms > best.terms) best = { terms, via: code }
  }
  return best
}

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
  const variant = c.variant ?? 'bsc-4'
  const set = VARIANTS[variant]
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
      // Credit that rules a course out (CME 331 for CMPT 215) stands in for it as a prerequisite.
      const has = (o: string) => before.has(o) || (courseInfo[o]?.antirequisites ?? []).some((a) => before.has(a))
      if (group.length > 0 && !group.some(has)) v.I3.push(`${x.code} (${x.term}) before its prerequisite ${group.join('/')}`)
    }
    for (const group of courseInfo[x.code]?.concurrent ?? []) {
      if (group.length > 0 && !group.some((o) => before.has(o) || now.has(o))) v.I3.push(`${x.code} (${x.term}) without its co-requisite ${group.join('/')}`)
    }
    for (const rule of [...(creditPrereqs[x.code] ?? []), ...(courseInfo[x.code]?.creditRequires ?? [])]) {
      // Honours standing: only an Honours plan may take it, and then only with the credit units it
      // names (CMPT 400: 60 cu, after the Honours application).
      if (rule.standing === 'honours' && variant !== 'bsc-honours') {
        v.I3.push(`${x.code} needs Honours standing, planned in a ${set.name} plan`)
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
    // No 300/400-level CMPT course ran in a Spring/Summer term in 2025-27 (Banner).
    if (parse(x.term)?.season === 'Spring/Summer' && /410|senior cmpt/i.test(label)) v.I2.push(`"${label}" in ${x.term}, when no senior CMPT course runs`)
    const done = allCu(passedBefore(x.term))
    if (/410/.test(label) && done < 60) v.I3.push(`"${label}" in ${x.term} after only ${done} cu`)
    else if (/senior cmpt/i.test(label) && done < 30) v.I3.push(`"${label}" in ${x.term} after only ${done} cu`)
  }

  // I3 (antirequisites): never a course the student's credit rules out ("Students with credit for X
  // may not take this course for credit").
  const had0 = new Set([...completed, ...inProgress])
  for (const x of named) {
    const clash = (courseInfo[x.code]?.antirequisites ?? []).filter((a) => had0.has(a))
    if (clash.length > 0) v.I3.push(`${x.code} planned, but the student has ${clash.join(', ')} (an antirequisite)`)
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
  const audit = auditPlan([...new Set(everything)], slots.map((x) => x.code), set)
  v.I5.push(...audit.problems)
  // Never plan a 100-level course that its subject's junior cap leaves counting toward nothing.
  for (const x of named) {
    if (juniorCapOf(x.code) !== undefined && audit.overJunior.has(subjectOf(x.code)) && !audit.credited.has(x.code)) {
      v.I5.push(`${x.code} planned, but 100-level ${subjectOf(x.code)} is past its ${JUNIOR_CAP[subjectOf(x.code)]}-cu cap: it counts toward nothing`)
    }
  }

  // I6: CS choices.
  const had = new Set([...completed, ...inProgress])
  for (const x of named) {
    if (had.has(x.code)) continue
    if (/^(GE|EE|CME)\d/.test(x.code) || ['CMPT111', 'MATH121', 'CMPT260'].includes(x.code)) v.I6.push(`${x.code} in a CS plan`)
    if (x.code === 'STAT245' && !had.has('STAT242')) v.I6.push('STAT245 instead of the recommended STAT242')
  }

  // I7: a first-year's shape.
  if ((c.kind === 'A' || c.kind === 'B') && !c.springSummer) {
    const fw = timeline.filter((t) => parse(t.label)?.season !== 'Spring/Summer' && t.courses.length > 0)
    const first = fw[0] ? orderOf(fw[0].label) : 0
    const last = fw.at(-1) ? orderOf(fw.at(-1)!.label) : 0
    let span = 0
    for (let o = first; o <= last; o++) if (o % 10 === 0 || o % 10 === 2) span++
    // Eight Fall/Winter terms (six for the Three-year), unless a published chain the plan must take
    // can't fit: then the chain's own minimum, computed here from prerequisites, level gates and seasons.
    const chain = chainTerms([...completed], inProgress, named.map((x) => x.code))
    const want = Math.max(set.terms, chain.terms)
    if (span !== want) {
      const why = chain.terms > set.terms ? ` (${chain.via} needs ${chain.terms})` : ` (a ${set.name} degree is ${set.terms})`
      v.I7.push(`${span} Fall/Winter terms from ${fw[0]?.label} to ${fw.at(-1)?.label}${why}`)
    }
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
    // The sheet's Year 1 Winter slot is "Indigenous or breadth": Year 2 at the latest.
    const il2 = il + inYear((code) => IL.includes(code) || slotIs(/indigenous/i)(code), 2)
    if (il2 < 3) v.I7.push('Indigenous learning not in Year 1 or 2')
    for (const m of ['MATH163', 'MATH164']) if (where.get(m) !== 1) v.I7.push(`${m} in Year ${where.get(m) ?? '?'}, not Year 1`)
    // Honours: the thesis after admission to Honours (60 cu, applied for by May 1), so Year 3 at the earliest.
    if (variant === 'bsc-honours' && !had.has('CMPT400')) {
      const y = where.get('CMPT400')
      if (y === undefined) v.I7.push('no CMPT 400 in an Honours plan')
      else if (y < 3) v.I7.push(`CMPT400 in Year ${y}, before Honours admission`)
    }
    const sci = inYear((code) => Object.values(SCIENCE_AREAS).flat().includes(code) || slotIs(/science/i)(code), 1)
    if (sci < 6) v.I7.push(`only ${sci} cu of junior science in Year 1`)
    for (const alt of CORE_200) {
      const code = alt.split('|').find((x) => where.has(x))
      if (code && where.get(code) !== 2 && !had.has(code)) v.I7.push(`${code} in Year ${where.get(code)}, not Year 2`)
    }
    const free = slots.filter((x) => /free elective|senior elective|200-level or higher/i.test(electiveLabel(x.code)))
    const lastFW = Math.max(...fw.map((t) => yearOf(t.label)))
    for (const x of slots.filter((s) => /business|economics|science/i.test(electiveLabel(s.code)) && !/breadth/i.test(electiveLabel(s.code)))) {
      if (yearOf(x.term) === lastFW && free.some((f) => yearOf(f.term) < lastFW)) v.I7.push(`"${electiveLabel(x.code)}" (Year 1-2) in the last year behind free electives`)
    }
    const lastYear = Math.max(...where.values())
    const late = free.filter((x) => yearOf(x.term) === lastYear)
    if (free.length > 1 && late.length === free.length) v.I7.push(`all ${free.length} free electives piled into the last year`)
    for (const t of timeline) {
      if (t.courses.length > 1 && t.courses.every((x) => isElective(x.code) && /free elective|senior elective|200-level or higher/i.test(electiveLabel(x.code)))) {
        v.I7.push(`${t.label} is nothing but free electives`)
      }
    }
  }

  // I8: the hero.
  const hero = b.hero
  if (!c.spec) {
    if (hero.spec.unavailable) v.I8.push(`default target ${hero.spec.name} can't be finished: ${hero.spec.unavailable}`)
    const dead = hero.spec.requirements.filter((g) => g.courses.filter((code) => catalogue.has(code)).length < g.need)
    if (dead.length > 0) v.I8.push(`default target ${hero.spec.name} needs a course missing from the 2026-27 catalogue (${dead.map((g) => g.courses.join('/')).join('; ')})`)
    const tied = b.matches.filter((m) => m.remaining === hero.remaining && !m.spec.unavailable)
    if (tied.length > 1) {
      // What the variant's page names outright (the Three-year names no senior core and no Mathematics List).
      const degreeCodes = new Set([
        ...CORE_200.flatMap((x) => x.split('|')),
        'CMPT141',
        'CMPT145',
        'STAT242',
        'STAT245',
        ...(variant === 'bsc-3' ? [] : CORE_SENIOR),
        ...(variant === 'bsc-4' ? MATH_LIST : []),
        ...(variant === 'bsc-honours' ? codes('CMPT364 CMPT400 STAT241 MATH116 MATH134 MATH177') : []),
      ])
      const overlap = (m: SpecializationMatch) => new Set(m.spec.requirements.flatMap((g) => g.courses).filter((code) => degreeCodes.has(code))).size
      const best = Math.max(...tied.map(overlap))
      const byName = [...tied].sort((x, y) => x.spec.name.localeCompare(y.spec.name))[0]
      if (byName.spec.id === hero.spec.id && overlap(hero) < best) v.I8.push(`default target ${hero.spec.name} wins a ${tied.length}-way tie on name, not on its overlap with the degree (${overlap(hero)} < ${best})`)
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
const ALL_SPECS = computerScience.specializations.map((x) => x.id)
const cases: Case[] = [
  { name: 'sample', kind: 'sample', completed: sampleCompleted, inProgress: sampleInProgress, terms: sampleTerms, start: next },
]
const B_COURSES = ['CMPT141', 'MATH110', 'MATH163', 'ENG111', 'BIOL120']
const C_COURSES = ['CMPT141', 'CMPT145', 'MATH110', 'MATH163', 'MATH164', 'ENG111', 'ENG113', 'INDG107', 'BIOL120', 'PHYS115', 'CMPT214', 'CMPT270', 'PHIL232', 'ECON111', 'PSY120']
cases.push({ name: 'A default', kind: 'A', completed: [], inProgress: [], terms: {}, start: nextFall })
cases.push({ name: 'A default +summer', kind: 'A', completed: [], inProgress: [], terms: {}, start: nextFall, springSummer: true })
cases.push({ name: 'C +CME331 prog-lang', kind: 'C', spec: computerScience.specializations.find((s) => s.id === 'programming-languages'), completed: ['CMPT141', 'CMPT145', 'MATH110', 'MATH163', 'MATH164', 'ENG111', 'ENG113', 'INDG107', 'BIOL120', 'PHYS115', 'CMPT214', 'CMPT270', 'PHIL232', 'ECON111', 'PSY120', 'CME331'], inProgress: [], terms: {}, start: next })
for (const spec of computerScience.specializations) {
  cases.push({ name: `A ${spec.id}`, kind: 'A', spec, completed: [], inProgress: [], terms: {}, start: nextFall })
  cases.push({ name: `B ${spec.id}`, kind: 'B', spec, completed: [], inProgress: B_COURSES, terms: Object.fromEntries(B_COURSES.map((x) => [x, 'Fall'])), start: next })
  cases.push({ name: `B ${spec.id} +summer`, kind: 'B', spec, completed: [], inProgress: B_COURSES, terms: Object.fromEntries(B_COURSES.map((x) => [x, 'Fall'])), start: next, springSummer: true })
  cases.push({ name: `C ${spec.id}`, kind: 'C', spec, completed: C_COURSES, inProgress: [], terms: {}, start: next })
}
// Junior caps: 100-level credit past a subject's cap counts toward nothing, so the plan makes it up
// with electives. Each case has a twin without the over-cap courses that must plan exactly as much.
const specById = (id: string) => computerScience.specializations.find((s) => s.id === id)
const SWITCHER = ['ENG111', 'ENG112', 'ENG113', 'ENG114', 'PSY120', 'PSY121', 'CMPT141', 'MATH110']
const winter2027: TermStart = { season: 'Winter', year: 2027 }
const twins: [string, string][] = [
  ['Arts switcher software-dev', 'Arts switcher (ENG 6 cu)'],
  ['C +ENG112 +ENG114', 'C (twin of +ENG112 +ENG114)'],
]
cases.push({ name: twins[0][0], kind: 'C', spec: specById('software-development'), completed: SWITCHER, inProgress: [], terms: {}, start: winter2027 })
cases.push({ name: twins[0][1], kind: 'C', spec: specById('software-development'), completed: SWITCHER.filter((x) => x !== 'ENG113' && x !== 'ENG114'), inProgress: [], terms: {}, start: winter2027 })
cases.push({ name: twins[1][0], kind: 'C', completed: [...C_COURSES, 'ENG112', 'ENG114'], inProgress: [], terms: {}, start: next })
cases.push({ name: twins[1][1], kind: 'C', completed: C_COURSES, inProgress: [], terms: {}, start: next })
// The Honours and Three-year variants (chosen in the plan's settings): the sample, a first-year with
// the default target, and first-years (A) and first-years under way (B) aimed at a few specializations.
const VARIANT_SPECS: Record<Exclude<Variant, 'bsc-4'>, string[]> = {
  'bsc-honours': ALL_SPECS,
  'bsc-3': ALL_SPECS,
}
for (const [variant, ids] of Object.entries(VARIANT_SPECS) as [Variant, string[]][]) {
  const tag = variant === 'bsc-honours' ? 'H' : '3y'
  cases.push({ name: `${tag} sample`, kind: 'sample', completed: sampleCompleted, inProgress: sampleInProgress, terms: sampleTerms, start: next, variant })
  cases.push({ name: `${tag} A default`, kind: 'A', completed: [], inProgress: [], terms: {}, start: nextFall, variant })
  cases.push({ name: `${tag} A default +summer`, kind: 'A', completed: [], inProgress: [], terms: {}, start: nextFall, springSummer: true, variant })
  for (const id of ids) {
    const spec = computerScience.specializations.find((x) => x.id === id)
    if (!spec) throw new Error(`no specialization ${id}`)
    cases.push({ name: `${tag} A ${id}`, kind: 'A', spec, completed: [], inProgress: [], terms: {}, start: nextFall, variant })
    cases.push({ name: `${tag} B ${id}`, kind: 'B', spec, completed: [], inProgress: B_COURSES, terms: Object.fromEntries(B_COURSES.map((x) => [x, 'Fall'])), start: next, variant })
  }
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
const plannedCu = new Map<string, number>()
for (const c of cases) {
  const { v, b, audit } = check(c)
  if (c.kind === 'sample') v.I10.push(...inputProblems)
  plannedCu.set(c.name, b.plan.flatMap((t) => t.courses).reduce((n, x) => n + cuOf(x.code), 0))
  // I5 (junior caps): over-cap credit buys nothing, so the case plans as much as its twin does.
  const twin = twins.find(([name]) => name === c.name)?.[1]
  if (twin) {
    if (!audit.overJunior.has('ENG')) v.I5.push('the case was meant to be past the junior ENG cap')
    const mine = plannedCu.get(c.name)!
    const theirs = check(cases.find((x) => x.name === twin)!).b.plan.flatMap((t) => t.courses).reduce((n, x) => n + cuOf(x.code), 0)
    if (mine < theirs) v.I5.push(`plans ${mine} cu, less than its twin's ${theirs}: over-cap junior credit was counted`)
  }
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

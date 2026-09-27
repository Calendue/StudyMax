// The published USask CS degree rules, encoded independently of the planner's own data (src/lib/degree.ts,
// src/data/degrees/*): the C1-C5 rule tables for the Four-year, Honours and Three-year, the junior caps,
// breadth, when a course runs (runsIn), and auditPlan, which credits every course and slot to at most
// one rule and checks the whole degree in credit units. Shared by check-degree.ts and the independent
// plan validator (_plan-validate.ts); it must never import src/lib/plan.ts, planDegree.ts, degree.ts or
// src/lib/planner/* at runtime. Sources: see check-degree.ts's header.
import { courseInfo } from '../src/data/prereqs.ts'
import { offerings } from '../src/data/offerings.ts'
import { catalogueCourses } from '../src/data/courses.ts'
import type { Season } from '../src/lib/planner/types.ts'

/** An unnamed elective slot in a plan ("elective:<n>:<label>"). Same spelling as src/lib/plan.ts. */
export const isElective = (code: string) => code.startsWith('elective:')
/** "elective:3:Breadth elective" → "Breadth elective". */
export const electiveLabel = (code: string) => code.split(':').slice(2).join(':')

// Breadth program types from Banner, once T2's map exists (senior Humanities/Social Science courses).
export let breadthTypes: Record<string, string[]> = {}
try {
  const mod = await import('../src/data/breadth.ts')
  breadthTypes = (mod as { breadth?: Record<string, string[]> }).breadth ?? {}
} catch {
  // Not generated yet: only the page's junior lists classify breadth.
}


// ───────────────────────── the published rules, independently ─────────────────────────

export const codes = (s: string) => s.trim().split(/\s+/)
export const catalogue = new Set(catalogueCourses.map((c) => c.code))
export const cuOf = (code: string) => (isElective(code) ? 3 : (courseInfo[code]?.creditUnits ?? 3))
export const levelOf = (code: string) => Number(code.match(/\d/)?.[0] ?? 0) * 100
export const subjectOf = (code: string) => code.match(/^[A-Z]+/)?.[0] ?? ''
export const numberOf = (code: string) => Number(code.match(/\d+/)?.[0] ?? 0)

export const ELW = codes(`ANTH302 ANTH306 ANTH310 ANTH421 CMRS110 CMRS111 CPSJ203 ENG110 ENG111 ENG112 ENG113 ENG114 ENG120
  ENG210 ENG211 ENG212 ENG213 ENG394 ESL116 HIST115 HIST125 HIST135 HIST145 HIST155 HIST165 HIST175 HIST185 HIST193
  HIST194 MUS155 PHIL120 PHIL121 PHIL133 PHIL208 PHIL233 POLS236 POLS237 PSY323 PSY355 RLST280`)
export const IL = codes(`ANTH202 ANTH350 ANTH480 DRAM111 ENG242 ENG243 ENG335 ENG338 GEOG465 HIST195 HIST257 HIST266 HIST315
  HIST316 INDG107 LING114 LING253 PLAN445 POLS222`)
export const FINE_ARTS = codes(`ART110 ART122 ART123 ART124 ART125 ART136 ART141 ART151 ART152 ART161 ARTH120 ARTH121 DRAM101
  DRAM108 DRAM110 DRAM111 DRAM113 DRAM118 DRAM119 DRAM121 MUS101 MUS102 MUS104 MUS111 MUS112 MUS120 MUS121 MUS125
  MUS133 MUS134 MUS155 MUS156 MUS175 MUS184`)
export const HUMANITIES = codes(`ARBC114 ARBC117 CHIN114 CHIN117 CLAS110 CLAS111 CMRS110 CMRS111 CREE101 CREE110 DENE110
  ENG110 ENG111 ENG112 ENG113 ENG114 ENG120 ESL115 ESL116 FREN103 FREN104 FREN106 FREN122 FREN123 FREN125 FREN160
  FREN218 GENS112 GERM114 GERM117 GRK112 GRK113 HEB114 HEB117 HIST115 HIST125 HIST135 HIST145 HIST155 HIST165 HIST175
  HIST185 HIST193 HIST194 HIST195 HNDI114 HNDI117 JPNS114 JPNS117 LATN112 LATN113 LING110 LING113 LING114 LIT110 LIT111
  MUS101 MUS111 MUS112 PHIL110 PHIL115 PHIL120 PHIL121 PHIL133 PHIL140 RLST111 RLST112 RLST113 SPAN114 SPAN117 UKR114
  UKR117`)
export const SOCIAL = codes(`ANTH111 ANTH112 ANTH116 ECON111 ECON114 GENS112 GEOG130 HLST110 INDG107 LING111 LING112 LING113
  LING114 POLS110 POLS111 POLS112 PSY120 PSY121 SOC111 SOC112`)
export const NO_TYPE = codes('CPSJ112 CPSJ203 INTS110 INTS111 INTS380')
export const BREADTH_EXCLUDED = new Set(codes('CLAS101 CLAS103 CLAS104 CLAS105 CLAS107 CLAS203 PSY233 PSY234 SOC225 SOC325 MATH101 MATH102 STAT244'))
export const SCIENCE_AREAS: Record<string, string[]> = {
  Biology: codes('BIOL120 BIOL121'),
  Chemistry: codes('CHEM112 CHEM115 CHEM250'),
  'Earth Science': codes('GEOG120 GEOL121 GEOL122'),
  'Physics & Astronomy': codes('ASTR113 ASTR213 PHYS115 PHYS117 PHYS125'),
}
export const BUSINESS = codes('AREC230 COMM101 COMM105 COMM201 COMM203 COMM204 COMM205 COMM210 COMM304 ECON111 ECON114')
export const CORE_SENIOR = codes('CMPT317 CMPT332 CMPT340 CMPT353 CMPT360 CMPT370 CMPT381')
export const MATH_LIST = codes('MATH116 MATH134 MATH177 MATH211 MATH223 MATH225 MATH266 MATH276 MATH327 MATH328 MATH361 MATH362 MATH364 STAT241 STAT344 STAT345 STAT348 PHIL243')
export const CORE_200 = ['CMPT214', 'CMPT215|CME331', 'CMPT260|CMPT263', 'CMPT270', 'CMPT280']
// "Maximum Junior Credit Units by Subject": 100-level credit past a subject's cap counts toward
// nothing. ART, DRAM, INCC, INTS, MUS and MUAP are unlimited, as is any subject not listed; CTST's
// "none" is 0. "May be taken in addition": ENG 120, BIOL 102, CHEM 142, GEOL 102, PHYS 152.
export const JUNIOR_CAP: Record<string, number> = {
  ANTH: 9, ARBC: 6, ARTH: 6, ASTR: 9, BIOL: 12, BINF: 3, CTST: 0, CHEM: 9, CHIN: 6, CMRS: 6, CPSJ: 3, CLAS: 18,
  CMPT: 12, CREE: 6, ECON: 6, ENG: 6, FREN: 21, GEOG: 12, GEOL: 8, GERM: 6, GRK: 6, HEB: 6, HIST: 9, HNDI: 6,
  INDG: 3, IS: 3, JPNS: 6, LATN: 6, LING: 15, LIT: 6, MATH: 18, NRTH: 3, PHIL: 12, PHYS: 9, POLS: 9, PSY: 6,
  RLST: 9, RUSS: 6, SOC: 6, SPAN: 6, STAT: 6, UKR: 6, GENS: 3,
}
export const JUNIOR_EXTRA = new Set(codes('ENG120 BIOL102 CHEM142 GEOL102 PHYS152'))
/** The junior cap a real course counts against, or undefined. */
export const juniorCapOf = (code: string) =>
  isElective(code) || levelOf(code) >= 200 || JUNIOR_EXTRA.has(code) ? undefined : JUNIOR_CAP[subjectOf(code)]

export const humSoc = (code: string) =>
  HUMANITIES.includes(code) || SOCIAL.includes(code) || (levelOf(code) >= 200 && (breadthTypes[code] ?? []).some((t) => t === 'HUM' || t === 'SOCS'))
export const breadthOk = (code: string) =>
  !BREADTH_EXCLUDED.has(code) &&
  (FINE_ARTS.includes(code) || HUMANITIES.includes(code) || SOCIAL.includes(code) || NO_TYPE.includes(code) ||
    (levelOf(code) >= 200 && (breadthTypes[code] ?? []).some((t) => t === 'HUM' || t === 'SOCS' || t === 'FNAR')))

export interface Rule {
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
export const one = (id: string, list: string[]): Rule => ({ id, needCu: 3, accepts: (c) => list.includes(c), oneOf: [list] })
export const RULES: Rule[] = [
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
export const C1_C2 = RULES.filter((r) => /^C[12] /.test(r.id))
export const INTRO = RULES.filter((r) => /^C4 CMPT \d{3}$/.test(r.id))
export const STATS = RULES.find((r) => r.id === 'C4 Statistics')!
// Honours: C3 is the Four-year's (science, PHIL 232/GE 449, MATH 110/133/176, business).
export const HONOURS_RULES: Rule[] = [
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
export const THREE_YEAR_CME = codes('CME332 CME334 CME341 CME342 CME433 CME435')
export const THREE_YEAR_RULES: Rule[] = [
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

export type Variant = 'bsc-4' | 'bsc-honours' | 'bsc-3'
export interface RuleSet {
  name: string
  rules: Rule[]
  totalCu: number
  minSeniorCu: number
  /** Fall/Winter terms a first-year's plan takes at a full load. */
  terms: number
}
export const VARIANTS: Record<Variant, RuleSet> = {
  'bsc-4': { name: 'four-year', rules: RULES, totalCu: 120, minSeniorCu: 66, terms: 8 },
  'bsc-honours': { name: 'Honours', rules: HONOURS_RULES, totalCu: 120, minSeniorCu: 66, terms: 8 },
  'bsc-3': { name: 'three-year', rules: THREE_YEAR_RULES, totalCu: 90, minSeniorCu: 42, terms: 6 },
}

// Slot labels are matched in this order ("Senior CMPT elective" before "Senior elective").
export const SLOT_ORDER = ['C2 Breadth', 'C1 English writing', 'C1 Indigenous learning', 'C3 Business', 'C4 CMPT 410+', 'C4 Upper CMPT', 'C4 Math list', 'C3 Junior science']
export const SENIOR_SLOT = /senior|200-level or higher|410/i
export function ruleForSlot(label: string, rules: Rule[]): Rule | null {
  if (/senior elective|200-level or higher|free elective/i.test(label)) return null
  for (const id of SLOT_ORDER) {
    const rule = rules.find((r) => r.id === id)
    if (rule && rule.slot!.test(label)) return rule
  }
  return null
}

export interface Audit {
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
export function auditPlan(named: string[], slots: string[], set: RuleSet): Audit {
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

export const runsIn = (code: string, season: Season): boolean | null => {
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
export const unscheduled = (code: string) => !(offerings[code]?.length) && courseInfo[code]?.offered === 'none'

// Regenerates src/data/prereqs.ts and src/data/activeCourses.ts from the USask course catalogue's
// public JSON API (the 2026-27 University Catalogue).
// Run: node --experimental-strip-types --experimental-loader ./scripts/_resolve-ts-loader.mjs scripts/scrape-catalogue.ts
//
// Sources, both undocumented but public (programs.usask.ca/_js/course-info.js uses the same host,
// and catalogue.usask.ca has no robots.txt):
//   https://catalogue.usask.ca/api?subj_code=CMPT   every course in a subject: title, credit_units,
//                                                   status, offered, tech (the Prerequisite(s),
//                                                   Corequisite(s), Note and Restriction(s) HTML)
//   https://catalogue.usask.ca/api/course_titles    {CODE: title} for every active course code
// plus the CS program pages on programs.usask.ca, read only for the course codes they list.
//
// One request per subject, 150 ms apart. Nothing in the app calls the catalogue at runtime: the
// output is committed and the planner reads it as static data.
import { readdirSync, writeFileSync } from 'node:fs'
import { programs } from '../src/data/programs/index.ts'
import { specializations } from '../src/data/specializations.ts'
import { creditPrereqs } from '../src/data/creditPrereqs.ts'
import { completedCourses, inProgressCourses } from '../src/data/transcript.ts'
import type { CreditRequirement, Offered } from '../src/data/prereqs.ts'

const API = 'https://catalogue.usask.ca/api'
const USER_AGENT = 'StudyMax/1.0 (+https://www.studymax.study; hackathon course planner)'
const SPACING_MS = 150

// Every code on these pages is kept, so the degree data (C1-C5 lists) always has credit units and
// an offered term to plan with, whichever variant the degree files map.
const PROGRAM_PAGES = [
  'https://programs.usask.ca/arts-and-science/computer-science/bsc-4-computer-science.php',
  'https://programs.usask.ca/arts-and-science/computer-science/bsc-honours-computer-science.php',
  'https://programs.usask.ca/arts-and-science/computer-science/bsc-3-computer-science.php',
]

const CODE = /\b([A-Z]{2,4})\s*(\d{3})\b/g

const codesIn = (text: string): string[] => [...new Set([...text.matchAll(CODE)].map((m) => `${m[1]}${m[2]}`))]

export function decode(html: string): string {
  return html
    .replace(/<[^>]*>/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&nbsp;/g, ' ')
    .replace(/&#(\d+);/g, (_, d) => String.fromCharCode(Number(d)))
    .replace(/&[a-z]+;/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

// --- what the app names -------------------------------------------------------------------------

/** A degree file's shape, loosely: whatever src/data/degrees/* exports with groups of courses. */
interface DegreeLike {
  id?: string
  groups: { courses: string[]; prefer?: string[] }[]
}

const isDegreeLike = (value: unknown): value is DegreeLike =>
  typeof value === 'object' &&
  value !== null &&
  Array.isArray((value as DegreeLike).groups) &&
  (value as DegreeLike).groups.every((g) => Array.isArray(g?.courses))

/**
 * Every course code the app's own data names, with where it's named: program specializations and
 * degrees, src/data/specializations.ts, the credit-unit degrees in src/data/degrees/, the hand-coded
 * credit prerequisites and, unless `samples` is false, the sample transcripts (a transcript may
 * rightly hold a course USask has since retired).
 */
export async function namedCourses({ samples = true }: { samples?: boolean } = {}): Promise<Map<string, string[]>> {
  const named = new Map<string, string[]>()
  const add = (code: string, where: string) => {
    const list = named.get(code)
    if (!list) named.set(code, [where])
    else if (!list.includes(where)) list.push(where)
  }

  for (const program of programs) {
    for (const spec of program.specializations) {
      for (const group of spec.requirements) for (const code of group.courses) add(code, spec.id)
    }
    // A program's degree is either the older course-count shape (requirements) or the credit-unit
    // one (groups); read whichever it has.
    const degree = program.degree as unknown as
      | { id?: string; requirements?: { courses: string[] }[]; groups?: { courses: string[]; prefer?: string[] }[] }
      | undefined
    for (const group of [...(degree?.requirements ?? []), ...(degree?.groups ?? [])]) {
      for (const code of group.courses) add(code, degree?.id ?? `${program.id} degree`)
    }
    if (samples) {
      for (const code of [...(program.sampleTranscript ?? []), ...(program.sampleInProgress ?? [])]) add(code, `${program.id} sample`)
    }
  }
  for (const spec of specializations) {
    for (const group of spec.requirements) for (const code of group.courses) add(code, spec.id)
  }

  const degreesDir = new URL('../src/data/degrees/', import.meta.url)
  for (const file of readdirSync(degreesDir).filter((f) => f.endsWith('.ts') && f !== 'types.ts').sort()) {
    const module: Record<string, unknown> = await import(new URL(file, degreesDir).href)
    for (const [name, value] of Object.entries(module)) {
      const degrees = Array.isArray(value) ? value.filter(isDegreeLike) : isDegreeLike(value) ? [value] : []
      for (const degree of degrees) {
        for (const group of degree.groups) {
          for (const code of [...group.courses, ...(group.prefer ?? [])]) add(code, degree.id ?? `degrees/${file}:${name}`)
        }
      }
    }
  }

  for (const code of Object.keys(creditPrereqs)) add(code, 'creditPrereqs')
  if (samples) for (const code of [...completedCourses, ...inProgressCourses]) add(code, 'sample transcript')
  return named
}

// --- parsing a course's `tech` HTML ------------------------------------------------------------

export interface TechLines {
  /** Every "Prerequisite(s):" line (a few courses have two). */
  prerequisite: string[]
  /** "Prerequisite(s) or Corequisite(s):" and "Corequisite(s):" lines, labels kept. */
  corequisite: { label: string; text: string }[]
  notes: string[]
}

/** Splits `tech` into its labelled lines: "<B>Prerequisite(s):</B> CMPT 270.<BR><B>Note:</B> …". */
export function splitTech(tech: string): TechLines {
  const lines: TechLines = { prerequisite: [], corequisite: [], notes: [] }
  for (const m of tech.matchAll(/<B>\s*([\s\S]*?)\s*<\/B>([\s\S]*?)(?=<B>|$)/gi)) {
    const label = decode(m[1])
    const text = decode(m[2]).replace(/\.$/, '').trim()
    if (/^(pre(requisite(\(s\))?)?|prerequisites?) or co-?requisite(\(s\)|s)?:?$/i.test(label) || /^co-?requisite(\(s\)|s)?:?$/i.test(label)) {
      if (text) lines.corequisite.push({ label: label.endsWith(':') ? label : `${label}:`, text })
    } else if (/^prerequisite(\(s\)|s)?:?$/i.test(label)) {
      if (text) lines.prerequisite.push(text)
    } else if (/^note(\(s\)|s)?:?$/i.test(label)) {
      if (text) lines.notes.push(text)
    }
  }
  return lines
}

/**
 * Best-effort structured read of a prerequisite line, for sequencing.
 *
 * Returns groups in AND relationship, each group being OR options: "CMPT 141 and one of MATH 110,
 * MATH 121" -> [['CMPT141'], ['MATH110','MATH121']]. A group marked "(can be taken concurrently)"
 * goes to `concurrent` instead. Anything the catalogue phrases in prose ("permission of the
 * department") is left out of the graph; `prerequisiteText` always keeps the verbatim rule.
 */
export function parsePrerequisiteCodes(text: string): { requires: string[][]; concurrent: string[][] } {
  const requires: string[][] = []
  const concurrent: string[][] = []
  if (!text) return { requires, concurrent }

  // A clause a Grade 12 course also satisfies ("Computer Science 30, CMPT 140.3, BINF 151.3",
  // "Biology 30 or BIOL 107") is met by a high-school diploma, so it isn't a university course the
  // plan has to add first.
  const highSchool = (clause: string) => /\b[AB]?30\b(?!\s*credit)/.test(clause)
  // Split on ";" then "and": the AND spine. "or" and comma lists inside a clause stay together. A
  // "; or …" segment is an alternative to the one before it, so when high school covers that one
  // ("(Computer Science 30 …) and (Pre-Calculus 30 …); or MATH 110"), the alternative is moot too.
  let previousCovered = false
  for (const segment of text.split(';')) {
    if (previousCovered && /^\s*or\b/i.test(segment)) continue
    const clauses = segment.split(/\band\b(?!\/)/i)
    previousCovered = clauses.every(highSchool)
    for (const clause of clauses) {
      if (highSchool(clause)) continue
      const codes = codesIn(clause)
      if (codes.length === 0) continue
      if (/can be taken concurrently/i.test(clause)) concurrent.push(codes)
      else requires.push(codes)
    }
  }
  return { requires, concurrent }
}

/**
 * Credit-count prerequisites from a prerequisite line, only where one is a whole AND clause (never an
 * alternative to a course or a permission): "6 credit units of 300-level CMPT", "Completion of at
 * least 6 credit units in 100-level CMPT", "9 credit units of MATH or STAT courses", "Completion of
 * 60 credit units". Admission to or registration in an Honours program becomes an honours standing.
 *
 * `subjects` maps a subject as the catalogue writes it, lower-cased, to its code: "cmpt" and
 * "computer science" both give CMPT. A clause naming a subject it doesn't know is left out.
 */
export function parseCreditRequirements(text: string, subjects: Map<string, string>): CreditRequirement[] {
  const found: CreditRequirement[] = []
  if (!text) return found

  if (
    /\b(admission to|admitted to|registered in|registration in|enrolled in|enrolment in|final year of|final-year)\b[^;.]*\bhonours\b/i.test(text) ||
    /\brestricted to honours\b/i.test(text)
  ) {
    found.push({ cu: 0, standing: 'honours' })
  }

  const list = '([A-Za-z]+(?:(?:,|,? or|,? and\\/or) [A-Za-z]+)*)'
  const lead = '^(?:(?:successful )?completion of )?(?:at least |a minimum of )?(\\d+) credit units?'
  const tail = '(?: courses?)?$'
  const levelFirst = new RegExp(`${lead} (?:of |in |from )?([1-4]00)-level ${list}${tail}`, 'i')
  const levelAfter = new RegExp(`${lead} (?:of |in )?${list} (?:courses )?at the ([1-4]00)[- ]level$`, 'i')
  const subjectOnly = new RegExp(`${lead} (?:of|in|from) ${list}${tail}`, 'i')
  const university = '(?:university[- ]level |university |undergraduate )(?:courses|course work|coursework|studies)'
  const anySubject = new RegExp(`${lead}(?: at the university[- ]level| of ${university})?$`, 'i')
  const codesFor = (names: string) => {
    const codes = names.split(/,|\bor\b|\band\/or\b/i).map((w) => subjects.get(w.trim().toLowerCase()))
    return codes.every(Boolean) ? [...new Set(codes as string[])] : undefined
  }

  // Sentence by sentence ("… 300-level PSY courses. Restricted to Honours students …"); a sentence
  // with a "; or" alternative ("GEOG 222; or 99 credit units …; or permission") is never a hard
  // credit rule, so it's skipped whole. "MATH or STAT" between two subjects is not an alternative.
  for (const sentence of text.split(/\.\s+/)) {
    const segments = sentence.split(';')
    if (segments.slice(1).some((s) => /^\s*or\b/i.test(s)) || /\bor (?:by )?permission\b/i.test(sentence)) continue
    for (const raw of segments.flatMap((s) => s.split(/,?\s+\band\b(?!\/)\s+/i))) {
      const clause = raw.trim().replace(/^and\s+/i, '').replace(/\.$/, '')
      let m: RegExpMatchArray | null
      if ((m = clause.match(levelFirst))) {
        const codes = codesFor(m[3])
        if (codes) found.push({ cu: Number(m[1]), subjects: codes, level: Number(m[2]) })
      } else if ((m = clause.match(levelAfter))) {
        const codes = codesFor(m[2])
        if (codes) found.push({ cu: Number(m[1]), subjects: codes, level: Number(m[3]) })
      } else if ((m = clause.match(subjectOnly))) {
        const codes = codesFor(m[2])
        if (codes) found.push({ cu: Number(m[1]), subjects: codes })
      } else if ((m = clause.match(anySubject))) {
        found.push({ cu: Number(m[1]) })
      }
    }
  }
  return found
}

/**
 * Courses a student can't also get credit for, from this course's Note lines: "Students with credit
 * for CMPT 115, CMPT 117 or CMPT 142 cannot take this course for credit" and "… cannot receive
 * credit for more than one of CMPT 215, EE 331, CME 331" (the others, from this course's view).
 */
export function parseAntirequisites(notes: string[], self: string): string[] {
  const found = new Set<string>()
  for (const note of notes) {
    // Drop credit-unit suffixes ("CMPT 215.3") so a sentence ends only at a real full stop.
    const text = note.replace(/\b([A-Z]{2,4})\s*(\d{3})\.\d+/g, '$1 $2')
    for (const sentence of text.split(/\.\s+|\.$/)) {
      const withCredit = sentence.match(
        /students (?:with|who have|who already have) credit for (.+?) (?:may not|cannot|can not|will not|are not permitted to|may no longer)\s+(?:take|receive credit for|enrol in|register in|register for)\s+(.*)$/i,
      )
      if (withCredit) {
        const object = withCredit[2]
        const objectCodes = codesIn(object)
        if (/this course/i.test(object) || (objectCodes.length === 1 && objectCodes[0] === self)) {
          for (const code of codesIn(withCredit[1])) if (code !== self) found.add(code)
        }
        continue
      }
      const onlyOne = sentence.match(
        /(?:(?:cannot|can not|may not) receive credit for more than one of|(?:may|can) (?:only )?(?:receive|have|get) credit for only one of|(?:may|can) (?:receive|have) credit for only one of|(?:cannot|can not|may not) receive credit for both)\s+(.+)$/i,
      )
      if (onlyOne) {
        const codes = codesIn(onlyOne[1])
        if (codes.includes(self)) for (const code of codes) if (code !== self) found.add(code)
      }
    }
  }
  return [...found].sort()
}

/** The catalogue's `offered` value, normalised (see Offered in src/data/prereqs.ts). */
export function normaliseOffered(value: string | null | undefined, code: string): Offered {
  const v = (value ?? '').trim()
  if (!v) return 'none'
  const known: Record<string, Offered> = {
    'Term 1 only': 'fall',
    'Term 2 only': 'winter',
    'Either Term 1 or Term 2': 'either',
    'Term 1 and 2': 'full-year',
    'Term 3 only': 'spring-summer',
    Spring: 'spring-summer',
    Summer: 'spring-summer',
    'Either Spring or Summer': 'spring-summer',
    'Spring and Summer': 'spring-summer',
  }
  if (known[v]) return known[v]
  console.warn(`${code}: unrecognised offered value ${JSON.stringify(v)}, read loosely`)
  if (/term 3|spring|summer/i.test(v)) return 'spring-summer'
  if (/either/i.test(v)) return 'either'
  if (/term 1 and (term )?2/i.test(v)) return 'full-year'
  if (/term 1/i.test(v)) return 'fall'
  if (/term 2/i.test(v)) return 'winter'
  return 'none'
}

// --- fetching ----------------------------------------------------------------------------------

interface ApiCourse {
  id: string
  subject: string
  subject_name?: string
  course_number: string
  status?: string
  credit_units?: string
  title?: string
  tech?: string | null
  offered?: string | null
}

export interface ScrapedCourse {
  code: string
  title: string
  creditUnits: number
  prerequisiteText: string
  requires: string[][]
  concurrent: string[][]
  creditRequires: CreditRequirement[]
  offered: Offered
  antirequisites: string[]
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

async function getJson<T>(url: string): Promise<T> {
  const res = await fetch(url, { headers: { 'User-Agent': USER_AGENT, Accept: 'application/json' } })
  if (!res.ok) throw new Error(`${url}: HTTP ${res.status}`)
  return (await res.json()) as T
}

async function fetchSubject(subject: string): Promise<ApiCourse[]> {
  await sleep(SPACING_MS)
  try {
    const body = await getJson<{ courses?: ApiCourse[] }>(`${API}?subj_code=${encodeURIComponent(subject)}`)
    const courses = (body.courses ?? []).filter((c) => c.status === 'A' && /^[A-Z]{2,4}\d{3}$/.test(c.id))
    console.log(`${subject}: ${courses.length} courses`)
    return courses
  } catch (err) {
    console.warn(`${subject}: ${(err as Error).message} — skipped`)
    return []
  }
}

async function programPageCodes(): Promise<Map<string, string>> {
  const found = new Map<string, string>()
  for (const url of PROGRAM_PAGES) {
    await sleep(SPACING_MS)
    const res = await fetch(url, { headers: { 'User-Agent': USER_AGENT } })
    if (!res.ok) {
      console.warn(`${url}: HTTP ${res.status} — skipped`)
      continue
    }
    // Program pages write codes with their credit units ("ENG 110.6"), which keeps prose out.
    for (const m of decode(await res.text()).matchAll(/\b([A-Z]{2,4}) (\d{3})\.\d\b/g)) {
      found.set(`${m[1]}${m[2]}`, url.replace(/^.*\//, ''))
    }
  }
  return found
}

/**
 * An extra prerequisite line that binds only some students (EFDT 435: "EXPR 422.15" then "Students
 * pursuing the B.Ed. Direct Entry Program must complete EFDT 101.3; …") stays in the verbatim text
 * but isn't read as everyone's prerequisite. When it's the only line, it's the rule for most takers.
 */
const conditional = (text: string) => /^students (?:pursuing|in|enrolled|registered|who are)\b/i.test(text)

function generalPrerequisite(lines: string[]): string {
  const general = lines.filter((text) => !conditional(text))
  return (general.length > 0 ? general : lines).join('; ')
}

function toScraped(course: ApiCourse, subjectNames: Map<string, string>): ScrapedCourse {
  const lines = splitTech(course.tech ?? '')
  const prerequisite = generalPrerequisite(lines.prerequisite)
  const parsed = parsePrerequisiteCodes(prerequisite)
  const concurrent = [...parsed.concurrent]
  for (const line of lines.corequisite) {
    const co = parsePrerequisiteCodes(line.text)
    concurrent.push(...co.requires, ...co.concurrent)
  }
  // Variable-credit courses say "N/A"; 3 is what a plan slot for one weighs.
  const creditUnits = Number(course.credit_units)
  return {
    code: course.id,
    title: decode(course.title ?? ''),
    creditUnits: Number.isFinite(creditUnits) ? creditUnits : 3,
    // The verbatim rule for the student: the prerequisite line, then any corequisite line with its label.
    prerequisiteText: [...lines.prerequisite, ...lines.corequisite.map((l) => `${l.label} ${l.text}`)].filter(Boolean).join('. '),
    requires: parsed.requires,
    concurrent,
    creditRequires: parseCreditRequirements(prerequisite, subjectNames),
    offered: normaliseOffered(course.offered, course.id),
    antirequisites: parseAntirequisites(lines.notes, course.id),
  }
}

// --- output ------------------------------------------------------------------------------------

const TYPES = `/**
 * When the 2026-27 catalogue says a course runs: 'Term 1 only' → fall, 'Term 2 only' → winter,
 * 'Either Term 1 or Term 2' → either, 'Term 1 and 2' → full-year (a two-term course), 'Term 3 only',
 * 'Spring' or 'Summer' → spring-summer, and no value → none (not scheduled in 2026-27).
 */
export type Offered = 'fall' | 'winter' | 'either' | 'full-year' | 'spring-summer' | 'none'

/** A prerequisite written as credit units rather than courses ("6 credit units of 300-level CMPT"). */
export interface CreditRequirement {
  cu: number
  /** Only these subjects count (['MATH', 'STAT']); absent means any subject. */
  subjects?: string[]
  /** Only courses at this level (100, 300); absent means any level. */
  level?: number
  /** A standing rather than credits (CMPT 400: Honours students only). */
  standing?: 'honours'
}

export interface CourseInfo {
  title: string
  creditUnits: number
  prerequisiteText: string
  /** AND-groups of OR-options that must be passed in an EARLIER term. */
  requires: string[][]
  /**
   * AND-groups of OR-options that may also be taken in the SAME term: "Prerequisite(s) or
   * Corequisite(s)", "Corequisite(s)", and options marked "(can be taken concurrently)".
   */
  concurrent?: string[][]
  /** Credit-count prerequisites the course codes can't express. */
  creditRequires?: CreditRequirement[]
  /** The 2026-27 catalogue's \`offered\` field, normalised. Absent in data scraped before it existed. */
  offered?: Offered
  /** "Students with credit for X may not take this course for credit." */
  antirequisites?: string[]
}`

function creditLiteral(r: CreditRequirement): string {
  const parts = [`cu: ${r.cu}`]
  if (r.subjects) parts.push(`subjects: ${JSON.stringify(r.subjects)}`)
  if (r.level !== undefined) parts.push(`level: ${r.level}`)
  if (r.standing) parts.push(`standing: ${JSON.stringify(r.standing)}`)
  return `{ ${parts.join(', ')} }`
}

function entry(c: ScrapedCourse): string {
  const lines = [
    `  ${c.code}: {`,
    `    title: ${JSON.stringify(c.title)},`,
    `    creditUnits: ${c.creditUnits},`,
    `    prerequisiteText: ${JSON.stringify(c.prerequisiteText)},`,
    `    requires: ${JSON.stringify(c.requires)},`,
  ]
  if (c.concurrent.length > 0) lines.push(`    concurrent: ${JSON.stringify(c.concurrent)},`)
  if (c.creditRequires.length > 0) lines.push(`    creditRequires: [${c.creditRequires.map(creditLiteral).join(', ')}],`)
  lines.push(`    offered: ${JSON.stringify(c.offered)},`)
  if (c.antirequisites.length > 0) lines.push(`    antirequisites: ${JSON.stringify(c.antirequisites)},`)
  lines.push('  },')
  return lines.join('\n')
}

/** "CMPT141" -> ["CMPT", "141"]; course_titles also has short codes like "BIOL90". */
const splitCode = (code: string) => code.match(/^([A-Z]+)(\d+)$/)?.slice(1) as [string, string] | undefined

function activeCoursesFile(titles: Record<string, string>, date: string): string {
  const bySubject = new Map<string, string[]>()
  for (const code of Object.keys(titles).sort()) {
    const parts = splitCode(code)
    if (!parts) {
      console.warn(`course_titles: skipped unexpected code ${JSON.stringify(code)}`)
      continue
    }
    bySubject.set(parts[0], [...(bySubject.get(parts[0]) ?? []), parts[1]])
  }
  const raw = [...bySubject].map(([subject, numbers]) => `${subject} ${numbers.join(' ')}`).join('\n')
  const count = [...bySubject.values()].reduce((n, list) => n + list.length, 0)
  return (
    `// GENERATED by scripts/scrape-catalogue.ts from https://catalogue.usask.ca/api/course_titles on ${date}.\n` +
    `// Do not edit by hand — rerun the scraper instead.\n` +
    `//\n` +
    `// Every active course code in the 2026-27 University Catalogue (${count} codes, graduate courses\n` +
    `// included), as "SUBJ number number …" lines. The offline liveness snapshot: a code not in it is a\n` +
    `// course USask no longer offers (scripts/check-course-codes.ts fails on one a program names).\n\n` +
    `const RAW = \`${raw}\`\n\n` +
    `export const activeCourses: ReadonlySet<string> = new Set(\n` +
    `  RAW.split('\\n').flatMap((line) => {\n` +
    `    const [subject, ...numbers] = line.split(' ')\n` +
    `    return numbers.map((number) => subject + number)\n` +
    `  }),\n` +
    `)\n\n` +
    `/** Whether the 2026-27 catalogue lists this code at all (offered this year or not). */\n` +
    `export const isActiveCourse = (code: string): boolean => activeCourses.has(code)\n`
  )
}

export async function main() {
  const date = new Date().toISOString().slice(0, 10)
  const titles = await getJson<Record<string, string>>(`${API}/course_titles`)
  console.log(`course_titles: ${Object.keys(titles).length} active codes`)

  const named = await namedCourses()
  for (const [code, page] of await programPageCodes()) {
    if (!named.has(code)) named.set(code, [page])
  }

  const byCode = new Map<string, ApiCourse>()
  // How prerequisite lines name a subject: its code or its catalogue name, lower-cased.
  const subjectNames = new Map<string, string>()
  for (const code of Object.keys(titles)) {
    const subject = splitCode(code)?.[0]
    if (subject) subjectNames.set(subject.toLowerCase(), subject)
  }
  const fetched = new Set<string>()
  const subjectOf = (code: string) => code.match(/^[A-Z]+/)?.[0]

  // Start from the subjects the app names, then keep fetching whatever new subject a prerequisite
  // line drags in (CMPT 317 cites EE 216, EE 216 cites MATH, and so on).
  let pending = [...new Set([...named.keys()].map(subjectOf).filter((s): s is string => !!s))].sort()
  while (pending.length > 0) {
    const next = new Set<string>()
    for (const subject of pending) {
      if (fetched.has(subject)) continue
      fetched.add(subject)
      for (const course of await fetchSubject(subject)) {
        byCode.set(course.id, course)
        if (course.subject_name) subjectNames.set(course.subject_name.toLowerCase(), course.subject)
        const lines = splitTech(course.tech ?? '')
        const cited = [...lines.prerequisite, ...lines.corequisite.map((l) => l.text)].flatMap(codesIn)
        for (const code of cited) {
          const s = subjectOf(code)
          if (s && !fetched.has(s)) next.add(s)
        }
      }
    }
    pending = [...next].sort()
  }

  const scraped = new Map<string, ScrapedCourse>()
  for (const course of byCode.values()) scraped.set(course.id, toScraped(course, subjectNames))

  // Ship only what the app can reach: every course its data names, plus everything those depend on
  // (before or alongside). The rest of the catalogue is dead weight in the bundle.
  const reachable = new Set<string>()
  const queue = [...named.keys()]
  for (const code of queue) reachable.add(code)
  while (queue.length > 0) {
    const course = scraped.get(queue.shift()!)
    for (const options of [...(course?.requires ?? []), ...(course?.concurrent ?? [])]) {
      for (const option of options) {
        if (!reachable.has(option)) {
          reachable.add(option)
          queue.push(option)
        }
      }
    }
  }

  const kept = [...scraped.values()].filter((c) => reachable.has(c.code)).sort((a, b) => a.code.localeCompare(b.code))
  const missing = [...reachable].filter((c) => !scraped.has(c)).sort()
  if (missing.length > 0) console.warn(`\nNot in the 2026-27 catalogue (kept out of the graph): ${missing.join(', ')}`)
  const variable = kept.filter((c) => !Number.isFinite(Number(byCode.get(c.code)?.credit_units))).map((c) => c.code)
  if (variable.length > 0) console.warn(`Credit units "N/A" (variable), written as 3: ${variable.join(', ')}`)
  const notTitled = kept.filter((c) => !titles[c.code]).map((c) => c.code)
  if (notTitled.length > 0) console.warn(`In the subject API but not course_titles: ${notTitled.join(', ')}`)

  const file =
    `// GENERATED by scripts/scrape-catalogue.ts from https://catalogue.usask.ca/api (the 2026-27\n` +
    `// University Catalogue) on ${date}. Do not edit by hand — rerun the scraper instead:\n` +
    `// node --experimental-strip-types --experimental-loader ./scripts/_resolve-ts-loader.mjs scripts/scrape-catalogue.ts\n` +
    `//\n` +
    `// Every course the app's data names, plus everything those need first or alongside.\n` +
    `// prerequisiteText is the catalogue's verbatim rule (the Prerequisite(s) line, then any\n` +
    `// corequisite line with its label). \`requires\`, \`concurrent\`, \`creditRequires\` and\n` +
    `// \`antirequisites\` are a best-effort parse of it and the Note lines, used for sequencing; prose\n` +
    `// the parser can't read (permissions, grades) is left out there but survives in prerequisiteText.\n` +
    `// Alternatives the catalogue still names but no longer offers stay in \`requires\` (see\n` +
    `// src/data/activeCourses.ts).\n\n` +
    `${TYPES}\n\n` +
    `export const courseInfo: Record<string, CourseInfo> = {\n${kept.map(entry).join('\n')}\n}\n`

  writeFileSync(new URL('../src/data/prereqs.ts', import.meta.url), file)
  writeFileSync(new URL('../src/data/activeCourses.ts', import.meta.url), activeCoursesFile(titles, date))
  console.log(`\nWrote src/data/prereqs.ts — ${kept.length} of ${scraped.size} scraped courses (reachable closure).`)
  console.log(`Wrote src/data/activeCourses.ts — ${Object.keys(titles).length} active codes.`)
}

if (process.argv[1]?.endsWith('scrape-catalogue.ts')) await main()

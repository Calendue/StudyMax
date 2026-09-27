// Fake, deterministic "class registration" for the demo. No network, no real USask call.

export type SectionType = 'Lecture' | 'Lab' | 'Tutorial'

export interface RegRow {
  crn: string
  code: string
  title: string
  section: string
  type: SectionType
  credits: number
  days: string[]
  start: string
  end: string
  status: 'pending' | 'searching' | 'full' | 'added' | 'registered'
}

export interface RegState {
  termLabel: string
  rows: RegRow[]
  submittedAt: string | null
}

interface FakeSection {
  section: string
  type: SectionType
  crn: string
  days: string[]
  start: string
  end: string
}

function hashCode(code: string): number {
  let h = 0
  for (let i = 0; i < code.length; i++) h = (h * 31 + code.charCodeAt(i)) >>> 0
  return h
}

const MWF = ['Mon', 'Wed', 'Fri']
const TR = ['Tue', 'Thu']

function minutesToTime(mins: number): string {
  const h = Math.floor(mins / 60)
  const m = mins % 60
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`
}

function crnFrom(seed: number): string {
  return String(10000 + (seed % 90000)).slice(0, 5)
}

/** Deterministic fake sections for a course, derived from a hash of its code. */
export function sectionsFor(code: string, hasLab: boolean): FakeSection[] {
  const h = hashCode(code)
  // 8:30 to 16:00 window. MWF: 50 min slots. TR: 80 min slots.
  const mwfStart = 510 + (h % 8) * 55 // 8:30 + up to 7 slots of 55 min
  const trStart = 510 + ((h >> 3) % 6) * 90

  const lecture1: FakeSection = {
    section: '01',
    type: 'Lecture',
    crn: crnFrom(h),
    days: MWF,
    start: minutesToTime(mwfStart),
    end: minutesToTime(mwfStart + 50),
  }
  const lecture2: FakeSection = {
    section: '02',
    type: 'Lecture',
    crn: crnFrom(h + 1),
    days: TR,
    start: minutesToTime(trStart),
    end: minutesToTime(trStart + 80),
  }
  const sections: FakeSection[] = [lecture1, lecture2]

  if (hasLab) {
    const labStart = 510 + ((h >> 5) % 7) * 55
    const labDay = (h >> 7) % 5
    sections.push({
      section: 'L01',
      type: 'Lab',
      crn: crnFrom(h + 2),
      days: [['Mon', 'Tue', 'Wed', 'Thu', 'Fri'][labDay]],
      start: minutesToTime(labStart),
      end: minutesToTime(labStart + 110),
    })
  }
  return sections
}

function toMinutes(t: string): number {
  const [h, m] = t.split(':').map(Number)
  return h * 60 + m
}

function clashes(a: FakeSection, b: FakeSection): boolean {
  if (!a.days.some((d) => b.days.includes(d))) return false
  return toMinutes(a.start) < toMinutes(b.end) && toMinutes(b.start) < toMinutes(a.end)
}

export interface PlanCourseInput {
  code: string
  title: string
  credits: number
}

/**
 * One beat of the agent's script. `type-subject`/`type-number`/`search` point at `courseIndex` (into
 * the input course list, whose search results the panel should be showing); `add` points at
 * `rowIndex` (into the returned `rows`, the specific section it just added).
 */
export type StepAction = 'open' | 'type-subject' | 'type-number' | 'search' | 'add' | 'submit'

export interface RegStep {
  action: StepAction
  text: string
  courseIndex?: number
  rowIndex?: number
  subject?: string
  number?: string
}

/** Same fake sections `pickSchedule` would look up for this course, for rendering search results. */
export function optionsFor(code: string) {
  return sectionsFor(code, hashCode(code) % 3 === 0)
}

export interface PickResult {
  rows: RegRow[]
  steps: RegStep[]
}

/** "CMPT370" -> { subject: "CMPT", number: "370" }. */
function splitCode(code: string): { subject: string; number: string } {
  const m = code.match(/^([A-Z]+)(\d+)$/)
  return m ? { subject: m[1], number: m[2] } : { subject: code, number: '' }
}

/**
 * Greedy scheduler: for each course, pick the first section (in declared order) that doesn't clash
 * with sections already picked. The very first course's first section is always marked full, so the
 * agent visibly falls back to its next section. Alongside the rows, it scripts the search-and-add
 * steps an agent driving the real form would take, one per course (typing, searching, adding) plus
 * a closing submit.
 */
export function pickSchedule(courses: PlanCourseInput[]): PickResult {
  const steps: RegStep[] = []
  const rows: RegRow[] = []
  const picked: FakeSection[] = []
  // Group by course so we choose one lecture + (if present) one lab per course.
  courses.forEach((course, courseIndex) => {
    const { subject, number } = splitCode(course.code)
    steps.push({ action: 'type-subject', courseIndex, subject, text: `Typing ${subject}` })
    steps.push({ action: 'type-number', courseIndex, number, text: `Typing ${number}` })
    steps.push({ action: 'search', courseIndex, text: `Searching ${course.code}` })

    const hasLab = hashCode(course.code) % 3 === 0
    const options = sectionsFor(course.code, hasLab)
    const lectures = options.filter((s) => s.type === 'Lecture')
    const others = options.filter((s) => s.type !== 'Lecture')

    let chosenLecture: FakeSection | null = null
    for (let i = 0; i < lectures.length; i++) {
      const candidate = lectures[i]
      const isFirstCourseFirstSection = courseIndex === 0 && i === 0
      if (isFirstCourseFirstSection) {
        steps.push({
          action: 'search',
          courseIndex,
          text: `Section ${candidate.section} is full, taking ${lectures[i + 1]?.section ?? candidate.section}`,
        })
        continue
      }
      if (!picked.some((p) => clashes(p, candidate))) {
        chosenLecture = candidate
        break
      }
    }
    if (chosenLecture) {
      picked.push(chosenLecture)
      rows.push({
        crn: chosenLecture.crn,
        code: course.code,
        title: course.title,
        section: chosenLecture.section,
        type: chosenLecture.type,
        credits: course.credits,
        days: chosenLecture.days,
        start: chosenLecture.start,
        end: chosenLecture.end,
        status: 'pending',
      })
      steps.push({ action: 'add', rowIndex: rows.length - 1, text: `Adding ${course.code} (Section ${chosenLecture.section})` })
    }

    for (const extra of others) {
      if (picked.some((p) => clashes(p, extra))) continue
      picked.push(extra)
      rows.push({
        crn: extra.crn,
        code: course.code,
        title: course.title,
        section: extra.section,
        type: extra.type,
        credits: 0,
        days: extra.days,
        start: extra.start,
        end: extra.end,
        status: 'pending',
      })
      steps.push({ action: 'add', rowIndex: rows.length - 1, text: `Adding ${course.code} (Section ${extra.section})` })
    }
  })

  steps.push({ action: 'submit', text: 'Submitting' })

  return { rows, steps }
}

export const STORAGE_KEY = 'studymax:mock-registration'

export function load(termLabel: string): RegState | null {
  try {
    const parsed = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? 'null') as RegState | null
    return parsed && parsed.termLabel === termLabel ? parsed : null
  } catch {
    return null
  }
}

export function save(state: RegState) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state))
  } catch {
    // storage blocked: the registration still works for this session
  }
}

export function clear() {
  try {
    localStorage.removeItem(STORAGE_KEY)
  } catch {
    // ignore
  }
}

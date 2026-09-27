// Scrapes verbatim prerequisite text from the USask course catalogue and regenerates
// src/data/prereqs.ts. Run: node --experimental-strip-types scripts/scrape-prereqs.ts
//
// The catalogue's own search form is a plain GET — one request per subject with cnum=% returns
// every course in that subject, so the whole graph is ~16 requests.
import { writeFileSync } from 'node:fs'
import { programs } from '../src/data/programs/index.ts'

const SEARCH = 'https://catalogue.usask.ca/?subj_code=$SUBJ&cnum=%25'

/** Every subject code referenced by any program's requirement data. */
function subjectsInUse(): string[] {
  const subjects = new Set<string>()
  for (const program of programs) {
    for (const spec of program.specializations) {
      for (const group of spec.requirements) {
        for (const course of group.courses) {
          const subject = course.match(/^[A-Z]+/)?.[0]
          if (subject) subjects.add(subject)
        }
      }
    }
  }
  return [...subjects].sort()
}

function decode(html: string): string {
  return html
    .replace(/<[^>]*>/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&nbsp;/g, ' ')
    .replace(/&#(\d+);/g, (_, d) => String.fromCharCode(Number(d)))
    .replace(/&[a-z]+;/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

export interface ScrapedCourse {
  code: string
  title: string
  creditUnits: number
  /** Verbatim catalogue text. Empty string means the catalogue lists no prerequisite. */
  prerequisiteText: string
}

/** Pulls one record per course out of a subject search results page. */
export function parseSubjectPage(html: string, subject: string): ScrapedCourse[] {
  const courses: ScrapedCourse[] = []
  // Each course starts with an <h4> linking to /SUBJ-NUM; the block runs to the next one.
  const blocks = html.split(/(?=<h4>\s*<a href="https:\/\/catalogue\.usask\.ca\/[A-Z]+-\d+")/i).slice(1)

  for (const block of blocks) {
    const heading = block.match(
      new RegExp(`${subject}\\s+(\\d+)\\.(\\d+(?:\\.\\d+)?)\\s*:\\s*([^<]+)`, 'i'),
    )
    if (!heading) continue

    const prereq = block.match(/<b>\s*Prerequisite\(s\)\s*:\s*<\/b>([\s\S]*?)(?:<br\s*\/?>|<\/p>)/i)

    courses.push({
      code: `${subject}${heading[1]}`,
      title: decode(heading[3]),
      creditUnits: Number(heading[2]),
      prerequisiteText: prereq ? decode(prereq[1]).replace(/\.$/, '') : '',
    })
  }

  return courses
}

/**
 * Best-effort structured read of a prerequisite line, for sequencing.
 *
 * Returns groups in AND relationship, each group being OR options: "CMPT 141 and one of MATH 110,
 * MATH 121" -> [['CMPT141'], ['MATH110','MATH121']]. Anything the catalogue phrases in prose we
 * can't parse ("permission of the department", "60 credit units") is simply left out of the graph —
 * `prerequisiteText` is always kept verbatim so the UI can show the real rule regardless.
 */
export function parsePrerequisiteCodes(text: string): string[][] {
  if (!text) return []
  const groups: string[][] = []

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
    const clauses = segment.split(/\band\b/i)
    previousCovered = clauses.every(highSchool)
    for (const clause of clauses) {
      if (highSchool(clause)) continue
      const codes = [...clause.matchAll(/\b([A-Z]{2,4})\s*(\d{3})\b/g)].map((m) => `${m[1]}${m[2]}`)
      if (codes.length > 0) groups.push([...new Set(codes)])
    }
  }

  return groups
}

async function fetchSubject(subject: string): Promise<ScrapedCourse[]> {
  const res = await fetch(SEARCH.replace('$SUBJ', subject))
  if (!res.ok) {
    console.warn(`${subject}: HTTP ${res.status} — skipped`)
    return []
  }
  const found = parseSubjectPage(await res.text(), subject)
  console.log(`${subject}: ${found.length} courses, ${found.filter((c) => c.prerequisiteText).length} with prerequisites`)
  return found
}

async function main() {
  const byCode = new Map<string, ScrapedCourse>()
  const fetched = new Set<string>()

  // Start from the subjects the programs name, then keep fetching whatever new subject a
  // prerequisite line drags in (CMPT 317 cites EE 216, EE 216 cites MATH, and so on).
  let pending = subjectsInUse()
  while (pending.length > 0) {
    const next = new Set<string>()
    for (const subject of pending) {
      if (fetched.has(subject)) continue
      fetched.add(subject)
      for (const course of await fetchSubject(subject)) {
        byCode.set(course.code, course)
        for (const options of parsePrerequisiteCodes(course.prerequisiteText)) {
          for (const option of options) {
            const cited = option.match(/^[A-Z]+/)?.[0]
            if (cited && !fetched.has(cited)) next.add(cited)
          }
        }
      }
    }
    pending = [...next]
  }

  // Ship only what the app can reach: every course named by a program's requirements, plus
  // everything those transitively depend on. The rest of the catalogue is dead weight in the bundle.
  const reachable = new Set<string>()
  const queue: string[] = []
  for (const program of programs) {
    for (const spec of program.specializations) {
      for (const group of spec.requirements) {
        for (const course of group.courses) {
          if (!reachable.has(course)) {
            reachable.add(course)
            queue.push(course)
          }
        }
      }
    }
  }
  while (queue.length > 0) {
    const code = queue.shift()!
    for (const options of parsePrerequisiteCodes(byCode.get(code)?.prerequisiteText ?? '')) {
      for (const option of options) {
        if (!reachable.has(option)) {
          reachable.add(option)
          queue.push(option)
        }
      }
    }
  }

  const all = [...byCode.values()]
  const kept = all.filter((c) => reachable.has(c.code)).sort((a, b) => a.code.localeCompare(b.code))
  const missing = [...reachable].filter((c) => !byCode.has(c)).sort()
  if (missing.length > 0) console.warn(`\nNot found in the catalogue (kept out of the graph): ${missing.join(', ')}`)

  const entries = kept
    .map(
      (c) =>
        `  ${c.code}: {\n` +
        `    title: ${JSON.stringify(c.title)},\n` +
        `    creditUnits: ${c.creditUnits},\n` +
        `    prerequisiteText: ${JSON.stringify(c.prerequisiteText)},\n` +
        `    requires: ${JSON.stringify(parsePrerequisiteCodes(c.prerequisiteText))},\n` +
        `  },`,
    )
    .join('\n')

  const file =
    `// GENERATED by scripts/scrape-prereqs.ts from catalogue.usask.ca on ${new Date().toISOString().slice(0, 10)}.\n` +
    `// Do not edit by hand — rerun the scraper instead.\n` +
    `//\n` +
    `// prerequisiteText is the catalogue's verbatim line. \`requires\` is a best-effort parse of it\n` +
    `// into AND-groups of OR-options, used only for sequencing; prose conditions the parser can't\n` +
    `// read are omitted there but always survive in prerequisiteText.\n\n` +
    `export interface CourseInfo {\n` +
    `  title: string\n` +
    `  creditUnits: number\n` +
    `  prerequisiteText: string\n` +
    `  requires: string[][]\n` +
    `}\n\n` +
    `export const courseInfo: Record<string, CourseInfo> = {\n${entries}\n}\n`

  writeFileSync(new URL('../src/data/prereqs.ts', import.meta.url), file)
  console.log(`\nWrote src/data/prereqs.ts — ${kept.length} of ${all.length} scraped courses (reachable closure).`)
}

if (process.argv[1]?.endsWith('scrape-prereqs.ts')) await main()

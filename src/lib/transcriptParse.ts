export interface TranscriptParseResult {
  completed: string[]
  inProgress: string[]
}

/**
 * Builds the prompt for extracting a student's full course history from an uploaded
 * transcript/degree-audit PDF. Extraction is program-agnostic on purpose — it captures every
 * course on the document, in every subject. Matching those courses against a specific
 * specialization's requirements happens later, separately, and never filters what gets extracted.
 */
export function buildTranscriptParsePrompt(): string {
  return [
    'This document is a student transcript or degree-audit (e.g. DegreeWorks) PDF from a Canadian university.',
    '',
    'Extract EVERY course that appears anywhere on this document, in every subject — do not filter by ' +
      'department or program. If it lists MATH, ECON, PHYS, PSY, ENG, ASTR, LING, PHIL, CMPT, STAT courses, ' +
      'or any other subject, capture all of them.',
    '',
    'Classify each course into exactly one of two buckets:',
    '- "completed": the student finished the course with a passing grade. Excludes failed, withdrawn, or ' +
      'excluded/superseded attempts. Transfer credit and credit by exam (TR, CR, EX and the like) count as ' +
      'completed when the document gives them a real course code at this university; skip unassigned credit ' +
      'with no course number (e.g. "CMPT 1XX").',
    '- "inProgress": the student is registered in the course for the current or an upcoming term and it is not ' +
      'graded yet, often listed under a heading like "Courses in Progress", "In Progress" or "Registered".',
    'Never list a course the student has only planned: leave out DegreeWorks "Look-Ahead" courses, anything ' +
      'under "Plans" or a planner, and courses marked planned. They are not registered.',
    '',
    'If a course code appears more than once, handle it by what actually happened:',
    '- Failed or withdrawn, then later passed (a retake after failing): list it once under "completed" only.',
    '- Already passed once, and now being taken again (a retake to improve the grade): list it under ' +
      '"completed" only; the earlier pass still counts.',
    '- Every attempt failed or was withdrawn with no pass on record: omit it entirely.',
    'Never list the same code twice within the same bucket, or in both buckets.',
    '',
    'Also report the program the document states, so the student is not asked again:',
    '- "major": the declared major or program exactly as written (e.g. from "Major: Computer Science" or ' +
      '"B.Comm. - Accounting"), or null if the document does not state one. Never guess it from the courses.',
    '- "minor": a declared minor exactly as written, or null if none is stated.',
    '',
    'Report the terms the document gives, exactly as written and always with the year (e.g. "2026 Fall Term", ' +
      '"Winter 2027", "Spring 2027"). Never drop the year, and never guess a term: omit a course whose term is ' +
      'not stated.',
    '- "completedTerms": for every "completed" course, the term of its passing attempt.',
    '- "inProgressTerms": for every "inProgress" course, the term it is registered in.',
    '- "documentDate": the date the audit or transcript was run or printed, as YYYY-MM-DD, or null if it shows none.',
    '',
    'Respond with ONLY a JSON object of this exact shape, nothing else:',
    '{"completed":["CODE123","CODE456"],"completedTerms":{"CODE123":"2025 Fall Term","CODE456":"Winter 2026"},' +
      '"inProgress":["CODE789"],"inProgressTerms":{"CODE789":"2026 Fall Term"},"documentDate":"2026-08-06",' +
      '"major":"Computer Science","minor":null}',
    'Course codes: uppercase subject letters directly followed by the number, no space, no period, no credit-' +
      'unit suffix. Example: "MATH 110.3" becomes "MATH110".',
    'If a bucket is empty, use an empty array for it — never omit a bucket.',
  ].join('\n')
}

export interface TranscriptProgram {
  major: string | null
  minor: string | null
}

/**
 * The major and minor the document states, as free text (mapped to a program id by the caller).
 * Kept apart from parseTranscriptResponse so the course lists keep their exact shape.
 */
export function parseTranscriptProgram(text: string): TranscriptProgram {
  const parsed = jsonOf(text)
  // Free text from a model: a short string or nothing, never an object or a paragraph.
  const field = (v: unknown) => (typeof v === 'string' && v.trim() && v.length <= 120 ? v.trim() : null)
  return { major: field(parsed?.major), minor: field(parsed?.minor) }
}

export type TermSeason = 'Fall' | 'Winter' | 'Spring/Summer'

/** A term label as a document writes it, to the season the plan uses; null when it names none. */
export function seasonOf(label: string): TermSeason | null {
  if (/fall|autumn/i.test(label)) return 'Fall'
  if (/winter/i.test(label)) return 'Winter'
  if (/spring|summer/i.test(label)) return 'Spring/Summer'
  return null
}

/**
 * A term label as a document writes it, to the "Season YYYY" the plan and the tree use: "2026 Fall
 * Term" and "Fall 2026" are "Fall 2026", "Summer 2027" is "Spring/Summer 2027". An academic-year range
 * ("2026-27 Winter Term") puts Fall in its first year and the rest in its second. Null when the label
 * names no season or no single year ("2025-26 Regular Session", "Fall").
 */
export function parseTermLabel(label: string): string | null {
  if (typeof label !== 'string' || label.length > 60) return null
  const season = seasonOf(label)
  if (!season) return null
  const range = label.match(/\b((?:19|20)\d{2})\s*[-–/]\s*(?:\d{2}|(?:19|20)\d{2})\b/)
  if (range) return `${season} ${season === 'Fall' ? Number(range[1]) : Number(range[1]) + 1}`
  const years = new Set(label.match(/\b(?:19|20)\d{2}\b/g) ?? [])
  return years.size === 1 ? `${season} ${[...years][0]}` : null
}

/** The JSON object in a model's answer (it may sit inside prose), or null. */
function jsonOf(text: string): Record<string, unknown> | null {
  const start = text.indexOf('{')
  const end = text.lastIndexOf('}')
  if (start === -1 || end < start) return null
  try {
    const parsed = JSON.parse(text.slice(start, end + 1))
    return typeof parsed === 'object' && parsed !== null ? parsed : null
  } catch {
    return null
  }
}

export interface TranscriptTimeline {
  /** Each in-progress course's season, the shape installed apps already read. */
  inProgressTerms: Record<string, TermSeason>
  /** Each in-progress course's term as "Season YYYY", where the document gives the year. */
  inProgressTermLabels: Record<string, string>
  /** The term each completed course was passed in, as "Season YYYY", where the document dates it. */
  completedTerms: Record<string, string>
  /** The day the audit or transcript was run or printed (YYYY-MM-DD), or null. */
  documentDate: string | null
}

/**
 * When things happened, where the document says: the terms of the courses parseTranscriptResponse
 * kept (a term for a course it dropped is dropped too) and the document's own date. Kept apart from
 * parseTranscriptResponse, like the program, so the course lists keep their exact shape.
 */
export function parseTranscriptTimeline(text: string, courses: TranscriptParseResult): TranscriptTimeline {
  const parsed = jsonOf(text)
  // Each kept course's term as written; a label is a short string, never an object or a paragraph.
  const termsAsWritten = (raw: unknown, keep: string[]): [string, string][] => {
    if (!raw || typeof raw !== 'object') return []
    const kept = new Set(keep)
    const out: [string, string][] = []
    for (const [code, label] of Object.entries(raw)) {
      if (typeof label === 'string' && label.length <= 60 && kept.has(normalizeCode(code))) out.push([normalizeCode(code), label])
    }
    return out
  }
  const labelled = (entries: [string, string][]) => {
    const out: Record<string, string> = {}
    for (const [code, label] of entries) {
      const term = parseTermLabel(label)
      if (term) out[code] = term
    }
    return out
  }

  const inProgress = termsAsWritten(parsed?.inProgressTerms, courses.inProgress)
  const inProgressTerms: Record<string, TermSeason> = {}
  for (const [code, label] of inProgress) {
    const season = seasonOf(label)
    if (season) inProgressTerms[code] = season
  }
  const date = typeof parsed?.documentDate === 'string' ? parsed.documentDate.trim() : ''
  return {
    inProgressTerms,
    inProgressTermLabels: labelled(inProgress),
    completedTerms: labelled(termsAsWritten(parsed?.completedTerms, courses.completed)),
    documentDate: /^(19|20)\d{2}-\d{2}-\d{2}$/.test(date) && !Number.isNaN(Date.parse(date)) ? date : null,
  }
}

function normalizeCode(raw: string): string {
  return raw.toUpperCase().replace(/\s+/g, '').replace(/\.\d+$/, '')
}

/**
 * Extracts {completed, inProgress} from a model response. Every returned code is validated
 * against `catalogueCodes` — pass the FULL course catalogue, not one program's course list, so
 * extraction never gets narrowed to a single subject. A hard guard against inventing a code the
 * model made up, without limiting what can legitimately be found.
 *
 * A course already passed is completed, even if the document also shows a newer attempt under way
 * (a retake for a better grade): it's dropped from in progress, so no course is ever both.
 */
export function parseTranscriptResponse(text: string, catalogueCodes: string[]): TranscriptParseResult {
  const parsed = jsonOf(text)
  if (!parsed) return { completed: [], inProgress: [] }

  const catalogueSet = new Set(catalogueCodes)
  const normalizeList = (list: unknown): string[] => {
    if (!Array.isArray(list)) return []
    const out = new Set<string>()
    for (const item of list) {
      if (typeof item !== 'string') continue
      const code = normalizeCode(item)
      if (catalogueSet.has(code)) out.add(code)
    }
    return [...out]
  }

  const completed = normalizeList(parsed.completed)
  const done = new Set(completed)
  return { completed, inProgress: normalizeList(parsed.inProgress).filter((code) => !done.has(code)) }
}

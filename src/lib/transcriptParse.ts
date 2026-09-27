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
      'excluded/superseded attempts.',
    '- "inProgress": the course is currently in progress, registered, or planned but not yet graded — often ' +
      'listed under a separate heading like "Courses in Progress" or "In Progress".',
    '',
    'If a course code appears more than once, handle it by what actually happened:',
    '- Failed or withdrawn, then later passed (a retake after failing): list it once under "completed" only.',
    '- Already passed once, and now being taken again (e.g. to improve the grade): list it under "completed" ' +
      '(the earlier pass still counts) AND under "inProgress" if that newer attempt is still ungraded.',
    '- Every attempt failed or was withdrawn with no pass on record: omit it entirely.',
    'Never list the same code twice within the same bucket.',
    '',
    'Also report the program the document states, so the student is not asked again:',
    '- "major": the declared major or program exactly as written (e.g. from "Major: Computer Science" or ' +
      '"B.Comm. - Accounting"), or null if the document does not state one. Never guess it from the courses.',
    '- "minor": a declared minor exactly as written, or null if none is stated.',
    '',
    'For every course, completed or in progress, also report the single term the document lists it under, ' +
      'exactly as written (e.g. "2024 Fall Term", "Winter 2027", "2025 Spring Term"), in "terms". A completed ' +
      'course passed in a Spring or Summer term keeps that term. Leave a course out of "terms" when no single ' +
      'term is stated for it, such as transfer or advanced-placement credit listed under a range of years ' +
      '(e.g. "2023-PRESENT"). That only affects "terms": transfer credit with a real course code still goes ' +
      'in "completed". Never guess a term.',
    '',
    'Respond with ONLY a JSON object of this exact shape, nothing else:',
    '{"completed":["CODE123","CODE456"],"inProgress":["CODE789"],"terms":{"CODE123":"2024 Fall Term","CODE456":"2025 Spring Term","CODE789":"2026 Fall Term"},"major":"Computer Science","minor":null}',
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
  const none: TranscriptProgram = { major: null, minor: null }
  const start = text.indexOf('{')
  const end = text.lastIndexOf('}')
  if (start === -1 || end < start) return none
  try {
    const parsed = JSON.parse(text.slice(start, end + 1))
    // Free text from a model: a short string or nothing, never an object or a paragraph.
    const field = (v: unknown) => (typeof v === 'string' && v.trim() && v.length <= 120 ? v.trim() : null)
    return { major: field(parsed?.major), minor: field(parsed?.minor) }
  } catch {
    return none
  }
}

/** A term label as a document writes it, to the season the plan uses; null when it names none. */
export function seasonOf(label: string): 'Fall' | 'Winter' | 'Spring/Summer' | null {
  if (/fall|autumn/i.test(label)) return 'Fall'
  if (/winter/i.test(label)) return 'Winter'
  if (/spring|summer/i.test(label)) return 'Spring/Summer'
  return null
}

/** "2025 Spring Term", "Winter 2027" → "Spring/Summer 2025", "Winter 2027"; null without one clear year. */
export function termLabelOf(label: string): string | null {
  const season = seasonOf(label)
  const years = label.match(/\b(19|20)\d{2}\b/g) ?? []
  // A range ("2023-PRESENT", "2021-2023") is transfer credit, not a term.
  if (!season || years.length !== 1 || /present|-\s*\d/i.test(label)) return null
  return `${season} ${years[0]}`
}

/** The raw `terms` (every course) and older `inProgressTerms` objects from a model response. */
function rawTerms(text: string): [string, string][] {
  const start = text.indexOf('{')
  const end = text.lastIndexOf('}')
  if (start === -1 || end < start) return []
  try {
    const parsed = JSON.parse(text.slice(start, end + 1))
    return [parsed?.inProgressTerms, parsed?.terms].flatMap((raw) =>
      raw && typeof raw === 'object'
        ? Object.entries(raw).flatMap(([code, label]) => (typeof label === 'string' && label.length <= 60 ? [[normalizeCode(code), label] as [string, string]] : []))
        : [],
    )
  } catch {
    return []
  }
}

/**
 * The term each course is listed under, where the document says, as "Fall 2024". Kept apart from
 * parseTranscriptResponse, like the program, so the course lists keep their exact shape.
 */
export function parseTranscriptTermLabels(text: string): Record<string, string> {
  const out: Record<string, string> = {}
  for (const [code, label] of rawTerms(text)) {
    const term = termLabelOf(label)
    if (term) out[code] = term
  }
  return out
}

/** Which season each course is in, where the document says (the in-progress courses' terms). */
export function parseTranscriptTerms(text: string): Record<string, 'Fall' | 'Winter' | 'Spring/Summer'> {
  const out: Record<string, 'Fall' | 'Winter' | 'Spring/Summer'> = {}
  for (const [code, label] of rawTerms(text)) {
    const season = seasonOf(label)
    if (season) out[code] = season
  }
  return out
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
 * A code can legitimately appear in BOTH buckets — already passed once, currently being retaken
 * for a better grade — so this never forces exclusivity between them; only the prompt's own
 * instructions decide that.
 */
export function parseTranscriptResponse(text: string, catalogueCodes: string[]): TranscriptParseResult {
  const empty: TranscriptParseResult = { completed: [], inProgress: [] }
  const start = text.indexOf('{')
  const end = text.lastIndexOf('}')
  if (start === -1 || end === -1 || end < start) return empty

  const catalogueSet = new Set(catalogueCodes)

  try {
    const parsed = JSON.parse(text.slice(start, end + 1))
    if (typeof parsed !== 'object' || parsed === null) return empty

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

    return { completed: normalizeList(parsed.completed), inProgress: normalizeList(parsed.inProgress) }
  } catch {
    return empty
  }
}

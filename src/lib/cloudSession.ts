// What a signed-in student's session looks like on the wire between the app and /api/session.
// It's the part of the app's saved state the database has columns for (see prisma/schema.prisma);
// the rest (graduation year, the plan's start term) stays on the device only.

export interface CloudSession {
  universityId: '' | 'usask' | 'other'
  programId: string
  completed: string[]
  inProgress: string[]
  /** Whether onboarding reached the results. Stored as "a StudentProfile row exists". */
  revealed: boolean
  studentType: 'first-year' | 'existing' | null
  degree: string
  minorId: string | null
  concentrationIds: string[]
  /** Onboarding's "What courses have you registered for?" answers (this term). */
  registered: string[]
  /** Onboarding's phone number. Omitted when the student hasn't given one, which leaves a stored one as is. */
  phone?: string
  /** Plan generation's load limits: Spring/Summer terms on or off, and the most courses per term. */
  springSummer: boolean
  coursesPerTerm: number
  summerPerTerm: number
  /**
   * The internship question: the year of the degree the plan keeps free, not sure, or none; null
   * when never answered. Omitted by app builds from before it, which leaves a stored answer as is.
   */
  internship?: CloudInternship | null
  /**
   * The academic year (its Fall's calendar year) that internship takes, as the app resolved it from
   * the transcript's dated terms; null without a year. Max's plan snapshot leaves it empty. Omitted
   * by app builds from before it, which leaves a stored one as is.
   */
  internshipAY?: number | null
}

/** The internship question's answers, as the app keeps them (App.tsx's Internship). */
export type CloudInternship = 3 | 4 | 'unsure' | 'no'

/** A plausible academic year (2000-2100), else null. */
export function academicYearFrom(value: unknown): number | null {
  return typeof value === 'number' && Number.isInteger(value) && value >= 2000 && value <= 2100 ? value : null
}

/** "3" → 3, "unsure" → 'unsure': a stored answer or a sent one, anything else null. */
export function internshipFrom(value: unknown): CloudInternship | null {
  if (value === 3 || value === '3') return 3
  if (value === 4 || value === '4') return 4
  return value === 'unsure' || value === 'no' ? value : null
}

/** The choices the app offers; anything outside them is stored as the default instead. */
export const MAX_COURSES_PER_TERM = 5
export const MAX_SUMMER_COURSES = 3
// A full Fall/Winter load (the college's 15 credit units); a light Spring/Summer one.
const DEFAULT_PER_TERM = 5
const DEFAULT_SUMMER = 2

/** The one Institution row the app's `usask` choice maps to (seeded from scripts/). */
export const USASK_INSTITUTION = 'University of Saskatchewan'

const CODE_RE = /^[A-Z]{2,5}\s?\d{2,4}[A-Z]?$/
// Same shape api/call-me.ts accepts, so a stored number is always one Max can dial.
const PHONE_RE = /^\+?[0-9()\-.\s]{7,20}$/
const SLUG_RE = /^[a-z0-9-]{1,80}$/
const MAX_COURSES = 200

const codes = (value: unknown) =>
  Array.isArray(value)
    ? [...new Set(value.filter((c): c is string => typeof c === 'string' && CODE_RE.test(c)))].slice(0, MAX_COURSES)
    : []

const count = (value: unknown, max: number, fallback: number) =>
  typeof value === 'number' && Number.isInteger(value) && value >= 1 && value <= max ? value : fallback

const slug = (value: unknown) => (typeof value === 'string' && SLUG_RE.test(value) ? value : null)

/** Keeps only the shapes the app itself sends; anything else is dropped rather than stored. */
export function cleanCloudSession(raw: unknown): CloudSession | null {
  const s = raw as Partial<Record<keyof CloudSession, unknown>> | null | undefined
  if (!s || typeof s !== 'object') return null
  const universityId = s.universityId === 'usask' || s.universityId === 'other' ? s.universityId : ''
  const studentType = s.studentType === 'first-year' || s.studentType === 'existing' ? s.studentType : null
  return {
    universityId,
    programId: slug(s.programId) ?? '',
    completed: codes(s.completed),
    inProgress: codes(s.inProgress),
    revealed: s.revealed === true,
    studentType,
    degree: typeof s.degree === 'string' ? s.degree.slice(0, 120) : '',
    minorId: slug(s.minorId),
    concentrationIds: Array.isArray(s.concentrationIds)
      ? s.concentrationIds.map(slug).filter((id): id is string => id !== null).slice(0, 20)
      : [],
    registered: codes(s.registered),
    springSummer: s.springSummer === true,
    coursesPerTerm: count(s.coursesPerTerm, MAX_COURSES_PER_TERM, DEFAULT_PER_TERM),
    summerPerTerm: count(s.summerPerTerm, MAX_SUMMER_COURSES, DEFAULT_SUMMER),
    ...(typeof s.phone === 'string' && PHONE_RE.test(s.phone.trim()) ? { phone: s.phone.trim() } : {}),
    ...(s.internship !== undefined ? { internship: internshipFrom(s.internship) } : {}),
    ...(s.internshipAY !== undefined ? { internshipAY: academicYearFrom(s.internshipAY) } : {}),
  }
}

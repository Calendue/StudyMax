import { useEffect, useMemo, useRef, useState, type ComponentType } from 'react'
import { AnimatePresence, motion, useReducedMotion } from 'motion/react'
import { computeMatches, computeCourseOverlap, type SpecializationMatch } from './lib/match.ts'
import { rankByUrgency, daysUntil, formatCountdown } from './lib/resources.ts'
import type { GuidanceResult } from './lib/scholarshipAi.ts'
import type { Specialization } from './data/specializations.ts'
import { findSchool } from './data/schools/index.ts'
import { usask } from './data/schools/usask.ts'
import type { School } from './data/schools/types.ts'
import { computerScience } from './data/programs/computerScience.ts'
import type { Program } from './data/programs/types.ts'
import { buildCallScript, type CallContext } from './lib/callScript.ts'
import { buildPlan, upcomingTerm } from './lib/plan.ts'
import { computeCredentials } from './lib/credentials.ts'
import { searchCourses, catalogueTitle } from './lib/courseSearch.ts'
import { courseInfo } from './data/prereqs.ts'
import { artsAndScienceSubjects } from './data/courses.ts'
import { api, haptic, onBackButton } from './platform.ts'
import { authAvailable, currentAccount, isCancel, signIn, signOut, type Account, type Provider } from './auth.ts'
import { ModelContext } from './model.ts'
import { courseCode, type TargetKind } from './format.ts'
import { DUR, INSTANT, SETTLE } from './ui/motion.ts'
import { Intro } from './screens/Intro.tsx'
import { WelcomeScreen } from './screens/WelcomeScreen.tsx'
import { AccountSheet } from './screens/AccountSheet.tsx'
import { SchoolScreen } from './screens/SchoolScreen.tsx'
import { CoursesScreen } from './screens/CoursesScreen.tsx'
import { ReadingScreen } from './screens/ReadingScreen.tsx'
import { RevealScreen } from './screens/RevealScreen.tsx'
import { ResultsScreen } from './screens/ResultsScreen.tsx'
import { CallScreen } from './screens/CallScreen.tsx'
import './App.css'

function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve((reader.result as string).split(',')[1] ?? '')
    reader.onerror = reject
    reader.readAsDataURL(file)
  })
}

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

type Lookup =
  | { kind: 'verified'; school: School; whyYou: Record<string, string>; loadingWhy: boolean }
  | { kind: 'guidance'; schoolName: string; program: string; loading: boolean; result: GuidanceResult | null; error: string | null }

type UniversityChoice = '' | 'usask' | 'other'

/** The flow, in order. Results is tabbed; the call is the last step. */
export type Screen = 'welcome' | 'school' | 'courses' | 'reading' | 'reveal' | 'results' | 'call'
export type Tab = 'overview' | 'plan' | 'awards'

// Selected when the student picks "Other university": no course-matching data exists for it, so it
// routes straight to the AI-guidance fallback on the awards tab.
const OTHER_PROGRAM: Program = { id: 'other', name: 'your program', specializations: [], courseTitles: {} }

// Safe fallback so the overview, awards and call never crash when there's no program data yet.
const EMPTY_SPEC: Specialization = { id: 'none', name: 'your program', requirements: [] }
const EMPTY_MATCH: SpecializationMatch = { spec: EMPTY_SPEC, totalRequired: 0, doneCount: 0, remaining: 0, unsatisfied: [] }

// Vercel's serverless request body limit is 4.5 MB; base64 costs about a third on top, so keep a
// margin under it and fail before the upload rather than after.
const MAX_TRANSCRIPT_BYTES = 3_000_000

// Awards per "why you" request; see findResources.
const WHY_BATCH = 3

/** An upload failure whose message is safe and useful to show the student verbatim. */
class UploadError extends Error {}

// A program the school data doesn't cover yet is identified by its Arts & Science subject code, so
// the choice survives a refresh the same way a real program id does.
const SUBJECT_PROGRAM_PREFIX = 'subject:'

export interface ProgramOption {
  id: string
  name: string
  /** Present only for programs derived from an Arts & Science subject. */
  subjectCode?: string
  /** Whether StudyMax has requirement data, i.e. whether it can build a plan or only find money. */
  hasData: boolean
}

const SAVE_KEY = 'studymax:v1'

interface SavedState {
  universityId: UniversityChoice
  programId: string
  completed: string[]
  revealed: boolean
}

// Intake selections survive a refresh so a half-finished session isn't lost. The phone number is
// deliberately excluded: it never touches storage. A signed-in student's state is kept under their
// Firebase uid, so two people on one phone don't see each other's courses.
function saveKeyFor(uid: string | null) {
  return uid ? `${SAVE_KEY}:${uid}` : SAVE_KEY
}

function loadSaved(key = SAVE_KEY): Partial<SavedState> {
  try {
    return JSON.parse(localStorage.getItem(key) ?? '{}')
  } catch {
    return {}
  }
}

function hasSaved(key: string) {
  try {
    return localStorage.getItem(key) !== null
  } catch {
    return false
  }
}

/** Where a session resumes: its results if it got that far, otherwise the start of the intake. */
function resumeScreen(state: Partial<SavedState>): Screen {
  return state.revealed && state.universityId ? 'results' : 'school'
}

function useStudyMax() {
  // --- intake: university → program → courses (the number is asked for later, with the call) ---
  const saved = useRef(loadSaved()).current
  const [universityId, setUniversityId] = useState<UniversityChoice>(saved.universityId ?? '')
  const [programId, setProgramId] = useState(saved.programId ?? '')
  const [revealed, setRevealed] = useState(saved.revealed ?? false)

  const selectedSchool = universityId === 'usask' ? usask : null
  const availablePrograms = useMemo(() => selectedSchool?.programs ?? [], [selectedSchool])

  // Every Arts & Science subject is pickable, not just the handful with requirement data. One
  // without data still reaches the scholarship side of the app, which is most of its value.
  const subjectProgram: Program | null = useMemo(() => {
    if (!programId.startsWith(SUBJECT_PROGRAM_PREFIX)) return null
    const code = programId.slice(SUBJECT_PROGRAM_PREFIX.length)
    const subject = artsAndScienceSubjects.find((s) => s.code === code)
    return subject ? { id: programId, name: subject.name, specializations: [], courseTitles: {} } : null
  }, [programId])

  const selectedProgram: Program | null =
    universityId === 'usask'
      ? (availablePrograms.find((p) => p.id === programId) ?? subjectProgram)
      : universityId === 'other'
        ? OTHER_PROGRAM
        : null

  const programOptions = useMemo<ProgramOption[]>(() => {
    const fromSchool = availablePrograms
      .filter((p) => p.kind !== 'certificate' && p.kind !== 'minor')
      .map((p) => ({ id: p.id, name: p.name, hasData: p.specializations.length > 0 }))
    const named = new Set(availablePrograms.map((p) => p.name.toLowerCase()))
    const fromSubjects = artsAndScienceSubjects
      .filter((subject) => !named.has(subject.name.toLowerCase()))
      .map((subject) => ({
        id: `${SUBJECT_PROGRAM_PREFIX}${subject.code}`,
        name: subject.name,
        subjectCode: subject.code,
        hasData: false,
      }))
    return [...fromSchool, ...fromSubjects]
  }, [availablePrograms])

  const [programPickQuery, setProgramPickQuery] = useState('')

  // Name match first, then subject code ("PSY"), so both ways of thinking about a program work.
  // Programs StudyMax can actually plan sort above the rest of the college.
  const programResults = useMemo(() => {
    const query = programPickQuery.trim().toLowerCase()
    return programOptions
      .map((option) => {
        const name = option.name.toLowerCase()
        const score =
          query.length === 0
            ? 1
            : name.startsWith(query) || option.subjectCode?.toLowerCase().startsWith(query)
              ? 3
              : name.includes(query)
                ? 2
                : 0
        return { option, score }
      })
      .filter((hit) => hit.score > 0)
      .sort(
        (a, b) =>
          b.score - a.score ||
          Number(b.option.hasData) - Number(a.option.hasData) ||
          a.option.name.localeCompare(b.option.name),
      )
      .slice(0, 40)
      .map((hit) => hit.option)
  }, [programOptions, programPickQuery])

  function courseLabel(code: string) {
    // Prerequisites can pull in courses from outside the program's own title map, so fall back to
    // the scraped catalogue so they don't render as a bare code.
    const title = courseTitle(code)
    const display = courseCode(code)
    return title ? `${display}, ${title}` : display
  }

  function courseTitle(code: string) {
    return selectedProgram?.courseTitles[code] ?? courseInfo[code]?.title ?? catalogueTitle(code)
  }

  const [completed, setCompleted] = useState<Set<string>>(() => new Set(saved.completed ?? []))
  const completedRef = useRef(completed)
  completedRef.current = completed

  // --- account (native only): Apple or Google through Firebase, or none at all ---
  const [account, setAccount] = useState<Account | null>(null)
  const [authBusy, setAuthBusy] = useState<Provider | null>(null)
  const [authError, setAuthError] = useState<string | null>(null)
  const saveKey = saveKeyFor(account?.uid ?? null)

  useEffect(() => {
    const state: SavedState = { universityId, programId, completed: [...completed], revealed }
    try {
      localStorage.setItem(saveKey, JSON.stringify(state))
    } catch {
      // storage full or blocked (private mode): the app works fine without persistence
    }
  }, [saveKey, universityId, programId, completed, revealed])

  const matches = useMemo(
    () => computeMatches(selectedProgram?.specializations ?? [], completed),
    [selectedProgram, completed],
  )

  const [heroId, setHeroId] = useState<string | null>(null)
  useEffect(() => {
    if (heroId === null && matches.length > 0) setHeroId(matches[0].spec.id)
  }, [heroId, matches])

  // Certificates and minors the student is partway through without having declared them. Ranked
  // and planned by the same engine as the specializations: they are just requirement lists.
  const credentials = useMemo(
    () => computeCredentials(selectedSchool?.programs ?? [], completed, selectedProgram?.id),
    [selectedSchool, completed, selectedProgram],
  )

  // Everything a planned course could advance: the program's specializations plus the credentials.
  const planningSpecs = useMemo(
    () => [...(selectedProgram?.specializations ?? []), ...credentials.map((c) => c.spec)],
    [selectedProgram, credentials],
  )

  const hero =
    matches.find((m) => m.spec.id === heroId) ??
    credentials.find((c) => c.spec.id === heroId) ??
    matches[0] ??
    EMPTY_MATCH
  const rest = matches.filter((m) => m.spec.id !== hero.spec.id)

  function kindOf(specId: string): TargetKind {
    // computeCredentials only ever returns certificates and minors.
    const kind = credentials.find((c) => c.spec.id === specId)?.program.kind
    return kind === 'certificate' || kind === 'minor' ? kind : 'specialization'
  }
  const heroKind = kindOf(hero.spec.id)

  // When the student finishes their target (by adding its last course), hold the "done" state, then
  // promote the next-closest specialization, recomputed fresh in case they kept editing meanwhile.
  const prevRemaining = useRef<number | null>(null)
  useEffect(() => {
    if (prevRemaining.current !== null && prevRemaining.current > 0 && hero.remaining === 0) {
      const doneHeroId = hero.spec.id
      const promoteId = setTimeout(() => {
        const freshMatches = computeMatches(selectedProgram?.specializations ?? [], completedRef.current)
        const next = freshMatches
          .filter((m) => m.spec.id !== doneHeroId && m.remaining > 0)
          .sort((a, b) => a.remaining - b.remaining || a.spec.name.localeCompare(b.spec.name))[0]
        if (next) setHeroId(next.spec.id)
      }, 1800)
      return () => clearTimeout(promoteId)
    }
    prevRemaining.current = hero.remaining
  }, [hero.spec.id, hero.remaining, selectedProgram])

  const topOverlap = useMemo(() => {
    const overlap = computeCourseOverlap(selectedProgram?.specializations ?? [], completed)
    return overlap[0] && overlap[0].specs.length >= 2 ? overlap[0] : null
  }, [selectedProgram, completed])

  // Everything the student has, including courses added by search that this program never asks for:
  // those still count toward certificates, minors and other specializations.
  const takenCourses = useMemo(() => [...completed].sort(), [completed])

  const [courseQuery, setCourseQuery] = useState('')
  const courseResults = useMemo(() => searchCourses(courseQuery), [courseQuery])

  // Adding deliberately leaves the query and the list alone: one search usually turns up several
  // courses a student took ("phil 24" is both symbolic logic courses), and clearing after each add
  // would make them retype it.
  function addCourse(code: string) {
    setCompleted((prev) => new Set(prev).add(code))
    haptic.selection()
  }

  function toggleCourse(code: string) {
    setCompleted((prev) => {
      const next = new Set(prev)
      if (next.has(code)) next.delete(code)
      else next.add(code)
      return next
    })
    haptic.selection()
  }

  function handleUniversityChange(id: UniversityChoice) {
    if (id === universityId) return
    setUniversityId(id)
    setProgramId('')
    setCompleted(new Set())
    setUploadInProgress([])
    setHeroId(null)
    setExtraTargetIds([])
    setUploadStatus('idle')
    haptic.selection()
  }

  function handleProgramChange(id: string) {
    setSheet(null)
    haptic.selection()
    if (id === programId) return
    setProgramId(id)
    setCompleted(new Set())
    setUploadInProgress([])
    setHeroId(null)
    setExtraTargetIds([])
    setUploadStatus('idle')
  }

  function loadSampleStudent() {
    setUniversityId('usask')
    setProgramId(computerScience.id)
    setCompleted(new Set(computerScience.sampleTranscript ?? []))
    setUploadInProgress(computerScience.sampleInProgress ?? [])
    setHeroId(null)
    setExtraTargetIds([])
    // The sample is a real audit reduced to course codes, so it lands in the same state a finished
    // upload does: completed courses counted, in-progress ones named, the list ready to review.
    setUploadStatus('sample')
    setUploadError(null)
    haptic.light()
    if (screen !== 'courses') go('courses')
  }

  const [uploadStatus, setUploadStatus] = useState<'idle' | 'uploading' | 'success' | 'sample' | 'error'>('idle')
  const [uploadError, setUploadError] = useState<string | null>(null)
  const [uploadInProgress, setUploadInProgress] = useState<string[]>([])
  // What the reading screen says, and only ever what is actually happening.
  const [readPhase, setReadPhase] = useState<'preparing' | 'reading' | 'found'>('preparing')
  // Bumped to abandon an upload in flight (Back on the reading screen): its answer is then ignored.
  const uploadToken = useRef(0)

  async function handleTranscriptFile(file: File) {
    if (!selectedProgram) return
    // Vercel caps a function's request body at 4.5 MB, and base64 inflates a file by a third, so a
    // file that can't make it is refused here, before the reading screen ever opens.
    if (file.size > MAX_TRANSCRIPT_BYTES) {
      setUploadStatus('error')
      setUploadError(
        `That PDF is ${(file.size / 1e6).toFixed(1)} MB, and the reader accepts up to ` +
          `${(MAX_TRANSCRIPT_BYTES / 1e6).toFixed(1)} MB. Export a smaller copy, or add your courses by search.`,
      )
      return
    }

    const token = ++uploadToken.current
    const live = () => uploadToken.current === token
    setUploadStatus('uploading')
    setUploadError(null)
    setReadPhase('preparing')
    go('reading')
    try {
      const pdfBase64 = await fileToBase64(file)
      if (!live()) return
      setReadPhase('reading')
      const res = await fetch(api('/api/parse-transcript'), {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ pdfBase64 }),
      })
      if (!live()) return

      if (res.status === 404) {
        throw new UploadError(
          "Transcript reading runs on StudyMax's server, which this local preview doesn't include. " +
            'Add your courses by search for now.',
        )
      }
      if (!res.ok) {
        const detail = await res.json().catch(() => null)
        throw new UploadError(
          detail?.status === 401 || detail?.status === 403
            ? "The transcript reader is having trouble on our side, not yours. Add your courses by search for now."
            : "The transcript reader couldn't finish that one. Try again, or add your courses by search.",
        )
      }

      const data = await res.json()
      if (!live()) return
      const codes: string[] = data.completed ?? []
      const inProgressCodes: string[] = data.inProgress ?? []
      if (codes.length === 0) {
        throw new UploadError(
          data.sawText === false
            ? 'That PDF has no readable text. A scan or photo needs to be exported as text, or added by search.'
            : "We read the file but couldn't find any completed courses in it. If it was the right transcript, add them by search.",
        )
      }

      setCompleted(new Set(codes))
      setUploadInProgress(inProgressCodes)
      setHeroId(null)
      setExtraTargetIds([])
      setReadPhase('found')
      setUploadStatus('success')
      haptic.light()
      await wait(1200)
      if (live()) go('courses', -1)
    } catch (err) {
      if (!live()) return
      setUploadStatus('error')
      // Only our own sentences reach the student, never a raw error.
      setUploadError(
        err instanceof UploadError
          ? err.message
          : "Couldn't reach the transcript reader. Check your connection, or add your courses by search.",
      )
      go('courses', -1)
    }
  }

  function cancelUpload() {
    uploadToken.current++
    setUploadStatus('idle')
  }

  const today = useMemo(() => new Date(), [])

  // --- term-by-term path to the closest specialization ---
  const [coursesPerTerm, setCoursesPerTerm] = useState(2)
  // Extra targets the student added to the same plan. Only ids from what they're already close to;
  // an id that stops resolving (they switched program) simply drops out.
  const [extraTargetIds, setExtraTargetIds] = useState<string[]>([])
  const addableTargets = useMemo(
    () =>
      [...matches, ...credentials].filter(
        (m) => m.remaining > 0 && m.spec.id !== hero.spec.id && !extraTargetIds.includes(m.spec.id),
      ),
    [matches, credentials, hero, extraTargetIds],
  )
  const targets = useMemo(() => {
    const byId = new Map([...matches, ...credentials].map((m) => [m.spec.id, m]))
    return [hero, ...extraTargetIds.map((id) => byId.get(id)).filter((m) => m !== undefined)].filter(
      (m) => m.remaining > 0,
    )
  }, [hero, matches, credentials, extraTargetIds])
  const plan = useMemo(
    () =>
      targets.length > 0 ? buildPlan(targets, planningSpecs, completed, coursesPerTerm, upcomingTerm(today)) : [],
    [targets, planningSpecs, completed, coursesPerTerm, today],
  )
  const [planCopied, setPlanCopied] = useState(false)
  // Clipboard writes are blocked in some browsers and contexts. Rather than a button that appears to
  // do nothing, the plan text is shown for the student to select by hand.
  const [planText, setPlanText] = useState<string | null>(null)

  const hiddenPrereqs = useMemo(
    () => plan.flatMap((t) => t.courses).filter((c) => c.reason === 'prerequisite'),
    [plan],
  )

  async function copyPlan() {
    const required = plan.flatMap((t) => t.courses).filter((c) => c.reason === 'requirement').length
    const lines = [
      `StudyMax plan: ${targets.map((t) => t.spec.name).join(' + ')} (${selectedProgram?.name ?? ''})`,
      `${required} required course${required === 1 ? '' : 's'} outstanding` +
        (hiddenPrereqs.length > 0
          ? `, plus ${hiddenPrereqs.length} prerequisite${hiddenPrereqs.length === 1 ? '' : 's'} not listed on the specialization page`
          : '') +
        `. ${coursesPerTerm} per term.`,
      '',
      ...plan.flatMap((term) => [
        `${term.label}:`,
        ...term.courses.map((c) => {
          const notes = [
            c.reason === 'prerequisite' ? `prerequisite for ${courseCode(c.neededBy ?? '')}` : null,
            c.alsoAdvances.length > 0 ? `also counts toward: ${c.alsoAdvances.join(', ')}` : null,
          ].filter(Boolean)
          return `  - ${courseLabel(c.code)}${notes.length > 0 ? ` (${notes.join('; ')})` : ''}`
        }),
      ]),
      '',
      'Prerequisites and sequencing from catalogue.usask.ca. Confirm course offerings by term with an advisor.',
    ]
    const text = lines.join('\n')
    try {
      await navigator.clipboard.writeText(text)
    } catch {
      setPlanText(text)
      return
    }
    setPlanText(null)
    setPlanCopied(true)
    haptic.light()
    setTimeout(() => setPlanCopied(false), 2000)
  }

  const otherCloseSpecializations = useMemo(
    () =>
      rest
        .filter((m) => m.remaining > 0 && m.remaining <= 2)
        .slice(0, 3)
        .map((m) => ({ name: m.spec.name, remaining: m.remaining })),
    [rest],
  )

  const [schoolQuery, setSchoolQuery] = useState('')
  const [programQuery, setProgramQuery] = useState('')
  const [lookup, setLookup] = useState<Lookup | null>(null)
  const lookupToken = useRef(0)

  async function findResources(schoolName: string, programName: string) {
    const matched = findSchool(schoolName)

    if (matched) {
      const token = ++lookupToken.current
      const hasResources = matched.resources.length > 0
      setLookup({ kind: 'verified', school: matched, whyYou: {}, loadingWhy: hasResources })
      if (!hasResources) return
      const context = {
        school: matched.name,
        program: selectedProgram?.name ?? 'their program',
        closestSpecialization: hero.spec.name,
        coursesRemaining: hero.remaining,
        topOverlapCourse: topOverlap?.course,
        otherCloseSpecializations,
      }
      // The route asks Claude for every line in one reply under a fixed token budget, and twenty
      // awards overflow it (the reply is cut off and parses to nothing). Small batches, sent
      // together in deadline order, each fit, and each award's line arrives as its batch lands.
      const ranked = rankByUrgency(matched.resources, today)
      const batches: (typeof ranked)[] = []
      for (let i = 0; i < ranked.length; i += WHY_BATCH) batches.push(ranked.slice(i, i + WHY_BATCH))
      await Promise.all(
        batches.map(async (batch) => {
          try {
            const res = await fetch(api('/api/why-you'), {
              method: 'POST',
              headers: { 'content-type': 'application/json' },
              body: JSON.stringify({
                context,
                resources: batch.map((r) => ({ id: r.id, name: r.name, whatItIs: r.whatItIs })),
              }),
            })
            const data = res.ok ? await res.json() : { whyYou: {} }
            if (lookupToken.current !== token) return
            setLookup((prev) =>
              prev?.kind === 'verified' ? { ...prev, whyYou: { ...prev.whyYou, ...(data.whyYou ?? {}) } } : prev,
            )
          } catch {
            // this batch's awards fall back to their own description
          }
        }),
      )
      if (lookupToken.current === token) {
        setLookup((prev) => (prev?.kind === 'verified' ? { ...prev, loadingWhy: false } : prev))
      }
      return
    }

    setLookup({ kind: 'guidance', schoolName, program: programName, loading: true, result: null, error: null })
    try {
      const res = await fetch(api('/api/scholarship-guidance'), {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ school: schoolName, program: programName }),
      })
      if (!res.ok) throw new Error('guidance request failed')
      const result: GuidanceResult = await res.json()
      setLookup({ kind: 'guidance', schoolName, program: programName, loading: false, result, error: null })
      haptic.light()
    } catch {
      setLookup({
        kind: 'guidance',
        schoolName,
        program: programName,
        loading: false,
        result: null,
        error: "Couldn't reach the guidance service. Try again in a moment.",
      })
    }
  }

  // --- one-way scripted phone reminder about the award closing soonest ---
  const rankedAwards = useMemo(() => rankByUrgency(usask.resources, today), [today])
  const topAward = rankedAwards[0]
  const topAwardDeadlineText = useMemo(() => {
    if (!topAward) return undefined
    const days = daysUntil(topAward, today)
    return days !== null ? formatCountdown(days) : topAward.deadline
  }, [topAward, today])
  // The call reads the deadline aloud mid-sentence, so it only gets a real countdown: a raw date
  // string ("May 20, 2026") or a "not listed" note would be spoken as nonsense.
  const spokenDeadline = useMemo(
    () => (topAward && daysUntil(topAward, today) !== null ? topAwardDeadlineText : undefined),
    [topAward, today, topAwardDeadlineText],
  )
  const callContext: CallContext = useMemo(
    () => ({
      specializationName: hero.spec.name,
      coursesRemaining: hero.remaining,
      awardName: topAward?.name,
      awardDeadlineText: spokenDeadline,
    }),
    [hero, topAward, spokenDeadline],
  )
  const callFallbackScript = useMemo(() => buildCallScript(callContext), [callContext])

  const [phone, setPhone] = useState('')
  const [callStatus, setCallStatus] = useState<'idle' | 'calling' | 'success' | 'error'>('idle')

  async function callMe() {
    setCallStatus('calling')
    haptic.medium()
    try {
      // The calling state stays up long enough to be read, however fast the provider answers.
      const [res] = await Promise.all([
        fetch(api('/api/call-me'), {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ phoneNumber: phone, context: callContext }),
        }),
        wait(1600),
      ])
      if (!res.ok) throw new Error('call failed')
      setCallStatus('success')
      haptic.light()
    } catch {
      setCallStatus('error')
    }
  }

  const hasProgramData = (selectedProgram?.specializations.length ?? 0) > 0
  // Only a mapped program has a course step; everyone else goes straight to what we can find them.
  const hasCourseStep = universityId === 'usask' && hasProgramData

  /** Swaps in a whole saved session: the student's own on sign-in, the anonymous one on sign-out. */
  function applySaved(state: Partial<SavedState>) {
    setUniversityId(state.universityId ?? '')
    setProgramId(state.programId ?? '')
    setCompleted(new Set(state.completed ?? []))
    setRevealed(state.revealed ?? false)
    setUploadInProgress([])
    setUploadStatus('idle')
    setHeroId(null)
    setExtraTargetIds([])
    setLookup(null)
    setCallStatus('idle')
  }

  // A student who signed in last time goes straight back to their own session; the welcome screen
  // only greets people who aren't signed in. This resolves under the intro, so it's never seen.
  const applySavedRef = useRef(applySaved)
  applySavedRef.current = applySaved
  useEffect(() => {
    if (!authAvailable) return
    let live = true
    void currentAccount().then((existing) => {
      if (!live || !existing) return
      const state = loadSaved(saveKeyFor(existing.uid))
      applySavedRef.current(state)
      setAccount(existing)
      setDirection(1)
      setScreen(resumeScreen(state))
    })
    return () => {
      live = false
    }
    // Runs once, at launch.
  }, [])

  async function signInWith(provider: Provider) {
    setAuthBusy(provider)
    setAuthError(null)
    try {
      const signedIn = await signIn(provider)
      // Their own saved session if they have one on this phone; otherwise what they've done so far
      // carries over into their account.
      const key = saveKeyFor(signedIn.uid)
      const state = hasSaved(key) ? loadSaved(key) : { universityId, programId, completed: [...completed], revealed }
      if (hasSaved(key)) applySaved(state)
      setAccount(signedIn)
      haptic.light()
      go(resumeScreen(state))
    } catch (err) {
      // Closing the sheet is a choice, not a failure: nothing is shown.
      if (!isCancel(err)) {
        setAuthError(
          provider === 'google'
            ? "Google sign-in didn't work this time. Check your connection and try again, or continue without an account."
            : /error 1000\b/.test(String((err as Error)?.message))
              ? // Apple's catch-all, most often: no Apple Account is signed in on this device.
                "Sign in with Apple isn't available right now. Check you're signed in to your Apple Account in Settings, or continue another way."
              : "Sign in with Apple didn't work this time. Try again, or continue without an account.",
        )
      }
    } finally {
      setAuthBusy(null)
    }
  }

  function continueWithoutAccount() {
    haptic.selection()
    setAuthError(null)
    go(resumeScreen({ universityId, revealed }))
  }

  async function signOutOfAccount() {
    haptic.selection()
    setSheet(null)
    try {
      await signOut()
    } catch {
      // the local session ends regardless
    }
    setAccount(null)
    applySaved(loadSaved(SAVE_KEY))
    go('welcome', -1)
  }

  // --- navigation: one screen at a time, a direction for the transition, and at most one sheet ---
  const [screen, setScreen] = useState<Screen>(() =>
    // Native launches start at the welcome screen; the web build has no sign-in and starts as before.
    authAvailable ? 'welcome' : saved.revealed && saved.universityId ? 'results' : 'school',
  )
  const [direction, setDirection] = useState<1 | -1>(1)
  const [tab, setTabState] = useState<Tab>(() => (hasProgramData ? 'overview' : 'awards'))
  const [sheet, setSheet] = useState<string | null>(null)

  function go(next: Screen, dir: 1 | -1 = 1) {
    setDirection(dir)
    setSheet(null)
    setScreen(next)
  }

  function setTab(next: Tab) {
    if (next === tab) return
    haptic.selection()
    setTabState(next)
  }

  function openSheet(id: string) {
    haptic.selection()
    setSheet(id)
  }

  function continueFromSchool() {
    if (!selectedProgram) return
    if (hasCourseStep) go('courses')
    else startReveal()
  }

  function startReveal() {
    setLookup(null)
    setCallStatus('idle')
    setTabState(hasProgramData ? 'overview' : 'awards')
    go('reveal')
  }

  function finishReveal() {
    setRevealed(true)
    haptic.medium()
    go('results')
  }

  function startOver() {
    setRevealed(false)
    setUniversityId('')
    setProgramId('')
    setCompleted(new Set())
    setUploadInProgress([])
    setUploadStatus('idle')
    setHeroId(null)
    setExtraTargetIds([])
    setLookup(null)
    setCallStatus('idle')
    haptic.selection()
    go('school', -1)
  }

  function planTarget(specId: string) {
    setHeroId(specId)
    setExtraTargetIds((ids) => ids.filter((id) => id !== specId))
    setSheet(null)
    haptic.selection()
    setTabState('plan')
  }

  /** One step back through the flow. Returns false on the first screen, where Back exits. */
  function back(): boolean {
    if (sheet) {
      setSheet(null)
      return true
    }
    switch (screen) {
      case 'welcome':
        return false
      case 'school':
        if (authAvailable && !account) {
          go('welcome', -1)
          return true
        }
        return false
      case 'courses':
        go('school', -1)
        return true
      case 'reading':
        cancelUpload()
        go('courses', -1)
        return true
      case 'reveal':
        return true // it's over in a second; there's nothing to go back to mid-reveal
      case 'results':
        if (hasProgramData && tab !== 'overview') {
          setTabState('overview')
          return true
        }
        go(hasCourseStep ? 'courses' : 'school', -1)
        return true
      case 'call':
        if (callStatus === 'calling') return true
        go('results', -1)
        return true
    }
  }

  // The awards list is looked up for mapped schools as soon as results open, so it's ready (and
  // Claude's "why you" notes are on their way) by the time the student gets to that tab.
  // It goes through a ref because findResources is a new function every render.
  const loadAwards = useRef(() => {})
  loadAwards.current = () => void findResources('University of Saskatchewan', selectedProgram?.name ?? '')
  useEffect(() => {
    if (screen === 'results' && lookup === null && universityId === 'usask') loadAwards.current()
  }, [screen, lookup, universityId])

  return {
    // account
    account,
    authBusy,
    authError,
    signInWith,
    continueWithoutAccount,
    signOutOfAccount,
    // intake
    universityId,
    handleUniversityChange,
    programId,
    selectedProgram,
    hasProgramData,
    hasCourseStep,
    programPickQuery,
    setProgramPickQuery,
    programResults,
    handleProgramChange,
    loadSampleStudent,
    // courses
    completed,
    takenCourses,
    courseQuery,
    setCourseQuery,
    courseResults,
    addCourse,
    toggleCourse,
    courseLabel,
    courseTitle,
    uploadStatus,
    uploadError,
    uploadInProgress,
    readPhase,
    handleTranscriptFile,
    // results
    matches,
    credentials,
    hero,
    heroKind,
    kindOf,
    rest,
    topOverlap,
    planTarget,
    targets,
    addableTargets,
    extraTargetIds,
    setExtraTargetIds,
    plan,
    coursesPerTerm,
    setCoursesPerTerm,
    hiddenPrereqs,
    copyPlan,
    planCopied,
    planText,
    today,
    lookup,
    schoolQuery,
    setSchoolQuery,
    programQuery,
    setProgramQuery,
    findResources,
    rankedAwards,
    // the call
    topAward,
    topAwardDeadlineText,
    callFallbackScript,
    phone,
    setPhone,
    callStatus,
    setCallStatus,
    callMe,
    // navigation
    screen,
    direction,
    go,
    back,
    tab,
    setTab,
    sheet,
    setSheet,
    openSheet,
    continueFromSchool,
    startReveal,
    finishReveal,
    startOver,
  }
}

export type Model = ReturnType<typeof useStudyMax>

const SCREENS: Record<Screen, ComponentType> = {
  welcome: WelcomeScreen,
  school: SchoolScreen,
  courses: CoursesScreen,
  reading: ReadingScreen,
  reveal: RevealScreen,
  results: ResultsScreen,
  call: CallScreen,
}

// A screen change runs on ONE timeline: the outgoing screen is gone before the incoming one is
// substantially visible, so two screens are never on top of each other. AnimatePresence's "wait"
// mode makes the halves strictly sequential: 380ms in all, out on ease-in over the first 40%, in on
// the settle over the rest. The direction follows the direction of travel.
const screenVariants = {
  enter: (dir: number) => ({ opacity: 0, x: dir * 20 }),
  shown: { opacity: 1, x: 0, transition: { duration: DUR.slow * 0.6, ease: SETTLE } },
  leave: (dir: number) => ({ opacity: 0, x: dir * -20, transition: { duration: DUR.slow * 0.4, ease: 'easeIn' as const } }),
}
const instantVariants = {
  enter: { opacity: 1, x: 0 },
  shown: { opacity: 1, x: 0, transition: INSTANT },
  leave: { opacity: 0, transition: INSTANT },
}

function App() {
  const model = useStudyMax()
  const reduce = useReducedMotion()
  const backRef = useRef(model.back)
  backRef.current = model.back
  useEffect(() => onBackButton(() => backRef.current()), [])

  const Current = SCREENS[model.screen]
  return (
    <ModelContext.Provider value={model}>
      <div className="app">
        <AnimatePresence mode="wait" initial={false} custom={model.direction}>
          <motion.div
            key={model.screen}
            className="screen"
            custom={model.direction}
            variants={reduce ? instantVariants : screenVariants}
            initial="enter"
            animate="shown"
            exit="leave"
          >
            <Current />
          </motion.div>
        </AnimatePresence>
      </div>
      {model.account && <AccountSheet />}
      <Intro />
    </ModelContext.Provider>
  )
}

export default App

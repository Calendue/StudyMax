// Whether a course may go in the term a student dragged it to on the Skill Tree, and if not, why —
// in words the tree shows as the card snaps back. The same rules the planner keeps (src/lib/plan.ts):
// a term that's already begun is out, the course has to run that season, its prerequisites have to
// be done in an earlier term (a corequisite may share it), and the term can't be over the load with
// courses the student fixed there. Pure: the app hands in the plan it would get with the move made.
import { defaultCatalog } from './catalog.ts'
import { courseRunsIn, isElective, prerequisitesMet, termFromLabel, termOrder, type PlannedTerm, type TermStart } from './plan.ts'

export interface PlacementInput {
  code: string
  /** Where it was dropped: "Winter 2028". */
  label: string
  /** The plan with the course pinned there (buildStudentPlanResult with the move). */
  terms: PlannedTerm[]
  completed: ReadonlySet<string>
  /** Under way now: passed by the time the plan starts. */
  inProgress: readonly string[]
  /** Courses already booked into a term (this term's registrations), by label. */
  booked: Record<string, string[]>
  /** The first term the plan may use. */
  start: TermStart
  springSummer: boolean
  perTerm: number
  perSummer: number
}

const spoken = (code: string) => code.replace(/^([A-Z]+)(\d)/, '$1 $2')

/** Null when the move keeps every rule; otherwise one short sentence saying why not. */
export function placementProblem(p: PlacementInput): string | null {
  const term = termFromLabel(p.label)
  if (!term) return "That's not a term I can plan in."
  if (termOrder(term) < termOrder(p.start)) return `Your plan starts in ${p.start.season} ${p.start.year}, so it can't go earlier.`
  if (term.season === 'Spring/Summer' && !p.springSummer) return 'Turn on Spring/Summer terms in your plan settings first.'
  if (!courseRunsIn(p.code, term.season, p.springSummer)) return `${spoken(p.code)} isn't offered in ${term.season}.`

  const catalog = defaultCatalog()
  const passed = new Set([...p.completed, ...p.inProgress])
  for (const t of p.terms) {
    const here = t.courses.map((c) => c.code).filter((c) => !isElective(c))
    const alongside = new Set(here)
    // Every course the student fixed in place has to still work, not only the one just moved: moving a
    // prerequisite later can strand a course they pinned after it.
    for (const c of t.courses) {
      if (!c.pinned || prerequisitesMet(c.code, passed, alongside)) continue
      const missing = catalog[c.code]?.requires.find((g) => !g.some((o) => passed.has(o)))?.[0]
      // A prerequisite that's still to take can be moved first: say so, since the planner won't pull it
      // earlier on its own once this course is placed by hand.
      if (c.code === p.code) {
        if (!missing) return `${spoken(p.code)} needs its prerequisites done first.`
        return p.completed.has(missing) || p.inProgress.includes(missing)
          ? `${spoken(p.code)} needs ${spoken(missing)} done first.`
          : `${spoken(p.code)} needs ${spoken(missing)} first. Move ${spoken(missing)} to an earlier term, then try again.`
      }
      return `${spoken(c.code)} (placed in ${t.label}) needs ${missing ? spoken(missing) : spoken(p.code)} done before it.`
    }
    if (t.label === p.label) {
      const fixed = t.courses.filter((c) => c.pinned).length + (p.booked[t.label]?.length ?? 0)
      const cap = term.season === 'Spring/Summer' ? p.perSummer : p.perTerm
      if (fixed > cap) return `${p.label} is already full with courses you placed (${cap} a term).`
    }
    for (const c of here) passed.add(c)
  }
  return null
}

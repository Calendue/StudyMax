import { useModel } from '../model.ts'
import { MAX_COURSES_PER_TERM, MAX_SUMMER_COURSES } from '../lib/cloudSession.ts'
import { Appear } from '../ui/primitives.tsx'

/** Spring/Summer: off, or the most courses a Spring/Summer term may take. */
const SUMMER_CHOICES = [0, ...Array.from({ length: MAX_SUMMER_COURSES }, (_, i) => i + 1)]

/** What a degree variant is called in the plan's settings. */
const VARIANT_LABEL: Record<string, string> = { 'bsc-4': 'Four-year', 'bsc-honours': 'Honours', 'bsc-3': 'Three-year' }

/** The degree (where the program has variants), courses per term (Fall/Winter and Spring/Summer), and the term it starts in. */
export function PlanControls() {
  const m = useModel()
  const summer = m.springSummer ? m.summerPerTerm : 0
  const variants = m.selectedProgram?.degrees ?? []
  return (
    <>
      {variants.length > 1 && (
        <Appear index={1} className="per-term per-term--wrap">
          <span id="degree-variant-label">Degree</span>
          <div className="segmented segmented--labels" role="radiogroup" aria-labelledby="degree-variant-label">
            {variants.map((d) => (
              <button
                key={d.variant}
                type="button"
                role="radio"
                aria-checked={m.activeDegree?.variant === d.variant}
                aria-label={d.name}
                className={`segmented__option${m.activeDegree?.variant === d.variant ? ' segmented__option--on' : ''}`}
                onClick={() => m.setDegreeVariant(d.variant)}
              >
                {VARIANT_LABEL[d.variant] ?? d.name}
              </button>
            ))}
          </div>
        </Appear>
      )}
      <Appear index={1} className="per-term">
        <span id="per-term-label">Courses per term</span>
        <div className="segmented" role="radiogroup" aria-labelledby="per-term-label">
          {Array.from({ length: MAX_COURSES_PER_TERM }, (_, i) => i + 1).map((n) => (
            <button
              key={n}
              type="button"
              role="radio"
              aria-checked={m.coursesPerTerm === n}
              className={`segmented__option${m.coursesPerTerm === n ? ' segmented__option--on' : ''}`}
              onClick={() => m.setCoursesPerTerm(n)}
            >
              {n}
            </button>
          ))}
        </div>
      </Appear>

      <Appear index={1} className="per-term">
        <span id="summer-label">Spring/Summer</span>
        <div className="segmented" role="radiogroup" aria-labelledby="summer-label">
          {SUMMER_CHOICES.map((n) => (
            <button
              key={n}
              type="button"
              role="radio"
              aria-checked={summer === n}
              aria-label={n === 0 ? 'No Spring/Summer terms' : `Up to ${n} in a Spring/Summer term`}
              className={`segmented__option${summer === n ? ' segmented__option--on' : ''}`}
              onClick={() => {
                m.setSpringSummer(n > 0)
                if (n > 0) m.setSummerPerTerm(n)
              }}
            >
              {n === 0 ? 'Off' : n}
            </button>
          ))}
        </div>
      </Appear>

      <Appear index={1} className="per-term">
        <span id="internship-label">Internship year</span>
        <div className="segmented" role="radiogroup" aria-labelledby="internship-label">
          {([null, 3, 4] as const).map((year) => (
            <button
              key={year ?? 'off'}
              type="button"
              role="radio"
              aria-checked={m.internshipYear === year}
              aria-label={year === null ? 'No internship year' : `Internship in year ${year}`}
              className={`segmented__option${m.internshipYear === year ? ' segmented__option--on' : ''}`}
              onClick={() => m.chooseInternship(year ?? 'no')}
            >
              {year ?? 'Off'}
            </button>
          ))}
        </div>
      </Appear>

      <Appear index={1} className="per-term">
        <label htmlFor="start-term">Starting</label>
        {/* ponytail: native select, not a segmented control; six term labels don't fit one row on a phone */}
        <select
          id="start-term"
          value={`${m.startTerm.season} ${m.startTerm.year}`}
          onChange={(e) => {
            const t = m.startChoices.find((c) => `${c.season} ${c.year}` === e.target.value)
            if (t) m.setStartTerm(t)
          }}
        >
          {m.startChoices.map((t) => (
            <option key={`${t.season} ${t.year}`}>{`${t.season} ${t.year}`}</option>
          ))}
        </select>
      </Appear>
    </>
  )
}


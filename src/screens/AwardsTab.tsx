import { useModel } from '../model.ts'
import { isNative } from '../platform.ts'
import { daysUntil, formatCountdown } from '../lib/resources.ts'
import type { Resource } from '../data/schools/types.ts'
import { ScreenTitle } from '../ui/chrome.tsx'
import { Icon } from '../ui/Icon.tsx'
import { Appear, Button, Chip, Group, SectionLabel, Skeleton, StreamedText } from '../ui/primitives.tsx'

function formatDate(date: Date) {
  return date.toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })
}

/** "Closes in 5 days", filled when it's closing soon; the listed date or "rolling" otherwise. */
function Deadline({ award, today }: { award: Resource; today: Date }) {
  const days = daysUntil(award, today)
  return (
    <Chip tone={days !== null && days <= 14 ? 'urgent' : 'quiet'} icon="clock">
      {days !== null ? formatCountdown(days) : award.deadline}
    </Chip>
  )
}

export function AwardsTab() {
  const m = useModel()
  if (m.universityId !== 'usask') return <Guidance />

  const lookup = m.lookup?.kind === 'verified' ? m.lookup : null
  const awards = m.rankedAwards
  const top = m.hasProgramData ? m.topAward : undefined
  const listed = top ? awards.slice(1) : awards

  return (
    <>
      <ScreenTitle lead={`The ones your school buries a few clicks deep, soonest first. Today is ${formatDate(m.today)}.`}>
        Awards, by deadline
      </ScreenTitle>

      {top && (
        <Appear index={0} className="spotlight">
          <Deadline award={top} today={m.today} />
          <h2 className="spotlight__name">{top.name}</h2>
          {top.value && <p className="spotlight__value">{top.value}</p>}
          <p className="spotlight__why">{top.whatItIs}</p>
          {m.features.call && (
            <Button block icon="phone" onClick={() => m.go('call')}>
              Get a call before it closes
            </Button>
          )}
          {/* The deadline watch: a Live Activity on iOS, a Live Update on Android. Apps only. */}
          {isNative && m.watchableDeadline?.id === top.id && (
            <Button
              block
              variant="secondary"
              icon="clock"
              disabled={m.watchBusy}
              onClick={() => void (m.watchedId === top.id ? m.unwatchDeadline() : m.watchDeadline())}
            >
              {m.watchedId === top.id ? 'Stop watching' : 'Watch this deadline'}
            </Button>
          )}
          {m.watchError && <p className="footnote">{m.watchError}</p>}
        </Appear>
      )}

      <SectionLabel>{top ? 'Everything else' : 'Awards'}</SectionLabel>
      <Group>
        {listed.map((award, i) => (
          <Appear key={award.id} index={1 + i} className="row-wrap">
            <div className="award">
              <div className="award__head">
                <Deadline award={award} today={m.today} />
                {award.value && <span className="award__value">{award.value}</span>}
              </div>
              <a className="award__name" href={award.url} target="_blank" rel="noreferrer">
                {award.name}
                <Icon name="external" size={16} />
                <span className="visually-hidden"> (opens the award page)</span>
              </a>
              <p className="award__what">{award.whatItIs}</p>
              <WhyYou
                loading={m.features.ai && (!lookup || (lookup.loadingWhy && !lookup.whyYou[award.id]))}
                text={lookup?.whyYou[award.id]}
                fallback={award.whyRelevant}
              />
            </div>
          </Appear>
        ))}
      </Group>
    </>
  )
}

/** The AI's note on why this award fits this student: a skeleton while it's written, then read in. */
function WhyYou({ loading, text, fallback }: { loading: boolean; text?: string; fallback: string }) {
  if (loading) {
    return (
      <div className="why why--loading">
        <span className="why__label">Why you</span>
        <Skeleton lines={2} />
      </div>
    )
  }
  if (!text) return <p className="award__what">{fallback}</p>
  return (
    <div className="why">
      <span className="why__label">Why you</span>
      <StreamedText text={text} className="why__text" />
    </div>
  )
}

function Guidance() {
  const m = useModel()
  const lookup = m.lookup?.kind === 'guidance' ? m.lookup : null
  // Direction for unmapped schools is AI-written. The university step hides this path without the
  // OpenAI key, but a session saved before that still lands here, so say so instead of a dead form.
  if (!m.features.ai) {
    return (
      <ScreenTitle lead="StudyMax has verified award lists for the schools it has mapped. Direction for other schools is switched off for now.">
        Scholarships
      </ScreenTitle>
    )
  }
  return (
    <>
      <ScreenTitle lead="StudyMax has verified award lists for the schools it has mapped. For anywhere else, StudyMax points you to the kinds of awards to look for, and where.">
        Scholarships
      </ScreenTitle>
      <form
        className="form"
        onSubmit={(e) => {
          e.preventDefault()
          if (m.schoolQuery.trim()) void m.findResources(m.schoolQuery.trim(), m.programQuery.trim())
        }}
      >
        <label className="field-label" htmlFor="guidance-school">
          Your school
        </label>
        <div className="field">
          <input
            id="guidance-school"
            value={m.schoolQuery}
            onChange={(e) => m.setSchoolQuery(e.target.value)}
            placeholder="e.g. University of Toronto"
            autoComplete="organization"
            enterKeyHint="next"
          />
        </div>
        <label className="field-label" htmlFor="guidance-program">
          Your program <span className="field-label__optional">optional</span>
        </label>
        <div className="field">
          <input
            id="guidance-program"
            value={m.programQuery}
            onChange={(e) => m.setProgramQuery(e.target.value)}
            placeholder="e.g. Nursing"
            enterKeyHint="go"
          />
        </div>
        <Button type="submit" block disabled={!m.schoolQuery.trim() || lookup?.loading}>
          Find where to look
        </Button>
      </form>

      {lookup?.loading && (
        <div className="guidance">
          <Skeleton lines={3} />
        </div>
      )}
      {lookup?.error && (
        <Appear className="notice">
          <p>{lookup.error}</p>
        </Appear>
      )}
      {lookup?.result && (
        <Appear className="guidance">
          <p className="footnote">
            {lookup.schoolName} isn&rsquo;t in our verified list yet, so this is AI-written direction, not specific named
            awards.
          </p>
          <SectionLabel>Kinds of awards to look for</SectionLabel>
          <div className="chips">
            {lookup.result.categories.map((c) => (
              <Chip key={c}>{c}</Chip>
            ))}
          </div>
          <SectionLabel>Where to look</SectionLabel>
          <Group>
            {lookup.result.whereToLook.map((w) => (
              <div key={w} className="row">
                <span className="row__body">
                  <StreamedText text={w} className="row__title row__title--prose" />
                </span>
              </div>
            ))}
          </Group>
        </Appear>
      )}
    </>
  )
}

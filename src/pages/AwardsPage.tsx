import { useMemo, useState } from 'react'
import { useModel } from '../model.ts'
import { daysUntil } from '../lib/resources.ts'
import { Icon } from '../ui/Icon.tsx'
import { AwardSpotlight, Deadline, Guidance, WhyYou } from '../screens/AwardsTab.tsx'
import { Card } from './Card.tsx'

type Filter = 'all' | 'soon' | 'dated' | 'rolling'

const FILTERS: { id: Filter; label: string }[] = [
  { id: 'all', label: 'All' },
  { id: 'soon', label: 'Closing in 30 days' },
  { id: 'dated', label: 'Has a deadline' },
  { id: 'rolling', label: 'Rolling or unlisted' },
]

function formatDate(date: Date) {
  return date.toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })
}

// The desktop's Awards: the one closing soonest as a spotlight with the call beside it, then every
// other award as a filterable grid, each with its "why you" note inline.
export function AwardsPage() {
  const m = useModel()
  const [filter, setFilter] = useState<Filter>('all')
  const [query, setQuery] = useState('')
  const top = m.hasProgramData ? m.topAward : undefined
  const lookup = m.lookup?.kind === 'verified' ? m.lookup : null

  const listed = useMemo(() => {
    const q = query.trim().toLowerCase()
    return (top ? m.rankedAwards.slice(1) : m.rankedAwards).filter((a) => {
      const days = daysUntil(a, m.today)
      if (filter === 'soon' && (days === null || days > 30)) return false
      if (filter === 'dated' && days === null) return false
      if (filter === 'rolling' && days !== null) return false
      return !q || `${a.name} ${a.whatItIs}`.toLowerCase().includes(q)
    })
  }, [m.rankedAwards, m.today, top, filter, query])

  if (m.universityId !== 'usask') {
    return (
      <div className="page page--narrow">
        <Card>
          <Guidance />
        </Card>
      </div>
    )
  }

  return (
    <div className="page awards-page">
      <div className="awards-page__top">
        {top && <AwardSpotlight award={top} className="card awards-page__spotlight" />}
        <Card index={1} className="awards-page__about" title="How this list works" icon="award">
          <p className="lead">
            The awards your school buries a few clicks deep, soonest first. Today is {formatDate(m.today)}.
          </p>
          <p className="footnote">
            {m.features.ai
              ? 'Each "why you" note is written for your courses and your target, and read in as it arrives.'
              : 'Each award shows the school’s own description of who it’s for.'}
          </p>
        </Card>
      </div>

      <div className="filterbar" role="toolbar" aria-label="Filter awards">
        <div className="chips" role="radiogroup" aria-label="Deadline">
          {FILTERS.map((f) => (
            <button
              key={f.id}
              type="button"
              role="radio"
              aria-checked={filter === f.id}
              className="chip chip--choice"
              onClick={() => setFilter(f.id)}
            >
              {f.label}
            </button>
          ))}
        </div>
        <label className="field field--compact">
          <Icon name="search" size={18} />
          <input type="search" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Filter by name" aria-label="Filter awards by name" />
        </label>
      </div>

      {listed.length === 0 ? (
        <Card>
          <p className="card__empty">
            <Icon name="award" size={20} />
            No award matches that filter. Try All.
          </p>
        </Card>
      ) : (
        <div className="award-grid">
          {listed.map((award, i) => (
            <Card key={award.id} index={2 + i} className="award-card award-anchor" id={`award-${award.id}`}>
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
            </Card>
          ))}
        </div>
      )}
    </div>
  )
}

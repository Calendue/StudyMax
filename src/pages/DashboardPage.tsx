import { useModel } from '../model.ts'
import { firstName } from '../auth.ts'
import { KIND_LABEL, courseCode, plural } from '../format.ts'
import { daysUntil } from '../lib/resources.ts'
import { statusLabel } from '../lib/classTracker.ts'
import { Icon } from '../ui/Icon.tsx'
import { Appear, Button, Chip, CountUp, Group, OptionList, Ring, Row } from '../ui/primitives.tsx'
import { TargetRow, TargetSheet } from '../screens/OverviewTab.tsx'
import { Deadline } from '../screens/AwardsTab.tsx'
import { Card, CardLink, StatCard } from './Card.tsx'

// The desktop's Closest: TandemTeach's dashboard grid, filled with StudyMax's real answers. A welcome
// card with the credential you're closest to, four figures beside it, then the lists the phone shows
// one under another laid out across the width.

/** How close counts as "within reach". */
const WITHIN_REACH = 3

function greeting(now: Date) {
  const h = now.getHours()
  return h < 5 ? 'Good evening' : h < 12 ? 'Good morning' : h < 18 ? 'Good afternoon' : 'Good evening'
}

function WelcomeCard() {
  const m = useModel()
  const hero = m.hero
  const done = hero.remaining === 0
  const name = firstName(m.account)
  const next = m.topOverlap?.course ?? m.plan[0]?.courses[0]?.code ?? null
  return (
    <Appear index={0} className="welcome-card">
      <span className="welcome-card__glow" aria-hidden />
      <div className="welcome-card__text">
        <p className="welcome-card__hello">
          {greeting(m.today)}
          {name ? `, ${name}` : ''}!
        </p>
        <p className="welcome-card__eyebrow">The {KIND_LABEL[m.heroKind].toLowerCase()} you&rsquo;re closest to</p>
        <h2 className="welcome-card__name">{hero.spec.name}</h2>
        <p className="welcome-card__lead">
          {done
            ? "Done. It'll show on your transcript."
            : `${hero.doneCount} of ${plural(hero.totalRequired, 'course')} already done. ${plural(hero.remaining, 'course')} to go.`}
        </p>
        {next && (
          <div className="welcome-card__next">
            <span className="welcome-card__next-label">Best next course</span>
            <span className="welcome-card__next-code">{courseCode(next)}</span>
            <span className="welcome-card__next-title">{m.courseTitle(next)}</span>
          </div>
        )}
        <div className="welcome-card__actions">
          <Button icon="plan" onClick={() => m.navigate('plan')}>
            See your term-by-term plan
          </Button>
        </div>
      </div>
      <Ring
        done={hero.doneCount}
        total={hero.totalRequired}
        size={176}
        stroke={14}
        duration={1}
        delay={0.25}
        label={`${hero.doneCount} of ${hero.totalRequired} courses done`}
      >
        <span className="welcome-card__figure">
          <CountUp value={hero.remaining} from={hero.totalRequired} duration={1} delay={0.25} />
        </span>
        <span className="welcome-card__unit">{done ? 'done' : hero.remaining === 1 ? 'course to go' : 'courses to go'}</span>
      </Ring>
    </Appear>
  )
}

function Stats() {
  const m = useModel()
  const within = [...m.matches, ...m.credentials].filter((x) => x.remaining > 0 && x.remaining <= WITHIN_REACH).length
  const award = m.universityId === 'usask' ? m.rankedAwards[0] : undefined
  const days = award ? daysUntil(award, m.today) : null
  const watches = m.classes.watches
  const open = watches.filter((w) => w.status === 'open').length
  return (
    <div className="dash__stats">
      <StatCard
        index={1}
        icon="check"
        label="Courses done"
        value={m.takenCourses.length}
        sub={m.inProgressCourses.length > 0 ? `${m.inProgressCourses.length} in progress` : 'From your transcript'}
        onClick={() => m.navigate('courses')}
      />
      <StatCard
        index={2}
        icon="layers"
        label="Within reach"
        value={within}
        unit={within === 1 ? 'credential' : 'credentials'}
        sub={`${WITHIN_REACH} or fewer courses away`}
      />
      <StatCard
        index={3}
        icon="clock"
        label="Next deadline"
        value={days}
        unit={days === null ? undefined : days === 1 ? 'day' : 'days'}
        sub={award ? award.name : 'No dated awards'}
        onClick={() => m.navigate('awards')}
      />
      <StatCard
        index={4}
        icon="seat"
        label="Seats watched"
        value={watches.length}
        sub={open > 0 ? `${open} open now` : watches.length > 0 ? 'Checked about once a minute' : 'None yet'}
        onClick={m.universityId === 'usask' ? () => m.navigate('classes') : undefined}
      />
    </div>
  )
}

function WhatsLeft() {
  const m = useModel()
  const hero = m.hero
  if (hero.remaining === 0) return null
  return (
    <Card index={5} title="What's left" icon="target" className="dash__left" action={<CardLink onClick={() => m.navigate('plan')}>Plan it</CardLink>}>
      <Group>
        {hero.unsatisfied.map((g, i) => (
          <Row
            key={i}
            index={i}
            leading={<span className="todo" aria-hidden />}
            title={<OptionList options={g.options} label={m.courseLabel} />}
            subtitle={g.need > 1 ? `Any ${g.need} of these` : g.options.length > 1 ? 'Any one of these' : undefined}
          />
        ))}
      </Group>
      {m.topOverlap && (
        <p className="footnote">
          <strong>{courseCode(m.topOverlap.course)}</strong> counts toward {m.topOverlap.specs.length} specializations at once,
          more than any other course you haven&rsquo;t taken.
        </p>
      )}
    </Card>
  )
}

function ThisTerm() {
  const m = useModel()
  const term = m.plan[0]
  return (
    <Card index={6} title={term ? term.label : 'Your plan'} icon="plan" className="dash__term" action={<CardLink onClick={() => m.navigate('plan')}>Open plan</CardLink>}>
      {term ? (
        <ul role="list" className="dash-list">
          {term.courses.map((c) => (
            <li key={c.code} className="dash-row">
              <span className="dash-row__code">{courseCode(c.code)}</span>
              <span className="dash-row__title">{m.courseTitle(c.code)}</span>
              {c.reason === 'prerequisite' && <Chip>Prereq</Chip>}
            </li>
          ))}
        </ul>
      ) : (
        <p className="card__empty">Nothing left to plan for {m.hero.spec.name}. Pick another target below.</p>
      )}
      {m.plan.length > 1 && <p className="footnote">Then {plural(m.plan.length - 1, 'more term')}, finishing {m.plan[m.plan.length - 1].label}.</p>}
    </Card>
  )
}

function AwardsSoon() {
  const m = useModel()
  if (m.universityId !== 'usask') return null
  return (
    <Card index={9} title="Awards closing soon" icon="award" action={<CardLink onClick={() => m.navigate('awards')}>All awards</CardLink>}>
      <ul role="list" className="dash-list">
        {m.rankedAwards.slice(0, 3).map((a) => (
          <li key={a.id} className="dash-row dash-row--stack">
            <Deadline award={a} today={m.today} />
            <span className="dash-row__title dash-row__title--strong">{a.name}</span>
            {a.value && <span className="dash-row__meta">{a.value}</span>}
          </li>
        ))}
      </ul>
    </Card>
  )
}

function Tracker() {
  const m = useModel()
  if (m.universityId !== 'usask') return null
  const watches = m.classes.watches
  return (
    <Card index={10} title="Class tracker" icon="seat" action={<CardLink onClick={() => m.navigate('classes')}>Open</CardLink>}>
      {watches.length === 0 ? (
        <div className="card__empty">
          <p>Watch a full section and StudyMax tells you the moment a seat opens, live from USask&rsquo;s class search.</p>
          <Button variant="secondary" icon="search" onClick={() => m.navigate('classes')}>
            Find a class
          </Button>
        </div>
      ) : (
        <ul role="list" className="dash-list">
          {watches.slice(0, 4).map((w) => (
            <li key={`${w.term}:${w.crn}`} className="dash-row">
              <span className="dash-row__code">{courseCode(`${w.subject}${w.courseNumber}`)}</span>
              <span className="dash-row__title">
                Section {w.sectionNumber} · {w.termDesc}
              </span>
              <Chip tone={w.status === 'open' ? 'urgent' : 'quiet'}>{statusLabel(w.status, w.seats)}</Chip>
            </li>
          ))}
        </ul>
      )}
    </Card>
  )
}

export function DashboardPage() {
  const m = useModel()
  return (
    <div className="dash">
      <section className="dash__top">
        <WelcomeCard />
        <Stats />
      </section>

      <section className="dash__grid">
        <WhatsLeft />
        <ThisTerm />
        {m.rest.length > 0 && (
          <Card index={7} title="Other specializations" icon="target">
            <Group>
              {m.rest.slice(0, 6).map((match, i) => (
                <TargetRow key={match.spec.id} match={match} index={i} name={match.spec.name} />
              ))}
            </Group>
          </Card>
        )}
        <Card index={8} title="Certificates and minors" icon="layers">
          {m.credentials.length > 0 ? (
            <>
              <Group>
                {m.credentials.map((c, i) => (
                  <TargetRow key={c.spec.id} match={c} index={i} name={c.program.name} kind={KIND_LABEL[m.kindOf(c.spec.id)]} />
                ))}
              </Group>
              <p className="footnote">Separate credentials from your degree, each with its own line on your transcript.</p>
            </>
          ) : (
            <p className="card__empty">
              <Icon name="layers" size={20} />
              None started yet. Courses outside your major are usually what opens one up.
            </p>
          )}
        </Card>
        <AwardsSoon />
        <Tracker />
      </section>

      <p className="footnote dash__note">
        Requirements are the catalogue&rsquo;s, but eligibility isn&rsquo;t: USask notes that &ldquo;registration in most senior
        CMPT courses will be restricted to students in the Department&rsquo;s programs.&rdquo; Confirm you can declare a
        credential before planning around it.
      </p>
      <TargetSheet />
    </div>
  )
}

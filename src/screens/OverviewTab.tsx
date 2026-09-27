import { useState } from 'react'
import { useModel } from '../model.ts'
import { firstName } from '../auth.ts'
import { KIND_LABEL, WHY_IT_MATTERS, WHY_SHORT, courseCode, plural } from '../format.ts'
import type { SpecializationMatch } from '../lib/match.ts'
import { ScreenTitle } from '../ui/chrome.tsx'
import { Appear, Button, Chip, CountUp, Group, OptionList, Ring, Row, SectionLabel } from '../ui/primitives.tsx'
import { Sheet } from '../ui/Sheet.tsx'
import { WhatIfSheet } from './WhatIfSheet.tsx'
import { ShareSheet } from './ShareSheet.tsx'

/** One line on why the credential counts, and the full reason a tap away. */
function WhyItMatters() {
  const m = useModel()
  const [open, setOpen] = useState(false)
  return (
    <p className="lead why-line">
      {open ? WHY_IT_MATTERS[m.heroKind] : WHY_SHORT[m.heroKind]}{' '}
      {!open && (
        <button type="button" className="inline-link" onClick={() => setOpen(true)} aria-expanded={open}>
          Why it matters
        </button>
      )}
    </p>
  )
}

export function OverviewTab() {
  const m = useModel()
  const hero = m.hero
  const done = hero.remaining === 0
  const name = firstName(m.account)

  return (
    <>
      <ScreenTitle greeting={name ? `Hi, ${name}.` : undefined}>What you&rsquo;re closest to</ScreenTitle>

      <Appear index={0} className="hero">
        <Ring
          done={hero.doneCount}
          total={hero.totalRequired}
          size={124}
          stroke={11}
          duration={0.9}
          delay={0.2}
          label={`${hero.doneCount} of ${hero.totalRequired} courses done`}
        >
          <span className="hero__figure">
            <CountUp value={hero.remaining} from={hero.totalRequired} duration={0.9} delay={0.2} />
          </span>
          <span className="hero__unit">{done ? 'done' : hero.remaining === 1 ? 'course to go' : 'courses to go'}</span>
        </Ring>
        <div className="hero__text">
          <span className="eyebrow">{KIND_LABEL[m.heroKind]}</span>
          <h2 className="hero__name">{hero.spec.name}</h2>
          <p className="hero__count">
            {done
              ? "Done. It'll show on your transcript."
              : `${hero.doneCount} of ${plural(hero.totalRequired, 'course')} already done`}
          </p>
        </div>
      </Appear>
      <Appear index={1}>
        <WhyItMatters />
      </Appear>

      {hero.remaining > 0 && (
        <>
          <Appear index={2}>
            <SectionLabel>What&rsquo;s left</SectionLabel>
          </Appear>
          <Group>
            {hero.unsatisfied.map((g, i) => (
              <Row
                key={i}
                index={2 + i}
                leading={<span className="todo" aria-hidden />}
                title={<OptionList options={g.options} label={m.courseLabel} />}
                subtitle={g.need > 1 ? `Any ${g.need} of these` : g.options.length > 1 ? 'Any one of these' : undefined}
              />
            ))}
          </Group>
          <Appear index={4} className="hero-action">
            <Button block onClick={() => m.setTab('plan')}>
              See your term-by-term plan
            </Button>
            <Button block variant="secondary" icon="compare" onClick={() => m.openSheet('whatif')}>
              What if I went for something else?
            </Button>
            <Button block variant="quiet" icon="share" onClick={() => m.openSheet('share')}>
              Share my result
            </Button>
          </Appear>
        </>
      )}

      {m.topOverlap && (
        <>
          <Appear index={5}>
            <SectionLabel>The one course to take next</SectionLabel>
          </Appear>
          <Appear index={5} className="spotlight">
            <p className="spotlight__code">{courseCode(m.topOverlap.course)}</p>
            <p className="spotlight__title">{m.courseTitle(m.topOverlap.course)}</p>
            <p className="spotlight__why">
              Counts toward <strong>{m.topOverlap.specs.length} specializations</strong> at once, more than any other
              course you haven&rsquo;t taken.
            </p>
            <div className="chips">
              {m.topOverlap.specs.map((s) => (
                <Chip key={s.id}>{s.name}</Chip>
              ))}
            </div>
          </Appear>
        </>
      )}

      {m.credentials.length > 0 && (
        <>
          <Appear index={6}>
            <SectionLabel>Certificates and minors you&rsquo;ve started</SectionLabel>
          </Appear>
          <Group>
            {m.credentials.map((c, i) => (
              <TargetRow key={c.spec.id} match={c} index={6 + i} name={c.program.name} kind={KIND_LABEL[m.kindOf(c.spec.id)]} />
            ))}
          </Group>
          <p className="footnote">
            Separate credentials from your degree, each with its own line on your transcript. Your major already covers
            part of them.
          </p>
        </>
      )}

      {m.rest.length > 0 && (
        <>
          <SectionLabel>Other specializations, closest first</SectionLabel>
          <Group>
            {m.rest.map((match, i) => (
              <TargetRow key={match.spec.id} match={match} index={i} name={match.spec.name} />
            ))}
          </Group>
        </>
      )}

      <p className="footnote">
        Requirements are the catalogue&rsquo;s, but eligibility isn&rsquo;t: USask notes that &ldquo;registration in most
        senior CMPT courses will be restricted to students in the Department&rsquo;s programs.&rdquo; Confirm you can
        declare a credential before planning around it.
      </p>

      <TargetSheet />
      <WhatIfSheet />
      <ShareSheet />
    </>
  )
}

export function TargetRow({ match, index, name, kind }: { match: SpecializationMatch; index: number; name: string; kind?: string }) {
  const m = useModel()
  const isHero = match.spec.id === m.hero.spec.id
  return (
    <Row
      index={index}
      leading={<Ring done={match.doneCount} total={match.totalRequired} size={40} stroke={4} delay={0.1 + Math.min(index, 10) * 0.04} />}
      title={name}
      subtitle={
        [kind, match.remaining === 0 ? 'Done' : `${match.remaining} left`, isHero ? 'Your target' : null]
          .filter(Boolean)
          .join(' · ')
      }
      onClick={() => m.openSheet(`target:${match.spec.id}`)}
    />
  )
}

export function TargetSheet() {
  const m = useModel()
  const id = m.sheet?.startsWith('target:') ? m.sheet.slice('target:'.length) : null
  const credential = m.credentials.find((c) => c.spec.id === id)
  const match = credential ?? m.matches.find((x) => x.spec.id === id)
  const kind = match ? m.kindOf(match.spec.id) : 'specialization'
  const isHero = match?.spec.id === m.hero.spec.id

  return (
    <Sheet
      open={!!match}
      onClose={() => m.setSheet(null)}
      title={credential?.program.name ?? match?.spec.name ?? ''}
      footer={
        match && match.remaining > 0 ? (
          <Button block disabled={isHero} onClick={() => m.planTarget(match.spec.id)}>
            {isHero ? 'Already your target' : 'Plan this one'}
          </Button>
        ) : undefined
      }
    >
      {match && (
        <>
          <div className="sheet-hero">
            <Ring done={match.doneCount} total={match.totalRequired} size={72} stroke={7}>
              <span className="sheet-hero__figure tnum">{match.remaining}</span>
            </Ring>
            <div>
              <span className="eyebrow">{KIND_LABEL[kind]}</span>
              <p className="sheet-hero__count">
                {match.remaining === 0
                  ? 'Done'
                  : `${match.remaining} to go, ${match.doneCount} of ${match.totalRequired} done`}
              </p>
            </div>
          </div>
          <p className="lead">{WHY_IT_MATTERS[kind]}</p>
          {match.remaining > 0 && (
            <>
              <SectionLabel>What&rsquo;s left</SectionLabel>
              <Group>
                {match.unsatisfied.map((g, i) => (
                  <Row
                    key={i}
                    index={i}
                    leading={<span className="todo" aria-hidden />}
                    title={<OptionList options={g.options} label={m.courseLabel} />}
                    subtitle={g.need > 1 ? `Any ${g.need} of these` : g.options.length > 1 ? 'Any one of these' : undefined}
                  />
                ))}
              </Group>
            </>
          )}
        </>
      )}
    </Sheet>
  )
}

import type { CSSProperties, ReactNode } from 'react'
import { Mark, Wordmark } from '../../ui/Brand.tsx'
import { Icon } from '../../ui/Icon.tsx'
import { Button } from '../../ui/primitives.tsx'
import { BEATS, beatIndex, CANOPY, GUIDE, MORE, PROBLEM, ROOTS, SCATTERED, SHOWCASE, STEPS, TEAM, type BeatId } from './beats.ts'
import { Showcase, ShowcaseNext } from './Showcase.tsx'

// The story's beats, each on its own branch. DOM order is story order (the roots first), so a screen
// reader and Tab start at the hero; the climb stacks them bottom to top.
//
// The climb reads a few data attributes to grow the tree around them:
//   data-anchor  the beat's content: where the trunk passes, and what the presenter's keys centre on
//   data-twig    a card that hangs off its own branch
//   data-chain   a card in the story's chain: an arrow runs from each one up to the next
//   data-ground / data-dusk / data-band / data-crown   where the zones meet, and where the crown opens

export interface BeatProps {
  grown: number
  live: Set<number>
}

function Beat({ id, grown, className, children, ...data }: { id: BeatId; grown: number; className?: string; children: ReactNode } & Record<`data-${string}`, string | number>) {
  const index = beatIndex(id)
  return (
    <section
      data-beat={index}
      className={`beat beat--${id}${index <= grown ? ' is-grown' : ''}${className ? ` ${className}` : ''}`}
      style={{ '--trunk': BEATS[index].trunk } as CSSProperties}
      aria-labelledby={`beat-${id}`}
      {...data}
    >
      {children}
    </section>
  )
}

export function RootsBeat({ grown, onGetStarted, onSkip }: BeatProps & { onGetStarted: () => void; onSkip: () => void }) {
  return (
    <Beat id="roots" grown={grown}>
      <div className="roots__air" data-ground>
        <div className="roots__copy" data-anchor data-mask>
          <div className="roots__lockup">
            <Mark size={96} className="roots__mark" />
            <Wordmark height={72} className="roots__wordmark" />
          </div>
          <h1 id="beat-roots" className="climb-display">
            {ROOTS.headline}
          </h1>
          <p className="roots__promise">{ROOTS.promise}</p>
          <div className="climb-actions">
            <Button onClick={onGetStarted}>Get started</Button>
            <Button variant="secondary" onClick={onSkip}>
              Skip to a sample student
            </Button>
          </div>
        </div>
        <p className="roots__cue" data-chain="0" data-key="cue">
          <svg viewBox="0 0 16 16" width="16" height="16" aria-hidden>
            <path d="M8 13V3M3.5 7.5 8 3l4.5 4.5" />
          </svg>
          Scroll up to grow
        </p>
      </div>
      <div className="roots__soil">
        <p className="roots__note">{ROOTS.note}</p>
      </div>
    </Beat>
  )
}

export function ProblemBeat({ grown }: BeatProps) {
  return (
    <Beat id="problem" grown={grown} data-side="left">
      <article className="beat-card" data-anchor data-twig data-chain="1" data-key="problem">
        <h2 id="beat-problem" className="climb-title">
          {PROBLEM.headline}
        </h2>
        <ul className="problem__lines">
          {PROBLEM.lines.map((l) => (
            <li key={l}>{l}</li>
          ))}
        </ul>
        <p className="beat-card__close">{PROBLEM.close}</p>
      </article>
    </Beat>
  )
}

export function ScatteredBeat({ grown }: BeatProps) {
  return (
    <Beat id="scattered" grown={grown} data-side="right">
      <div className="scattered" data-anchor data-upright>
        <article className="beat-card" data-twig data-chain="2" data-key="scattered">
          <h2 id="beat-scattered" className="climb-title">
            {SCATTERED.headline}
          </h2>
          <p className="beat-card__body">{SCATTERED.body}</p>
        </article>
        <ul className="scatter" aria-label="What StudyMax maps for USask">
          {SCATTERED.facts.map((f, i) => (
            <li key={f.label} className={`leaf leaf--${i % 2 === 0 ? 'left' : 'right'}`} data-twig data-key={`fact-${i}`} style={{ '--i': i } as CSSProperties}>
              <span className="leaf__figure">{f.figure}</span>
              <span className="leaf__label">{f.label}</span>
            </li>
          ))}
        </ul>
      </div>
    </Beat>
  )
}

export function GuideBeat({ grown }: BeatProps) {
  return (
    <Beat id="guide" grown={grown} data-side="left">
      <article className="beat-card beat-card--guide" data-anchor data-twig data-chain="3" data-key="guide">
        <h2 id="beat-guide" className="climb-title">
          {GUIDE.headline}
        </h2>
        <p className="beat-card__body">{GUIDE.body}</p>
      </article>
    </Beat>
  )
}

export function HowBeat({ grown }: BeatProps) {
  return (
    <Beat id="how" grown={grown}>
      <div className="how" data-anchor data-upright>
        <h2 id="beat-how" className="how__label">
          How it works
        </h2>
        <ol className="how__steps">
          {STEPS.map((s, i) => (
            <li
              key={s.title}
              className={`step step--${i % 2 === 0 ? 'right' : 'left'}`}
              data-twig
              data-chain={4 + i}
              data-key={`step-${i}`}
              style={{ '--i': i } as CSSProperties}
            >
              <span className="step__icon" aria-hidden>
                <Icon name={s.icon} size={22} />
              </span>
              <span className="step__text">
                <h3 className="step__title">{s.title}</h3>
                <p className="step__body">{s.body}</p>
              </span>
            </li>
          ))}
        </ol>
      </div>
    </Beat>
  )
}

export function ShowcaseBeat({ grown, live }: BeatProps) {
  const index = beatIndex('showcase')
  return (
    <Beat id="showcase" grown={grown} data-side="right">
      <div className="showcase beat-card" data-anchor data-twig data-chain="9" data-key="showcase" data-band data-upright>
        <div className="showcase__text">
          <p className="climb-label">{SHOWCASE.label}</p>
          <h2 id="beat-showcase" className="climb-title">
            {SHOWCASE.headline}
          </h2>
          <p className="beat-card__body">{SHOWCASE.body}</p>
          <ShowcaseNext />
          <p className="showcase__hint">{SHOWCASE.hint}</p>
          <p className="showcase__example">{SHOWCASE.example}</p>
        </div>
        <Showcase grown={index <= grown} live={live.has(index)} />
      </div>
    </Beat>
  )
}

export function MoreBeat({ grown }: BeatProps) {
  return (
    <Beat id="more" grown={grown} data-side="right">
      <div className="more" data-anchor data-upright>
        <h2 id="beat-more" className="beat-card beat-card--label climb-title" data-twig data-chain="10" data-key="more">
          {MORE.headline}
        </h2>
        <ul className="scatter scatter--more">
          {MORE.leaves.map((l, i) => (
            <li key={l.title} className={`leaf leaf--feature leaf--${i % 2 === 0 ? 'left' : 'right'}`} data-twig data-key={`more-${i}`} style={{ '--i': i } as CSSProperties}>
              <span className="leaf__icon" aria-hidden>
                <Icon name={l.icon} size={20} />
              </span>
              <span>
                <h3 className="leaf__title">{l.title}</h3>
                <p className="leaf__body">{l.body}</p>
              </span>
            </li>
          ))}
        </ul>
      </div>
    </Beat>
  )
}

export function TeamBeat({ grown }: BeatProps) {
  return (
    <Beat id="team" grown={grown} data-side="left">
      <article className="beat-card" data-anchor data-twig data-chain="11" data-key="team">
        <h2 id="beat-team" className="climb-title">
          {TEAM.headline}
        </h2>
        <ul className="team__names">
          {TEAM.names.map((n) => (
            <li key={n}>{n}</li>
          ))}
        </ul>
        <p className="beat-card__close">{TEAM.close}</p>
      </article>
    </Beat>
  )
}

export function CanopyBeat({ grown, onGetStarted, onSkip }: BeatProps & { onGetStarted: () => void; onSkip: () => void }) {
  return (
    <Beat id="canopy" grown={grown} data-dusk="0">
      <div className="canopy" data-anchor>
        <h2 id="beat-canopy" className="climb-display">
          {CANOPY.headline}
        </h2>
        <p className="canopy__body">{CANOPY.body}</p>
        <div className="climb-actions climb-actions--center">
          <Button onClick={onSkip}>Skip to a sample student</Button>
          <Button variant="secondary" onClick={onGetStarted}>
            Get started
          </Button>
        </div>
        <figure className="canopy__qr">
          <img src="/studymax-qr.svg" width={96} height={96} alt={`QR code for ${CANOPY.url}`} />
          <figcaption>
            {CANOPY.qr}
            <span>{CANOPY.url}</span>
          </figcaption>
        </figure>
        <figure className="canopy__meme">
          <img
            src="/study-maxing-meme.jpg"
            width={230}
            height={230}
            loading="lazy"
            alt="Drake meme: rejecting “Aura maxing,” approving “Study maxing.”"
          />
        </figure>
      </div>
      <ul className="blossoms" aria-label="Credentials StudyMax maps">
        {CANOPY.blossoms.map((b, i) => (
          <li
            key={b.id}
            className="blossom"
            data-blossom
            data-key={`blossom-${b.id}`}
            data-chain={i === 2 ? 12 : undefined}
            style={{ '--i': i } as CSSProperties}
          >
            <span className="blossom__bud" aria-hidden />
            <span className="blossom__name">{b.name}</span>
            <span className="blossom__kind">{b.kind}</span>
          </li>
        ))}
      </ul>
      <div className="canopy__crown" data-crown aria-hidden />
    </Beat>
  )
}

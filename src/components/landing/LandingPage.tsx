import { useState, type ReactNode } from 'react'
import { Wordmark } from '../../ui/Brand.tsx'
import { Icon, type IconName } from '../../ui/Icon.tsx'
import { ThemeSwitch } from '../../ui/ThemeSwitch.tsx'
import './landing.css'

interface LandingPageProps {
  /** Start the real onboarding wizard. */
  onGetStarted: () => void
  /** Bypass onboarding: straight to a sample student's courses, the fastest path for a demo. */
  onSkip: () => void
}

// Each step's line icon, in the app's own stroke set: no numbered labels.
const STEP_ICONS: IconName[] = ['upload', 'target', 'plan', 'phone']

const STEPS = [
  {
    title: 'Upload your transcript',
    body: 'A DegreeWorks audit or unofficial transcript PDF. StudyMax splits what you’ve finished from what you’re taking now.',
  },
  {
    title: 'See what you’re closest to',
    body: 'The specialization, certificate, or minor you’re nearest to finishing, and the one course that moves you furthest.',
  },
  {
    title: 'Get a term-by-term plan',
    body: 'Prerequisite chains included, even the ones the specialization page never lists.',
  },
  {
    title: 'Get the call',
    body: 'A phone call about the award closing soonest, because nobody reopens a dashboard.',
  },
]

interface Feature {
  tag: string
  icon: IconName
  title: string
  body: string
}

const FEATURES: Feature[] = [
  { tag: 'upload', icon: 'upload', title: 'Transcript parsing', body: 'PDF in; completed and in-progress courses out.' },
  { tag: 'match', icon: 'target', title: 'Credential matching', body: 'The credential you’re closest to, ranked by how little is left.' },
  { tag: 'plan', icon: 'plan', title: 'Term-by-term plan', body: 'A real sequence with prerequisites expanded, not a checklist.' },
  { tag: 'track', icon: 'seat', title: 'Class Tracker', body: 'Watch full USask sections for an open seat, live from the university’s own class search.' },
  { tag: 'detect', icon: 'layers', title: 'Certificates & minors detector', body: 'Finds credentials you’re already partway through.' },
  { tag: 'fund', icon: 'award', title: 'Scholarships by deadline', body: 'Awards ranked by how soon they close, with a note on why each fits you.' },
  { tag: 'call', icon: 'phone', title: 'The phone call', body: 'One call about the soonest deadline. It says its piece and hangs up.' },
  { tag: 'demo', icon: 'person', title: 'Sample data, no transcript needed', body: '“Load a sample student” runs the full reveal on a canned USask CS record.' },
]

interface QA {
  q: string
  a: ReactNode
}

const JUDGE_QA: QA[] = [
  {
    q: 'Why does this only fully work for Computer Science at USask?',
    a: 'That’s where the data is complete and verified: 12 specializations, 4 certificates, 1 minor, and prerequisites for roughly 240 courses, quoted from the real catalogue. Adding a program is a data task, not an engineering one: one file in src/data/programs/, and matching, planning, and credential detection pick it up.',
  },
  {
    q: 'Is the matching itself AI, or is it hardcoded?',
    a: 'Deterministic. src/lib/match.ts and src/lib/plan.ts give the same answer every time, the part you wouldn’t want a model guessing at. The model only reads messy transcript PDFs and writes the “why this fits you” scholarship notes.',
  },
  {
    q: 'What if a live transcript upload goes wrong mid-demo?',
    a: '“Load a sample student” runs the full reveal (match, plan, and call) on a canned record, no PDF needed. It’s the demo’s safety net.',
  },
  {
    q: 'Why a phone call instead of a banner or an email?',
    a: 'Nobody reopens a dashboard. An email about a bursary deadline gets archived; a call about $2,000 closing in a week gets answered.',
  },
  {
    q: 'Can the call actually answer questions back?',
    a: 'Not yet, by design. It says its piece about the closest deadline and hangs up. A real conversation is the natural next step.',
  },
  {
    q: 'How far could this scale beyond one school?',
    a: 'Schools and programs are already just data files. The work is verifying each school’s catalogue and award pages, which check-course-codes.ts and check-schools.ts keep honest.',
  },
]

export function LandingPage({ onGetStarted, onSkip }: LandingPageProps) {
  return (
    <div className="landing">
      <div className="landing__topbar">
        <Wordmark height={42} className="landing__wordmark" />
        <div className="landing__topbar-end">
          <ThemeSwitch />
        </div>
      </div>

      <Hero onGetStarted={onGetStarted} onSkip={onSkip} />

      <section className="landing__band landing__band--rose">
        <p className="landing__lede">
          Specializations that go on your transcript, certificates and minors you’re most of the way through,
          scholarships you never hear about. They exist, spread across dozens of pages nobody reads end to end.
        </p>
      </section>

      <section className="landing__section" aria-labelledby="preview-heading">
        <h2 id="preview-heading" className="landing__heading">
          What the reveal looks like
        </h2>
        <p className="landing__section-intro">A sample CS student: three courses done, one away from a specialization, and the award closing next.</p>
        <div className="landing__audit" aria-hidden="true">
          <div className="landing__audit-row landing__audit-row--done">
            <span className="landing__audit-code">CMPT 214</span>
            <span className="landing__audit-title">Programming Principles and Practice</span>
            <span className="landing__audit-check">done</span>
          </div>
          <div className="landing__audit-row landing__audit-row--done">
            <span className="landing__audit-code">CMPT 280</span>
            <span className="landing__audit-title">Intermediate Data Structures and Algorithms</span>
            <span className="landing__audit-check">done</span>
          </div>
          <div className="landing__audit-row landing__audit-row--done">
            <span className="landing__audit-code">CMPT 332</span>
            <span className="landing__audit-title">Operating Systems Concepts</span>
            <span className="landing__audit-check">done</span>
          </div>
          <div className="landing__audit-row landing__audit-row--pending">
            <span className="landing__audit-code">CMPT 317</span>
            <span className="landing__audit-title">Introduction to Artificial Intelligence</span>
            <span className="landing__audit-redaction-wrap">
              <span className="landing__audit-remaining">1 course left</span>
              <span className="landing__audit-redaction-bar" aria-hidden="true" />
            </span>
          </div>
          <div className="landing__audit-reveal">
            <span className="landing__audit-reveal-label">Closest credential</span>
            <span className="landing__audit-reveal-value">Artificial Intelligence Specialization</span>
          </div>
          <div className="landing__audit-award">
            <span>Continuing Student Bursary application</span>
            <span className="landing__audit-award-deadline">closes Oct 1</span>
          </div>
        </div>
      </section>

      <section className="landing__section landing__section--wide" aria-labelledby="how-heading">
        <h2 id="how-heading" className="landing__heading">
          How it works
        </h2>
        <ol className="landing__steps">
          {STEPS.map((step, i) => (
            <li key={step.title} className="landing__step">
              <span className="landing__step-index" aria-hidden="true">
                <Icon name={STEP_ICONS[i] ?? 'check'} size={20} />
              </span>
              <div>
                <h3 className="landing__step-title">{step.title}</h3>
                <p className="landing__step-body">{step.body}</p>
              </div>
            </li>
          ))}
        </ol>
      </section>

      <section className="landing__section landing__section--wide" aria-labelledby="features-heading">
        <h2 id="features-heading" className="landing__heading">
          Everything in the reveal
        </h2>
        <ul className="landing__features">
          {FEATURES.map((f) => (
            <li className="landing__feature" key={f.tag}>
              <span className="landing__step-index" aria-hidden="true">
                <Icon name={f.icon} size={20} />
              </span>
              <h3 className="landing__step-title">{f.title}</h3>
              <p className="landing__step-body">{f.body}</p>
            </li>
          ))}
        </ul>
      </section>

      <section className="landing__section" aria-labelledby="qa-heading">
        <h2 id="qa-heading" className="landing__heading">
          Questions, answered
        </h2>
        <p className="landing__section-intro">The ones we expect, answered up front.</p>
        <div className="landing__qa-list">
          {JUDGE_QA.map((item) => (
            <QAItem key={item.q} q={item.q} a={item.a} />
          ))}
        </div>
      </section>

      <footer className="landing__footer">
        <div className="landing__footer-cta">
          <h2 className="landing__heading">See what your school is hiding.</h2>
          <div className="landing__actions">
            <button type="button" className="landing__cta" onClick={onGetStarted}>
              Get started
            </button>
            <button type="button" className="landing__cta landing__cta--ghost" onClick={onSkip}>
              Skip to a sample student
            </button>
          </div>
        </div>
        <div className="landing__footer-meta">
          <p className="landing__team">Built by Ayo Ogunade, Sam Lafiaji, Tobi Salam, and Ibraheem Arif.</p>
          <p className="landing__stack">React, TypeScript, and Vite on Vercel. OpenAI reads transcripts and writes scholarship notes; Bland makes the call.</p>
        </div>
      </footer>
    </div>
  )
}

function Hero({ onGetStarted, onSkip }: { onGetStarted: () => void; onSkip: () => void }) {
  return (
    <section className="landing__hero">
      <div className="landing__hero-copy">
        <h1 className="landing__headline">Your university hides things in plain sight.</h1>
        <p className="landing__subhead">
          Upload your transcript. StudyMax finds the credential you’re closest to, the course that gets you there
          fastest, and calls you before your next scholarship deadline closes.
        </p>
        <div className="landing__actions">
          <button type="button" className="landing__cta" onClick={onGetStarted}>
            Get started
          </button>
          <button type="button" className="landing__cta landing__cta--ghost" onClick={onSkip}>
            Skip to a sample student
          </button>
        </div>
        <p className="landing__hero-note">End to end for Computer Science at USask. Everyone else still gets the scholarships.</p>
      </div>

      <div className="landing__hero-meme">
        <img
          src="/study-maxing-meme.jpg"
          alt="Drake meme: rejecting &ldquo;Aura maxing,&rdquo; approving &ldquo;Study maxing.&rdquo;"
          className="landing__meme-img"
        />
      </div>
    </section>
  )
}

function QAItem({ q, a }: QA) {
  const [open, setOpen] = useState(false)
  return (
    <div className="landing__qa-item">
      <button type="button" className="landing__qa-question" onClick={() => setOpen((v) => !v)} aria-expanded={open}>
        <span>{q}</span>
        <span className={`landing__qa-icon${open ? ' landing__qa-icon--open' : ''}`} aria-hidden="true">
          <Icon name="plus" size={18} />
        </span>
      </button>
      {open && <p className="landing__qa-answer">{a}</p>}
    </div>
  )
}

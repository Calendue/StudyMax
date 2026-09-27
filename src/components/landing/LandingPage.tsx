import { useState, type ReactNode } from 'react'
import { Wordmark } from '../../ui/Brand.tsx'
import './landing.css'

interface LandingPageProps {
  /** Start the real onboarding wizard. */
  onGetStarted: () => void
  /** Bypass onboarding: straight to a sample student's courses, the fastest path for a demo. */
  onSkip: () => void
}

const STEPS = [
  {
    title: 'Upload your transcript',
    body: 'A DegreeWorks audit or an unofficial transcript, as a PDF. StudyMax reads every course in every subject and separates what you’ve finished from what you’re taking now.',
  },
  {
    title: 'See what you’re closest to',
    body: 'Deterministic matching against the real requirement data finds the specialization, certificate, or minor you’re nearest to finishing — and the one course that moves you furthest toward it.',
  },
  {
    title: 'Get a term-by-term plan',
    body: 'Prerequisite chains expand automatically, including the ones the specialization page itself never lists, so the plan is one you could actually register from.',
  },
  {
    title: 'Get the call',
    body: 'A phone call about the award closing soonest — because nobody reopens a dashboard, and a $2,000 bursary deadline is worth interrupting a Tuesday for.',
  },
]

interface Feature {
  tag: string
  title: string
  body: string
}

const FEATURES: Feature[] = [
  { tag: 'upload', title: 'Transcript parsing', body: 'PDF in, structured course list out — completed and in-progress, split automatically.' },
  { tag: 'match', title: 'Credential matching', body: 'The specialization, certificate, or minor you’re closest to finishing, ranked by how little is left.' },
  { tag: 'plan', title: 'Term-by-term plan', body: 'A real sequence, prerequisites expanded, not just a checklist of remaining requirements.' },
  { tag: 'detect', title: 'Certificates & minors detector', body: 'Surfaces credentials a student is already partway through without knowing it.' },
  { tag: 'fund', title: 'Scholarships by deadline', body: 'Every award ranked by how soon it closes, with AI-written copy on why it fits you specifically.' },
  { tag: 'call', title: 'The phone call', body: 'One outbound call about the award closing soonest. It says its piece and hangs up — on purpose, see below.' },
  { tag: 'demo', title: 'Sample data, no transcript needed', body: '“Load sample student data” runs the entire reveal on a canned USask CS record — our own demo safety net.' },
]

interface QA {
  q: string
  a: ReactNode
}

const JUDGE_QA: QA[] = [
  {
    q: 'Why does this only fully work for Computer Science at USask?',
    a: 'Because that’s where the requirement data is complete and verified — 12 specializations, 4 certificates, 1 minor, and prerequisite chains for roughly 240 courses, all quoted from the real catalogue. Adding a program is a data task, not an engineering one: one file in src/data/programs/, registered in one index, and matching, planning, and credential detection all pick it up automatically.',
  },
  {
    q: 'Is the matching itself AI, or is it hardcoded?',
    a: 'It’s deterministic. src/lib/match.ts and src/lib/plan.ts read the requirement data and produce the same answer every time — the part you would not want a model guessing at. The model is used only where reasoning is genuinely needed: reading a messy transcript PDF, and writing the “why this fits you” scholarship copy.',
  },
  {
    q: 'What if a live transcript upload goes wrong mid-demo?',
    a: '“Load sample student data (USask CS)” runs the full reveal — credential match, plan, and the call — on a canned record with zero network dependency on a real PDF. It’s the safety net this demo is built around.',
  },
  {
    q: 'Why a phone call instead of a banner or an email?',
    a: 'Because nobody reopens a dashboard. An email about a bursary deadline gets archived; a phone call about $2,000 closing in a week gets answered. It’s the moment the whole pitch is built to land on.',
  },
  {
    q: 'Can the call actually answer questions back?',
    a: 'No, and that’s deliberate for now. It’s one-way: it says its piece about the closest deadline and hangs up. Making it a real conversation is the natural next step if we keep building this past the weekend.',
  },
  {
    q: 'How far could this scale beyond one school?',
    a: 'The architecture already assumes more than one program — schools and programs are just data files. The work is scraping and verifying each new school’s catalogue and award pages, which is exactly what check-course-codes.ts and check-schools.ts exist to keep honest as that list grows.',
  },
]

export function LandingPage({ onGetStarted, onSkip }: LandingPageProps) {
  return (
    <div className="landing">
      <div className="landing__topbar">
        <Wordmark height={40} className="landing__wordmark" />
        <button type="button" className="landing__skip" onClick={onSkip}>
          Skip to a sample student
        </button>
      </div>

      <Hero onGetStarted={onGetStarted} />

      <section className="landing__band landing__band--rose">
        <p className="landing__lede">
          Your university hides things in plain sight. Specializations that go on your transcript, certificates and
          minors you’re most of the way through, scholarships with deadlines you never hear about. They exist —
          they’re just spread across dozens of pages nobody reads end to end.
        </p>
      </section>

      <section className="landing__section" aria-labelledby="how-heading">
        <h2 id="how-heading" className="landing__heading">
          How it works
        </h2>
        <ol className="landing__steps">
          {STEPS.map((step, i) => (
            <li key={step.title} className="landing__step">
              <span className="landing__step-index">{String(i + 1).padStart(2, '0')}</span>
              <div>
                <h3 className="landing__step-title">{step.title}</h3>
                <p className="landing__step-body">{step.body}</p>
              </div>
            </li>
          ))}
        </ol>
      </section>

      <section className="landing__section" aria-labelledby="features-heading">
        <h2 id="features-heading" className="landing__heading">
          Everything in the reveal
        </h2>
        <div className="landing__ledger landing__ledger--features" role="table">
          {FEATURES.map((f) => (
            <div className="landing__ledger-row" role="row" key={f.tag}>
              <span className="landing__tag" role="cell">
                {f.tag}
              </span>
              <span className="landing__ledger-program" role="cell">
                {f.title}
              </span>
              <span className="landing__ledger-detail" role="cell">
                {f.body}
              </span>
            </div>
          ))}
        </div>
      </section>

      <section className="landing__meme" aria-label="Team meme">
        <img
          src="/study-maxing-meme.jpg"
          alt="Drake meme: rejecting &ldquo;Aura maxing,&rdquo; approving &ldquo;Study maxing.&rdquo;"
          className="landing__meme-img"
        />
      </section>

      <section className="landing__section" aria-labelledby="qa-heading">
        <h2 id="qa-heading" className="landing__heading">
          Questions we’d ask ourselves
        </h2>
        <p className="landing__section-intro">The ones we expect, answered before anyone has to ask.</p>
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
              Get Started
            </button>
            <button type="button" className="landing__cta landing__cta--ghost" onClick={onSkip}>
              Skip to the app
            </button>
          </div>
        </div>
        <div className="landing__footer-meta">
          <p className="landing__team">Built by Ayo Ogunade, Sam Lafiaji, Tobi Salam, and Ibraheem Arif.</p>
          <p className="landing__stack">React, TypeScript, Vite, deployed on Vercel. The OpenAI API for transcript reading and scholarship reasoning. Bland for the call.</p>
        </div>
      </footer>
    </div>
  )
}

function Hero({ onGetStarted }: { onGetStarted: () => void }) {
  return (
    <section className="landing__hero">
      <div className="landing__hero-copy">
        <h1 className="landing__headline">Your university hides things in plain sight.</h1>
        <p className="landing__subhead">
          Upload your transcript. StudyMax finds the credential you’re closest to finishing, the one course that
          moves you furthest toward it, and calls your phone about the scholarship deadline closing soonest.
        </p>
        <div className="landing__actions">
          <button type="button" className="landing__cta" onClick={onGetStarted}>
            Get Started
          </button>
        </div>
        <p className="landing__hero-note">Computer Science at the University of Saskatchewan, end to end. Everyone else still gets the scholarships.</p>
      </div>

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
  )
}

function QAItem({ q, a }: QA) {
  const [open, setOpen] = useState(false)
  return (
    <div className="landing__qa-item">
      <button type="button" className="landing__qa-question" onClick={() => setOpen((v) => !v)} aria-expanded={open}>
        <span>{q}</span>
        <span className="landing__qa-icon" aria-hidden="true">
          {open ? '−' : '+'}
        </span>
      </button>
      {open && <p className="landing__qa-answer">{a}</p>}
    </div>
  )
}

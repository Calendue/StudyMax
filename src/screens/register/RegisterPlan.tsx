import { useEffect, useRef, useState, type ReactNode } from 'react'
import { useModel } from '../../model.ts'
import { courseCode } from '../../format.ts'
import { statusLabel } from '../../lib/classTracker.ts'
import { slotPickLabel, type RegPick, type RegPlan, type RegRequest, type UnplacedReason } from '../../lib/registration.ts'
import { canFillOnPaws, openPawsAgent, REG_URL, type AgentMsg } from '../../lib/pawsAgent.ts'
import { PAWS_COPY } from '../../lib/pawsAgentScript.ts'
import { haptic } from '../../platform.ts'
import { Mark } from '../../ui/Brand.tsx'
import { ActionBar, ScreenBody, ScreenTitle, TopBar } from '../../ui/chrome.tsx'
import { Icon, type IconName } from '../../ui/Icon.tsx'
import { Appear, Button, Chip, Group, IconButton, Row, RowIcon, SectionLabel, Skeleton } from '../../ui/primitives.tsx'
import { Sheet } from '../../ui/Sheet.tsx'
import { useLayoutMode } from '../../ui/layout.ts'
import { Bookmarklet } from './Bookmarklet.tsx'
import { meetingsText, readingTime, sectionName } from './sectionText.ts'
import type { LoadedPlan } from './useRegistration.ts'

// Max's registration plan for the next term, in the app's own design: the real sections he picked
// from USask's public class search, and the way into PAWS. In the app, Max fills the CRNs into the
// student's own PAWS session (they sign in on USask's page themselves) and stops at Submit; on the
// web the student adds them by hand. Either way the student presses Submit, never Max.

const REASON_ICON: Record<UnplacedReason, IconName> = { full: 'seat', clash: 'calendar', 'not-offered': 'browse' }

/** A sentence ends with a full stop, whoever wrote it. */
const sentence = (text: string) => (/[.!?]$/.test(text) ? text : `${text}.`)

/** Max speaking: his mark, a line, and a spinner while he's busy. */
function MaxSays({ children, busy, tone = 'info' }: { children: ReactNode; busy?: boolean; tone?: 'info' | 'error' }) {
  return (
    <div className={`reg-max${tone === 'error' ? ' reg-max--error' : ''}`} role="status" aria-live="polite">
      <span className="reg-max__avatar" aria-hidden>
        <Mark size={18} />
      </span>
      <div className="reg-max__body">{children}</div>
      {busy && <span className="spinner reg-max__spinner" aria-hidden />}
    </div>
  )
}

interface CoursePicks {
  code: string
  title: string
  slotLabel?: string
  picks: RegPick[]
}

/** The picks, one entry per course: its lecture then its linked sections, as the plan orders them. */
function byCourse(picks: RegPick[]): CoursePicks[] {
  const courses: CoursePicks[] = []
  for (const p of picks) {
    const at = courses.find((c) => c.code === p.code)
    if (at) at.picks.push(p)
    else courses.push({ code: p.code, title: p.title, slotLabel: p.slotLabel, picks: [p] })
  }
  return courses
}

function SectionRow({ pick, index }: { pick: RegPick; index: number }) {
  return (
    <Row
      index={index}
      title={
        <>
          {sectionName(pick)}
          <Chip tone={pick.status === 'open' ? 'accent' : 'quiet'}>{statusLabel(pick.status, pick.seats)}</Chip>
        </>
      }
      subtitle={meetingsText(pick.meetings)}
      trailing={
        <span className="reg-crn">
          CRN <span className="tnum">{pick.crn}</span>
        </span>
      }
    />
  )
}

/** Copy to the clipboard, remembering what was copied for a moment. False when copying is blocked. */
function useCopy() {
  const [copied, setCopied] = useState<string | null>(null)
  const [blocked, setBlocked] = useState(false)
  const timer = useRef<number | null>(null)
  useEffect(() => () => void (timer.current && window.clearTimeout(timer.current)), [])
  async function copy(id: string, text: string) {
    try {
      await navigator.clipboard.writeText(text)
      haptic.selection()
      setCopied(id)
      if (timer.current) window.clearTimeout(timer.current)
      timer.current = window.setTimeout(() => setCopied(null), 1600)
    } catch {
      setBlocked(true)
    }
  }
  return { copied, blocked, copy }
}

/** The web's way in: the CRNs to copy, and the three steps on PAWS. */
function CrnSteps({ plan }: { plan: RegPlan }) {
  const { copied, blocked, copy } = useCopy()
  const termLabel = plan.request.termLabel
  return (
    <>
      <SectionLabel
        action={
          <button type="button" className="inline-link reg-copy-all" onClick={() => void copy('all', plan.crns.join('\n'))}>
            {copied === 'all' ? 'Copied' : 'Copy all'}
          </button>
        }
      >
        Your CRNs
      </SectionLabel>
      <Group>
        {plan.picks.map((p, i) => (
          <Row
            key={p.crn}
            index={i}
            leading={<span className="reg-num tnum">{i + 1}</span>}
            title={<span className="reg-crn reg-crn--big tnum">{p.crn}</span>}
            subtitle={`${courseCode(p.code)} · ${sectionName(p)}`}
            trailing={
              <IconButton
                icon={copied === p.crn ? 'check' : 'copy'}
                label={copied === p.crn ? `Copied CRN ${p.crn}` : `Copy CRN ${p.crn}`}
                onClick={() => void copy(p.crn, p.crn)}
              />
            }
          />
        ))}
      </Group>
      {blocked && <p className="footnote">Copying was blocked here, so select the CRNs above and copy them yourself.</p>}
      <ol className="reg-steps">
        <li>Sign in with your NSID on USask&rsquo;s page.</li>
        <li>Pick {termLabel} and press Continue.</li>
        <li>Open Enter CRNs, add each CRN, press Add to Summary, then Submit.</li>
      </ol>
    </>
  )
}

type Agent = {
  /** The PAWS web view is open (or opening): the button waits until it closes. */
  open: boolean
  line: string | null
  error: string | null
  /** The page's diagnostics (no credentials in them by construction), for Copy diagnostics. */
  rows: string[]
  closed: boolean
}

const IDLE: Agent = { open: false, line: null, error: null, rows: [], closed: false }

/**
 * The PAWS session in the app: opens once per tap, never reopens by itself, and turns what the web
 * view reports into Max's line.
 */
function usePawsSession(plan: RegPlan | null) {
  const [agent, setAgent] = useState<Agent>(IDLE)
  const session = useRef<{ close: () => Promise<void> } | null>(null)
  const closedEarly = useRef(false)

  // Leaving the screen closes the web view (and its cookies go with it).
  useEffect(
    () => () => {
      void session.current?.close().catch(() => {})
      session.current = null
    },
    [],
  )

  function onMessage(msg: AgentMsg) {
    if (msg.type === 'closed') {
      closedEarly.current = true
      session.current = null
    }
    if (msg.type === 'ready') haptic.light()
    setAgent((a) => {
      const rows = msg.rows ?? a.rows
      switch (msg.type) {
        case 'closed':
          return { ...a, rows, open: false, closed: true }
        case 'dump':
          return { ...a, rows }
        case 'signed-in':
          return { ...a, rows, error: null, line: 'You’re signed in. Max takes over on Register for Classes.' }
        case 'ready':
          return { ...a, rows, error: null, line: 'Everything’s in your summary. Review it and press Submit when you’re ready.' }
        case 'error':
          return { ...a, rows, error: msg.text ?? 'something on the page didn’t answer' }
        default:
          return msg.text ? { ...a, rows, error: null, line: msg.text } : { ...a, rows }
      }
    })
  }

  async function open() {
    if (!plan || agent.open || session.current) return
    closedEarly.current = false
    setAgent({ ...IDLE, open: true, line: 'Opening USask’s sign-in page…' })
    try {
      const handle = await openPawsAgent({ crns: plan.crns, termLabel: plan.request.termLabel, onMessage })
      if (closedEarly.current) void handle.close().catch(() => {})
      else session.current = handle
    } catch {
      session.current = null
      setAgent((a) => ({ ...a, open: false, error: 'PAWS didn’t open' }))
    }
  }

  return { agent, open }
}

/** What Max says about the session, above the button. */
function AgentLine({ agent, crns }: { agent: Agent; crns: string[] }) {
  const { copied, copy } = useCopy()
  if (agent.error) {
    // The agent's own sentences already name Max ("Max couldn't start on Banner's page. ...").
    const said = sentence(agent.error)
    return (
      <MaxSays tone="error">
        <p>
          {/^Max\b/.test(said) ? said : `Max couldn’t finish: ${said}`} You can add the CRNs yourself:{' '}
          <span className="reg-crn tnum">{crns.join(', ')}</span>
        </p>
        {agent.rows.length > 0 && (
          <button type="button" className="inline-link reg-max__quiet" onClick={() => void copy('dump', agent.rows.join('\n'))}>
            {copied === 'dump' ? 'Copied' : 'Copy diagnostics'}
          </button>
        )}
      </MaxSays>
    )
  }
  if (!agent.line) return null
  return (
    <MaxSays busy={agent.open}>
      <p>{agent.line}</p>
      {agent.closed && <p className="reg-max__note">PAWS is closed. If you didn&rsquo;t press Submit there, nothing was registered.</p>}
    </MaxSays>
  )
}

function ConfirmSheet({ plan, open, onClose, onConfirm }: { plan: RegPlan; open: boolean; onClose: () => void; onConfirm: () => void }) {
  const facts: [IconName, string][] = [
    ['person', 'You sign in on USask’s own page. StudyMax never sees your password.'],
    ['phone', 'Use Microsoft Authenticator push or a code. Passkeys don’t work here.'],
    ['check', 'Max fills in your list and adds it to your summary. You review it and press Submit yourself.'],
    ['bell', PAWS_COPY.tuition],
  ]
  return (
    <Sheet
      open={open}
      onClose={onClose}
      title={`Fill in ${plan.request.termLabel} on PAWS`}
      footer={
        <div className="reg-sheet-actions">
          <Button block icon="external" onClick={onConfirm}>
            Open PAWS
          </Button>
          <Button block variant="quiet" onClick={onClose}>
            Not now
          </Button>
        </div>
      }
    >
      <p className="lead">Max adds exactly these sections, then stops at Submit.</p>
      <Group>
        {plan.picks.map((p, i) => (
          <Row
            key={p.crn}
            index={i}
            title={`${courseCode(p.code)} · ${sectionName(p)}`}
            subtitle={meetingsText(p.meetings)}
            trailing={
              <span className="reg-crn">
                CRN <span className="tnum">{p.crn}</span>
              </span>
            }
          />
        ))}
      </Group>
      <ul className="reg-facts">
        {facts.map(([icon, text]) => (
          <li key={icon}>
            <Icon name={icon} size={18} />
            <span>{text}</span>
          </li>
        ))}
      </ul>
    </Sheet>
  )
}

/** Where the sections came from, in Max's words. */
function SourceLine({ plan, loading, failed, termLabel, retry }: { plan: RegPlan | null; loading: boolean; failed: boolean; termLabel: string; retry: () => void }) {
  const again = (
    <button type="button" className="inline-link" onClick={retry}>
      Try again
    </button>
  )
  if (loading) return <MaxSays busy>Max is checking {termLabel}&rsquo;s sections&hellip;</MaxSays>
  if (failed || !plan) {
    return (
      <MaxSays tone="error">
        <p>Max couldn&rsquo;t check {termLabel}&rsquo;s sections. {again}</p>
      </MaxSays>
    )
  }
  if (plan.source === 'offline') {
    return (
      <MaxSays>
        <p>
          Offline: showing practice sections. Their CRNs aren&rsquo;t USask&rsquo;s, so Max won&rsquo;t put them in PAWS. {again}
        </p>
      </MaxSays>
    )
  }
  if (plan.source === 'cached') {
    return (
      <MaxSays>
        <p>
          Seats as of {plan.fetchedAt ? readingTime(plan.fetchedAt) : 'Max’s last check'}: USask&rsquo;s class search didn&rsquo;t answer
          just now. {again}
        </p>
      </MaxSays>
    )
  }
  return (
    <MaxSays>
      <p>Max checked this term&rsquo;s sections live from USask&rsquo;s class search.</p>
    </MaxSays>
  )
}

function NothingToRegister() {
  const m = useModel()
  return (
    <>
      <TopBar onBack={() => m.navigate('plan')} backLabel="Plan" />
      <ScreenBody className="reg-plan">
        <ScreenTitle lead="Your plan’s next term has nothing left to register for.">Nothing to register</ScreenTitle>
        <Button block variant="secondary" onClick={() => m.navigate('plan')}>
          Back to your plan
        </Button>
      </ScreenBody>
    </>
  )
}

export function RegisterPlan({ request, loaded, onPractice }: { request: RegRequest | null; loaded: LoadedPlan; onPractice: () => void }) {
  const m = useModel()
  const wide = useLayoutMode() !== 'tabs'
  const { plan, loading, failed, retry } = loaded
  const paws = usePawsSession(plan)
  const [confirming, setConfirming] = useState(false)
  if (!request) return <NothingToRegister />

  const termLabel = request.termLabel
  const courses = plan ? byCourse(plan.picks) : []
  const credits = plan ? plan.picks.filter((p) => p.main).reduce((sum, p) => sum + p.credits, 0) : 0
  // Practice CRNs are placeholders: they never go near PAWS.
  const real = !!plan && plan.source !== 'offline' && plan.crns.length > 0
  const canPractise = !!plan && plan.picks.length > 0

  return (
    <>
      <TopBar onBack={() => m.navigate('plan')} backLabel="Plan" />
      <ScreenBody className="reg-plan">
        <ScreenTitle>Register for {termLabel}</ScreenTitle>
        <SourceLine plan={plan} loading={loading} failed={failed} termLabel={termLabel} retry={retry} />

        {loading && (
          <>
            <SectionLabel>Max&rsquo;s picks</SectionLabel>
            <Group className="reg-course">
              {[0, 1, 2].map((i) => (
                <div key={i} className="reg-skeleton">
                  <Skeleton lines={2} />
                </div>
              ))}
            </Group>
          </>
        )}

        {plan && (
          <>
            {plan.termOpen === false && (
              <Appear index={0} className="notice">
                <p>
                  <strong>PAWS isn&rsquo;t taking registrations for {termLabel} yet.</strong> USask&rsquo;s class search lists it as
                  view-only. Max&rsquo;s list is ready for when your registration opens.
                </p>
              </Appear>
            )}

            {courses.length > 0 && (
              <>
                <SectionLabel action={<span className="section-label__count tnum">{credits} credit units</span>}>
                  Max&rsquo;s picks
                </SectionLabel>
                {courses.map((c, ci) => (
                  <Appear key={c.code} index={ci} className="group reg-course">
                    <div className="reg-course__head">
                      <p className="reg-course__name">
                        <strong>{courseCode(c.code)}</strong> {c.title}
                      </p>
                      {c.slotLabel && (
                        <p className="reg-course__slot">
                          <Icon name="spark" size={14} />
                          {slotPickLabel(c.slotLabel)}
                        </p>
                      )}
                    </div>
                    {c.picks.map((p, i) => (
                      <SectionRow key={p.crn} pick={p} index={ci + i} />
                    ))}
                  </Appear>
                ))}
              </>
            )}

            {plan.unplaced.length > 0 && (
              <>
                <SectionLabel>Max couldn&rsquo;t place</SectionLabel>
                <Group>
                  {plan.unplaced.map((u, i) => (
                    <Row
                      key={`${u.code}-${u.slotLabel ?? ''}`}
                      index={i}
                      leading={<RowIcon name={REASON_ICON[u.reason]} tone="quiet" />}
                      title={
                        u.slotLabel ?? (
                          <>
                            <strong>{courseCode(u.code)}</strong> {u.title}
                          </>
                        )
                      }
                      subtitle={sentence(u.text)}
                    />
                  ))}
                </Group>
              </>
            )}

            {request.booked.length > 0 && (
              <>
                <SectionLabel>Already registered</SectionLabel>
                <Group>
                  {request.booked.map((c, i) => {
                    const lecture = plan.booked.find((p) => p.code === c.code)
                    return (
                      <Row
                        key={c.code}
                        index={i}
                        title={
                          <>
                            <strong>{courseCode(c.code)}</strong> {c.title}
                          </>
                        }
                        subtitle={lecture ? `${sectionName(lecture)} · ${meetingsText(lecture.meetings)}` : undefined}
                        trailing={<Icon name="check" size={18} className="row__check" />}
                      />
                    )
                  })}
                </Group>
                <p className="footnote">
                  Max won&rsquo;t register these again. He keeps their first lecture&rsquo;s times free; PAWS flags a clash if
                  you&rsquo;re in another section.
                </p>
              </>
            )}

            {!canFillOnPaws && real && <CrnSteps plan={plan} />}
            {!canFillOnPaws && real && wide && <Bookmarklet crns={plan.crns} termLabel={termLabel} />}

            <p className="footnote">
              {canFillOnPaws ? PAWS_COPY.pitch : 'Max plans your registration; you sign in and press Submit on PAWS.'} {PAWS_COPY.tuition}
            </p>
          </>
        )}
      </ScreenBody>

      <ActionBar>
        {canFillOnPaws && <AgentLine agent={paws.agent} crns={plan?.crns ?? []} />}
        {plan && !real ? (
          <Button block onClick={onPractice} disabled={!canPractise}>
            Practice run
          </Button>
        ) : (
          <>
            {canFillOnPaws ? (
              <Button block disabled={!real || paws.agent.open} onClick={() => setConfirming(true)}>
                {paws.agent.open ? 'PAWS is open' : 'Fill it in on PAWS'}
              </Button>
            ) : (
              <Button block icon="external" disabled={!real} onClick={() => window.open(REG_URL, '_blank', 'noopener')}>
                Open PAWS registration
              </Button>
            )}
            <Button block variant="secondary" disabled={!canPractise} onClick={onPractice}>
              Practice run
            </Button>
          </>
        )}
      </ActionBar>

      {plan && canFillOnPaws && (
        <ConfirmSheet
          plan={plan}
          open={confirming}
          onClose={() => setConfirming(false)}
          onConfirm={() => {
            setConfirming(false)
            void paws.open()
          }}
        />
      )}
    </>
  )
}

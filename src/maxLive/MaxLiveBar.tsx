// The live strip above the Skill Tree while Max is on a call: where the call is, what Max is changing
// right now, what it does to graduation, and — for a proposal — Keep this plan / Not now. Desktop gets
// the full bar; `compact` is the phone's one-line version. Reads the model; no state of its own.
import { useModel } from '../model.ts'
import { Button } from '../ui/primitives.tsx'
import { Icon } from '../ui/Icon.tsx'
import { MaxOwl } from '../ui/MaxOwl.tsx'
import { livePose } from '../ui/owlPose.ts'
import './maxLive.css'

const CALL_LINE: Record<string, string> = {
  queued: 'Calling your phone…',
  ringing: 'Calling your phone…',
  in_progress: 'On the call with Max',
  ended: 'Call ended',
  voicemail: "Max couldn't reach you",
  no_answer: "Max couldn't reach you",
  failed: "The call didn't go through",
}

const ENDED = new Set(['ended', 'voicemail', 'no_answer', 'failed'])

/** The Plan tab's way in: talk the plan through with Max, and watch the tree change as he does. */
export function TalkToMax() {
  const m = useModel()
  if (!m.features.max || !m.features.live || m.maxLive.active || m.plan.length === 0) return null
  return (
    <div className="max-nudge max-live-entry">
      <MaxOwl pose="idle" size={88} className="max-nudge__owl" />
      <div className="max-nudge__text">
        <p className="max-nudge__line">Want to talk this plan through?</p>
        <p className="max-nudge__sub">I&rsquo;ll call you and reshape this tree as we talk.</p>
      </div>
      <Button variant="secondary" icon="phone" onClick={() => m.go('ping-max')}>
        Talk it through with Max
      </Button>
    </div>
  )
}

export function MaxLiveBar({ compact = false }: { compact?: boolean }) {
  const m = useModel()
  const live = m.maxLive
  if (!live.active) return null

  const status = live.callStatus ?? 'queued'
  const ended = ENDED.has(status)
  const unreached = status === 'voicemail' || status === 'no_answer' || status === 'failed'
  const s = live.scenario
  const open = s?.status === 'presented'
  const grad = s?.graduation
  const gradChanged = Boolean(open && grad?.before && grad.after && grad.before !== grad.after)
  const caption = live.working ? 'Max is looking…' : (live.frame?.caption ?? (open ? s?.headline[0] : null))

  let state: string
  if (unreached) state = CALL_LINE[status]
  else if (s?.status === 'committed' && !open) state = 'Saved as your plan'
  else if (s?.status === 'discarded') state = 'Left as it was'
  else state = CALL_LINE[status] ?? 'On the call with Max'

  return (
    <section
      className={`max-live${compact ? ' max-live--compact' : ''}${ended ? ' max-live--ended' : ''}${live.working ? ' is-working' : ''}`}
      aria-label="Max, live on your plan"
    >
      <div className="max-live__row">
        <MaxOwl pose={ended ? 'idle' : livePose(live)} size={compact ? 30 : 40} className="max-live__owl" />
        {!ended && (
          <span className="max-live__live" aria-hidden>
            <span className="max-live__dot is-on" /> Live
          </span>
        )}
        <span className="max-live__state" aria-live="polite">
          {s?.status === 'committed' && !open && <Icon name="check" size={16} />} {state}
        </span>
        {status === 'in_progress' && (
          <span className={`max-live__wave${live.working || live.frame ? ' is-speaking' : ''}`} aria-hidden>
            <i />
            <i />
            <i />
            <i />
            <i />
          </span>
        )}
        {live.demo && <span className="max-live__tag">Rehearsal · nothing is saved</span>}
        {open && !compact && !live.demo && <span className="max-live__tag">Max's proposal · not saved</span>}
        {ended && (
          <button type="button" className="max-live__close" onClick={live.stop} aria-label="Close">
            <Icon name="close" size={16} />
          </button>
        )}
      </div>

      {caption && !unreached && (
        <p key={caption} className="max-live__caption is-new" aria-live="polite">
          {caption}
        </p>
      )}

      {gradChanged && (
        <p className="max-live__grad">
          Graduation <s>{grad!.before}</s> <span aria-hidden>→</span> <strong>{grad!.after}</strong>
        </p>
      )}

      {live.log.length > 1 && (
        <details className="max-live__log">
          <summary>What Max changed ({live.log.length})</summary>
          <ol>
            {live.log.map((line, i) => (
              <li key={`${i}-${line}`}>{line}</li>
            ))}
          </ol>
        </details>
      )}

      {!compact && open && !live.demo && s && s.headline.length > 1 && (
        <ul className="max-live__lines">
          {s.headline.slice(gradChanged ? 1 : 0).map((line) => (
            <li key={line}>{line}</li>
          ))}
        </ul>
      )}

      {!compact && live.options && !open && !live.working && (
        <ul className="max-live__options" aria-label="What Max is comparing">
          {live.options.options.map((o) => (
            <li key={o.label} className={o.label === live.options?.recommended ? 'is-recommended' : undefined}>
              <span>{o.label}</span>
              <span className="max-live__option-grad">
                {o.graduation ?? '—'} · {o.vsNow}
              </span>
            </li>
          ))}
        </ul>
      )}

      {open && s && s.errors.length > 0 && <p className="max-live__error">{s.errors[0]}</p>}
      {live.error && <p className="max-live__error">{live.error}</p>}

      {open && !live.demo && (
        <div className="max-live__actions">
          <Button icon="check" disabled={live.busy || s!.errors.length > 0} onClick={() => void live.keep()} className={s!.requiresAppConfirmation ? 'max-live__keep is-asked' : 'max-live__keep'}>
            Keep this plan
          </Button>
          <Button variant="secondary" disabled={live.busy} onClick={() => void live.leave()}>
            Not now
          </Button>
        </div>
      )}
      {open && s?.requiresAppConfirmation && !compact && (
        <p className="max-live__hint">Switching specializations is saved with a tap, not over the phone.</p>
      )}

      {unreached && (
        <div className="max-live__actions">
          <Button variant="secondary" icon="phone" onClick={() => m.go('ping-max')}>
            Try again
          </Button>
        </div>
      )}
    </section>
  )
}

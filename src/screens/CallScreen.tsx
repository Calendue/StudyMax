import { useModel } from '../model.ts'
import { daysUntil } from '../lib/resources.ts'
import { ActionBar, ScreenBody, ScreenTitle, TopBar } from '../ui/chrome.tsx'
import { Icon } from '../ui/Icon.tsx'
import { Appear, Button, Chip, Group, Row, RowIcon } from '../ui/primitives.tsx'
import { Sheet } from '../ui/Sheet.tsx'

export function CallScreen() {
  const m = useModel()
  if (m.callStatus !== 'idle') return <CallState />

  const award = m.topAward
  const days = award ? daysUntil(award, m.today) : null
  const digits = m.phone.replace(/\D/g, '').length
  const canCall = digits >= 7

  return (
    <>
      <TopBar onBack={() => m.go('results', -1)} backLabel="Results" />
      <ScreenBody>
        <ScreenTitle lead="Nobody reopens a dashboard. So StudyMax phones you once, says its piece and hangs up. One way, nothing to answer.">
          Get the call
        </ScreenTitle>

        {award && (
          <Appear index={0} className="spotlight">
            <Chip tone={days !== null && days <= 14 ? 'urgent' : 'quiet'} icon="clock">
              {m.topAwardDeadlineText ?? award.deadline}
            </Chip>
            <h2 className="spotlight__name">{award.name}</h2>
            {award.value && <p className="spotlight__value">{award.value}</p>}
            <p className="spotlight__why">{award.whatItIs}</p>
          </Appear>
        )}

        <Group>
          <Row
            index={1}
            leading={<RowIcon name="phone" />}
            title="What the call will say"
            subtitle={`${m.hero.spec.name}${award ? ', then this award' : ''}. About 20 seconds.`}
            onClick={() => m.openSheet('script')}
          />
        </Group>

        <Appear index={2} className="form">
          <label className="field-label" htmlFor="call-phone">
            Your phone number
          </label>
          <div className="field">
            <input
              id="call-phone"
              type="tel"
              inputMode="tel"
              autoComplete="tel"
              enterKeyHint="go"
              value={m.phone}
              onChange={(e) => m.setPhone(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && canCall) void m.callMe()
              }}
              placeholder="+1 306 555 0123"
            />
          </div>
          <p className="footnote">Used for this one call. It&rsquo;s never saved.</p>
        </Appear>
      </ScreenBody>

      <ActionBar>
        <Button block icon="phone" disabled={!canCall} onClick={() => void m.callMe()}>
          Call me now
        </Button>
      </ActionBar>

      <Sheet open={m.sheet === 'script'} onClose={() => m.setSheet(null)} title="What the call will say">
        <p className="script">&ldquo;{m.callFallbackScript}&rdquo;</p>
        <p className="footnote">A calm voice reads it once, then hangs up. It can&rsquo;t answer questions and doesn&rsquo;t try.</p>
      </Sheet>
    </>
  )
}

/** Calling, placed, or failed: its own full-screen state, so starting the call feels like an event. */
function CallState() {
  const m = useModel()
  const award = m.topAward
  const calling = m.callStatus === 'calling'
  const ok = m.callStatus === 'success'

  return (
    <>
      <TopBar onBack={calling ? undefined : () => m.go('results', -1)} backLabel="Results" />
      <ScreenBody className="call-state">
        <div className={`pulse${calling ? ' pulse--live' : ''}`} aria-hidden>
          <span className="pulse__ring" />
          <span className="pulse__ring" />
          <span className="pulse__ring" />
          <span className={`pulse__core${ok || calling ? '' : ' pulse__core--quiet'}`}>
            <Icon name={ok ? 'check' : 'phone'} size={34} />
          </span>
        </div>

        <div className="call-state__text" aria-live="polite">
          <h1 className="wait__title">{calling ? 'Calling you now' : ok ? 'Call placed' : "The call didn't go through"}</h1>
          <p className="lead">
            {calling
              ? `${m.phone}. Pick up when it rings: it's short, and one way.`
              : ok
                ? 'It should ring in a few seconds.'
                : "Here's what it would have said, so you have it anyway:"}
          </p>
        </div>

        {m.callStatus === 'error' && (
          <Appear className="script-block">
            <p className="script">&ldquo;{m.callFallbackScript}&rdquo;</p>
          </Appear>
        )}

        {!calling && award && (
          <Appear index={1} className="call-link">
            <p className="footnote">
              {ok ? "A phone call can't hand you a link, so here it is:" : "Either way, here's the award the call points at:"}
            </p>
            <a className="link-row" href={award.url} target="_blank" rel="noreferrer">
              <span>
                <span className="link-row__title">{award.name}</span>
                <span className="link-row__meta">{m.topAwardDeadlineText ?? award.deadline}</span>
              </span>
              <Icon name="external" size={18} />
            </a>
          </Appear>
        )}
      </ScreenBody>

      {!calling && (
        <ActionBar>
          {ok ? (
            <Button block variant="secondary" onClick={() => m.go('results', -1)}>
              Back to your results
            </Button>
          ) : (
            <Button block icon="phone" onClick={() => void m.callMe()}>
              Try again
            </Button>
          )}
          <Button block variant="quiet" onClick={() => m.setCallStatus('idle')}>
            Use a different number
          </Button>
        </ActionBar>
      )}
    </>
  )
}

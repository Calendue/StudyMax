import { useEffect, useState } from 'react'
import { useModel } from '../model.ts'
import { plural } from '../format.ts'
import { TopBar } from '../ui/chrome.tsx'
import { Mark } from '../ui/Brand.tsx'
import { Appear, Button } from '../ui/primitives.tsx'
import { StatusLines, type StatusLine } from './StatusLines.tsx'

// The full-screen wait while the model reads the transcript (10 to 30 seconds). Every line says what is
// actually happening at that moment: no timed fake steps, no percentages.
export function ReadingScreen() {
  const m = useModel()
  const [slow, setSlow] = useState(false)
  useEffect(() => {
    if (m.readPhase !== 'reading') return
    const id = setTimeout(() => setSlow(true), 25_000)
    return () => clearTimeout(id)
  }, [m.readPhase])

  const found = m.readPhase === 'found'
  const lines: StatusLine[] = [
    { text: 'Preparing your PDF', state: m.readPhase === 'preparing' ? 'active' : 'done' },
    {
      text: 'Reading every course, and sorting finished ones from ones in progress',
      state: m.readPhase === 'reading' ? 'active' : found ? 'done' : 'pending',
    },
  ]
  if (found) {
    lines.push({
      text:
        `Found ${plural(m.completed.size, 'completed course')}` +
        (m.uploadInProgress.length > 0 ? ` and ${m.uploadInProgress.length} in progress` : ''),
      state: 'done',
    })
  }

  return (
    <>
      <TopBar
        onBack={() => {
          m.back()
        }}
        backLabel="Cancel"
      />
      <main className="wait">
        <div className={`wait__mark${found ? ' wait__mark--done' : ''}`} aria-hidden>
          <Mark size={72} />
        </div>
        <Appear index={0}>
          <h1 className="wait__title">{found ? 'Got it' : 'Reading your transcript'}</h1>
        </Appear>
        <StatusLines lines={lines} />
        <Appear index={3}>
          <p className="wait__hint" aria-live="polite">
            {found
              ? 'Taking you to the list so you can check it.'
              : slow
                ? 'Still reading. Long audits take a little more time.'
                : 'This usually takes 10 to 30 seconds.'}
          </p>
        </Appear>
      </main>
      {!found && (
        <footer className="actionbar actionbar--flat">
          <Button block variant="quiet" onClick={() => m.back()}>
            Add courses by hand instead
          </Button>
        </footer>
      )}
    </>
  )
}

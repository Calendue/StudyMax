import { useModel } from '../model.ts'
import { LandingPage } from '../components/landing/LandingPage.tsx'

// Ayo's landing page, as the first screen on the web. It's a long page, so it scrolls in its own
// body like every other screen (the root never scrolls), and the shell drops its phone-width column.
export function LandingScreen() {
  const m = useModel()
  return (
    <main className="screen__body">
      <LandingPage onGetStarted={m.startFromLanding} onSkip={m.loadSampleStudent} />
    </main>
  )
}

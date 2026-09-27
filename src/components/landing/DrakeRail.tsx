import { useState } from 'react'

/** Ayo's Drake meme on its rail across the canopy; useDrakeCue decides when it rides. */
export function DrakeRail({ run, reduce }: { run: number; reduce: boolean }) {
  const [shown, setShown] = useState(0)
  if (run === 0 || shown === run) return null
  return (
    <div key={run} className={`drake-rail${reduce ? ' drake-rail--still' : ''}`} onAnimationEnd={(e) => e.animationName.startsWith('drake-pass') && setShown(run)}>
      <figure className="drake-rail__card">
        <img
          src="/study-maxing-meme.jpg"
          alt="Drake meme: rejecting “Aura maxing,” approving “Study maxing.”"
          className="drake-rail__img"
          draggable={false}
        />
      </figure>
    </div>
  )
}

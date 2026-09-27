import { useEffect, useRef, useState } from 'react'
import { useModel } from '../model.ts'
import { KIND_LABEL, courseCode } from '../format.ts'
import { canvasToBlob, drawShareCard, shareOrDownload } from '../lib/shareCard.ts'
import { computeMatches } from '../lib/match.ts'
import { haptic } from '../platform.ts'
import { Wordmark } from '../ui/Brand.tsx'
import { Button, Skeleton } from '../ui/primitives.tsx'
import { Sheet } from '../ui/Sheet.tsx'

// "Share my result": the closest credential and the plan as one branded image, previewed first, then
// handed to the system share sheet (or downloaded where sharing files isn't supported).

const SITE = 'www.studymax.study'

export function ShareSheet() {
  const m = useModel()
  const open = m.sheet === 'share'
  const markRef = useRef<HTMLSpanElement>(null)
  const [image, setImage] = useState<{ blob: Blob; url: string } | null>(null)
  const [status, setStatus] = useState<'idle' | 'shared' | 'downloaded' | 'failed'>('idle')

  const { hero, heroKind, plan, roadmap, planCompleted: completed, planInProgress: inProgressCourses, activeDegree } = m
  useEffect(() => {
    if (!open) return
    let live = true
    let url: string | null = null
    setStatus('idle')
    setImage(null)
    // What's truly left once this term's courses are passed, the same count the plan works from.
    const effectiveHero = computeMatches([hero.spec], completed, activeDegree)[0] ?? hero
    const afterInProgress = computeMatches([hero.spec], new Set([...completed, ...inProgressCourses]), activeDegree)[0]
    const remaining = afterInProgress?.remaining ?? hero.remaining
    // The first course the plan itself schedules, so "Start with" always matches the plan.
    const next = plan.flatMap((t) => t.courses)[0]?.code
    void drawShareCard({
      kindLabel: KIND_LABEL[heroKind],
      name: hero.spec.name,
      doneCount: effectiveHero.doneCount,
      inProgressCount: effectiveHero.remaining - remaining,
      totalRequired: hero.totalRequired,
      remaining,
      plan: roadmap,
      finish: plan[plan.length - 1]?.label ?? null,
      nextCourse: next ? courseCode(next) : undefined,
      site: SITE,
      wordmarkSvg: markRef.current?.innerHTML,
    })
      .then(canvasToBlob)
      .then((blob) => {
        if (!live) return
        if (!blob) return setStatus('failed')
        url = URL.createObjectURL(blob)
        setImage({ blob, url })
      })
      .catch(() => live && setStatus('failed'))
    return () => {
      live = false
      if (url) URL.revokeObjectURL(url)
    }
  }, [open, hero, heroKind, plan, roadmap, completed, inProgressCourses, activeDegree])

  async function share() {
    if (!image) return
    haptic.light()
    const effectiveHero = computeMatches([hero.spec], completed, activeDegree)[0] ?? hero
    const result = await shareOrDownload(
      image.blob,
      'studymax-result.png',
      `I'm ${effectiveHero.remaining === 0 ? 'done with' : `${effectiveHero.remaining} away from`} the ${hero.spec.name}. See what your school hides: https://${SITE}`,
    )
    if (result !== 'cancelled') setStatus(result)
  }

  return (
    <Sheet
      open={open}
      onClose={() => m.setSheet(null)}
      title="Share your result"
      footer={
        <Button block icon="share" disabled={!image} onClick={() => void share()}>
          {status === 'shared' ? 'Shared' : status === 'downloaded' ? 'Saved to your downloads' : 'Share image'}
        </Button>
      }
    >
      {/* The wordmark, rendered once off-screen so the card can draw the real brand mark. */}
      <span ref={markRef} className="visually-hidden" aria-hidden>
        <Wordmark height={96} />
      </span>
      {status === 'failed' ? (
        <p className="empty">Couldn&rsquo;t share the image. Close this sheet and try again.</p>
      ) : image ? (
        <img className="share-preview" src={image.url} alt={`Share card: ${hero.spec.name}, ${hero.remaining} courses to go.`} />
      ) : (
        <Skeleton lines={6} />
      )}
    </Sheet>
  )
}

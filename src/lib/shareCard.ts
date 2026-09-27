import type { PlannedTerm } from './plan.ts'

// The share card: a student's result as one branded 1080×1350 image (a 4:5 post), drawn on a plain
// canvas so no screenshot library is needed. It's an export of the brand, not app UI, so it uses the
// canonical palette directly and always looks the same, whatever theme the app is in.

const OLD_LACE = '#fff8eb'
const CHERRY = '#982649'
const INK = '#12262b'
const TAUPE = '#c38d94'
const INK_2 = 'rgba(18, 38, 43, 0.7)'
const SURFACE = '#f9ede2'
const IN_PROGRESS = 'rgba(195, 141, 148, 0.38)'

const W = 1080
const H = 1350
const PAD = 84
const FONT = '"Plus Jakarta Sans", system-ui, sans-serif'

export interface ShareCardData {
  kindLabel: string
  name: string
  doneCount: number
  /** Required courses the student is taking now: not done, but no longer to plan. */
  inProgressCount: number
  totalRequired: number
  /** Still to take once the in-progress courses are passed. */
  remaining: number
  /** The roadmap: what's left, plus the in-progress courses (reason `registered`) in their terms. */
  plan: PlannedTerm[]
  /** The term the last planned course is in, or null when nothing's left to plan. */
  finish: string | null
  /** The first course the plan schedules, already formatted ("CMPT 371"). */
  nextCourse?: string
  /** The public link printed at the foot. */
  site: string
  /** The wordmark's SVG markup (it draws in currentColor), from the rendered <Wordmark>. */
  wordmarkSvg?: string
}

function wrap(ctx: CanvasRenderingContext2D, text: string, maxWidth: number): string[] {
  const words = text.split(/\s+/)
  const lines: string[] = []
  let line = ''
  for (const word of words) {
    const next = line ? `${line} ${word}` : word
    if (ctx.measureText(next).width > maxWidth && line) {
      lines.push(line)
      line = word
    } else line = next
  }
  if (line) lines.push(line)
  return lines
}

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath()
  ctx.roundRect(x, y, w, h, r)
}

function loadSvg(svg: string, color: string): Promise<HTMLImageElement | null> {
  const markup = svg.replace(/currentColor/g, color).replace('<svg', '<svg xmlns="http://www.w3.org/2000/svg"')
  return new Promise((resolve) => {
    const img = new Image()
    img.onload = () => resolve(img)
    img.onerror = () => resolve(null)
    img.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(markup)}`
  })
}

export async function drawShareCard(data: ShareCardData): Promise<HTMLCanvasElement> {
  await Promise.all([document.fonts.load(`700 64px ${FONT}`), document.fonts.load(`600 32px ${FONT}`)]).catch(() => {})
  const canvas = document.createElement('canvas')
  canvas.width = W
  canvas.height = H
  const ctx = canvas.getContext('2d')!
  ctx.textBaseline = 'alphabetic'

  ctx.fillStyle = OLD_LACE
  ctx.fillRect(0, 0, W, H)

  // ── the headline block, in Cherry Rose. Its height follows the name, which can run to three lines.
  const cx = W - PAD - 110
  const cy = 330
  const r = 110
  const textW = cx - r - 48 - PAD
  ctx.font = `700 64px ${FONT}`
  const nameLines = wrap(ctx, data.name, textW).slice(0, 3)
  const countY = 330 + nameLines.length * 74 + 24
  // One status per line, so a long term name ("Spring/Summer 2027") never wraps into the next.
  const statusLines =
    data.remaining === 0
      ? [data.inProgressCount > 0 ? 'Done once this term’s courses are passed.' : 'Done. It goes on the transcript.']
      : [
          `${data.doneCount} done${data.inProgressCount > 0 ? ` · ${data.inProgressCount} in progress` : ''}`,
          ...(data.finish ? [`Finished by ${data.finish}`] : []),
        ]
  const taglineY = Math.max(countY + statusLines.length * 40 + 28, cy + r + 90)
  const blockH = taglineY + 64
  ctx.fillStyle = CHERRY
  ctx.fillRect(0, 0, W, blockH)

  const mark = data.wordmarkSvg ? await loadSvg(data.wordmarkSvg, OLD_LACE) : null
  if (mark) ctx.drawImage(mark, PAD - 12, 56, (96 * 501) / 180, 96)
  else {
    ctx.fillStyle = OLD_LACE
    ctx.font = `700 52px ${FONT}`
    ctx.fillText('StudyMax', PAD, 124)
  }

  // Progress ring, top right.
  ctx.lineWidth = 22
  ctx.strokeStyle = 'rgba(255, 248, 235, 0.25)'
  ctx.beginPath()
  ctx.arc(cx, cy, r, 0, Math.PI * 2)
  ctx.stroke()
  const fraction = data.totalRequired > 0 ? Math.min(1, (data.totalRequired - data.remaining) / data.totalRequired) : 1
  ctx.strokeStyle = OLD_LACE
  ctx.lineCap = 'round'
  ctx.beginPath()
  ctx.arc(cx, cy, r, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * fraction)
  ctx.stroke()
  ctx.fillStyle = OLD_LACE
  ctx.textAlign = 'center'
  ctx.font = `700 92px ${FONT}`
  ctx.fillText(String(data.remaining), cx, cy + 22)
  ctx.font = `600 24px ${FONT}`
  ctx.fillText(data.remaining === 0 ? 'done' : 'to go', cx, cy + 62)
  ctx.textAlign = 'left'

  // Eyebrow, name, count, tagline.
  ctx.fillStyle = 'rgba(255, 248, 235, 0.8)'
  ctx.font = `600 26px ${FONT}`
  ctx.fillText(`CLOSEST ${data.kindLabel.toUpperCase()}`, PAD, 250)
  ctx.fillStyle = OLD_LACE
  ctx.font = `700 64px ${FONT}`
  nameLines.forEach((line, i) => ctx.fillText(line, PAD, 330 + i * 74))
  ctx.font = `600 30px ${FONT}`
  ctx.fillStyle = 'rgba(255, 248, 235, 0.88)'
  statusLines.forEach((line, i) => ctx.fillText(line, PAD, countY + i * 40))
  ctx.font = `600 28px ${FONT}`
  ctx.fillStyle = 'rgba(255, 248, 235, 0.75)'
  ctx.fillText('My school never told me I was this close.', PAD, taglineY)

  // ── the plan, term by term
  let y = blockH + 96
  ctx.fillStyle = INK
  ctx.font = `700 34px ${FONT}`
  ctx.fillText(data.plan.length ? 'The plan' : 'Nothing left to plan', PAD, y)

  // A small key, right-aligned on the heading's line.
  const key: { label: string; fill: string; outline?: boolean }[] = [
    { label: 'Required', fill: CHERRY },
    { label: 'Prereq', fill: OLD_LACE, outline: true },
    { label: 'In progress', fill: IN_PROGRESS },
  ]
  ctx.font = `600 20px ${FONT}`
  let kx = W - PAD
  for (const item of [...key].reverse()) {
    const w = ctx.measureText(item.label).width
    kx -= w
    ctx.fillStyle = INK_2
    ctx.fillText(item.label, kx, y - 6)
    kx -= 28
    roundRect(ctx, kx, y - 24, 18, 18, 5)
    ctx.fillStyle = item.fill
    ctx.fill()
    if (item.outline) {
      ctx.strokeStyle = TAUPE
      ctx.lineWidth = 2
      ctx.stroke()
    }
    kx -= 24
  }
  y += 40

  // The term column is as wide as its longest label, so "Spring/Summer 2027" never runs into a pill.
  ctx.font = `600 24px ${FONT}`
  const labelW = Math.max(...data.plan.map((t) => ctx.measureText(t.label).width), 0)
  const pillsX = PAD + 28 + labelW + 28

  // As many terms as fit above the foot.
  let shown = 0
  for (const term of data.plan) {
    if (y + 114 > H - 220) break
    shown++
    y += 22
    roundRect(ctx, PAD, y, W - PAD * 2, 92, 20)
    ctx.fillStyle = SURFACE
    ctx.fill()
    ctx.fillStyle = INK_2
    ctx.font = `600 24px ${FONT}`
    ctx.fillText(term.label, PAD + 28, y + 56)
    let x = pillsX
    let hidden = 0
    for (const course of term.courses) {
      const label = course.code.replace(/([A-Z]+)(\d+)/, '$1 $2')
      const w = ctx.measureText(label).width + 32
      if (x + w > W - PAD - 20) {
        hidden++
        continue
      }
      roundRect(ctx, x, y + 24, w, 44, 12)
      const fill = course.reason === 'registered' ? IN_PROGRESS : course.reason === 'prerequisite' ? OLD_LACE : CHERRY
      ctx.fillStyle = fill
      ctx.fill()
      if (course.reason === 'prerequisite') {
        ctx.strokeStyle = TAUPE
        ctx.lineWidth = 2
        ctx.stroke()
      }
      ctx.fillStyle = course.reason === 'requirement' ? OLD_LACE : INK
      ctx.fillText(label, x + 16, y + 54)
      x += w + 12
    }
    if (hidden > 0) {
      ctx.fillStyle = INK_2
      ctx.fillText(`+${hidden}`, x + 4, y + 54)
    }
    y += 92
  }
  if (data.plan.length > shown) {
    ctx.fillStyle = INK_2
    ctx.font = `600 24px ${FONT}`
    const more = data.plan.length - shown
    ctx.fillText(`+ ${more} more term${more === 1 ? '' : 's'}`, PAD, y + 44)
  }

  // ── foot
  ctx.fillStyle = INK_2
  ctx.font = `600 26px ${FONT}`
  if (data.nextCourse) ctx.fillText(`Start with ${data.nextCourse}.`, PAD, H - 120)
  ctx.fillStyle = CHERRY
  ctx.font = `700 28px ${FONT}`
  ctx.fillText(`See what your school hides · ${data.site}`, PAD, H - 72)

  return canvas
}

export function canvasToBlob(canvas: HTMLCanvasElement): Promise<Blob | null> {
  return new Promise((resolve) => canvas.toBlob((b) => resolve(b), 'image/png'))
}

/**
 * Hands the image to the system share sheet where the platform supports sharing files; otherwise
 * downloads it. Returns what happened, so the button can say so.
 */
export async function shareOrDownload(blob: Blob, fileName: string, text: string): Promise<'shared' | 'downloaded' | 'cancelled'> {
  const file = new File([blob], fileName, { type: 'image/png' })
  if (typeof navigator.canShare === 'function' && navigator.canShare({ files: [file] })) {
    try {
      await navigator.share({ files: [file], text })
      return 'shared'
    } catch (error) {
      if ((error as Error).name === 'AbortError') return 'cancelled'
      // fall through to a download
    }
  }
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = fileName
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 10_000)
  return 'downloaded'
}

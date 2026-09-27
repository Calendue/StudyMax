// The landing page's tree, as pure geometry. The page lays its story cards out with CSS; the climb
// measures where they landed (once, and on resize) and hands the boxes here, which grows a tree to
// fit them: a tapered trunk that sways from stop to stop, a tapered branch out to each card, roots in
// the soil, a crown of branches to the blossoms, arrows from each beat up to the next, and the soft
// waves where the colour zones meet. Everything is in the stage's own pixels, top-left origin.

export interface Box {
  x: number
  y: number
  w: number
  h: number
}

/** A point the trunk passes through: `x` at height `y`. */
export interface Stop {
  x: number
  y: number
}

export interface Target {
  key: string
  beat: number
  box: Box
}

export interface ClimbInput {
  width: number
  height: number
  compact: boolean
  /** The top of the soil. */
  ground: number
  /** Where the dusk sky gives way to the page. */
  dusk: number
  /** The quiet band behind the showcase, if there is one. */
  band: { top: number; bottom: number } | null
  /** The trunk's path, bottom to top: the first at the ground, the last where it opens into the crown. */
  stops: Stop[]
  /** Cards that hang off a branch. */
  twigs: Target[]
  /** The canopy's blossoms, on branches from the top of the trunk. */
  blossoms: Target[]
  /** The story in order, bottom to top: an arrow runs from each one up to the next. */
  chain: Target[]
  /** Where each beat starts to count as grown (the top of its first card), by beat. */
  beatTops: number[]
  /** Anything else the arrows pass under (the hero's copy). */
  masks: Box[]
}

export interface Wood {
  key: string
  beat: number
  d: string
  /** Where it leaves the trunk: it grows out from here. */
  ox: number
  oy: number
}

export interface Link {
  key: string
  /** The beat it leaves from (it draws in once that beat has grown) and the one it arrives at. */
  from: number
  beat: number
  d: string
  arrow: string
  len: number
  /** The link's own box, for a glow filter that covers it and nothing else. */
  box: Box
}

export interface ClimbGeometry {
  width: number
  height: number
  compact: boolean
  trunk: string
  /** A soft highlight and a shade down the trunk, so it reads as round wood rather than a ribbon. */
  trunkLight: string
  trunkShade: string
  /** The trunk's centre line, bottom to top: the growth mask draws along it. */
  trunkLine: string
  trunkWidth: number
  /** Fraction of the trunk grown once each beat has grown. */
  grownAt: number[]
  roots: { d: string; glow: boolean }[]
  branches: Wood[]
  crown: Wood[]
  links: Link[]
  /** Sap: a signal rising up the trunk out of the roots, from the soil to the first beat. */
  sap: { d: string; len: number; box: Box }
  /** Every card's box: the links pass under them. */
  cards: Box[]
  /** Where the dusk sky meets the page. */
  dusk: number
  soil: string
  groundLine: string
  sky: string
  skyLine: string
  band: string | null
  base: Stop
  top: Stop
  /** The trunk's x at the stops, for the camera to follow. */
  stops: Stop[]
}

const r = (n: number) => Math.round(n * 10) / 10

/** Smoothstep between two stops: the trunk stands upright at each stop and leans between them. */
function trunkXAt(stops: Stop[], y: number): number {
  if (y >= stops[0].y) return stops[0].x
  for (let i = 0; i < stops.length - 1; i++) {
    const a = stops[i]
    const b = stops[i + 1]
    if (y <= a.y && y >= b.y) {
      const t = a.y === b.y ? 1 : (a.y - y) / (a.y - b.y)
      const s = t * t * (3 - 2 * t)
      return a.x + (b.x - a.x) * s
    }
  }
  return stops[stops.length - 1].x
}

/** A filled, tapered outline along a polyline, `w0` wide at its start and `w1` at its end. */
function taper(points: Stop[], w0: number, w1: number, ease = 1): string {
  const left: string[] = []
  const right: string[] = []
  const n = points.length
  for (let i = 0; i < n; i++) {
    const p = points[i]
    const a = points[Math.max(0, i - 1)]
    const b = points[Math.min(n - 1, i + 1)]
    const dx = b.x - a.x
    const dy = b.y - a.y
    const len = Math.hypot(dx, dy) || 1
    const nx = -dy / len
    const ny = dx / len
    const t = i / (n - 1)
    const w = (w1 + (w0 - w1) * Math.pow(1 - t, ease)) / 2
    left.push(`${r(p.x + nx * w)} ${r(p.y + ny * w)}`)
    right.unshift(`${r(p.x - nx * w)} ${r(p.y - ny * w)}`)
  }
  return `M ${left.join(' L ')} L ${right.join(' L ')} Z`
}

function cubic(p0: Stop, p1: Stop, p2: Stop, p3: Stop, steps = 24): Stop[] {
  const out: Stop[] = []
  for (let i = 0; i <= steps; i++) {
    const t = i / steps
    const u = 1 - t
    out.push({
      x: u * u * u * p0.x + 3 * u * u * t * p1.x + 3 * u * t * t * p2.x + t * t * t * p3.x,
      y: u * u * u * p0.y + 3 * u * u * t * p1.y + 3 * u * t * t * p2.y + t * t * t * p3.y,
    })
  }
  return out
}

/** A small almond leaf from `p`, pointing along `angle`. */
function leaf(p: Stop, angle: number, length: number, width: number): string {
  const ux = Math.cos(angle)
  const uy = Math.sin(angle)
  const tip = { x: p.x + ux * length, y: p.y + uy * length }
  const mid = { x: p.x + ux * length * 0.5, y: p.y + uy * length * 0.5 }
  const a = { x: mid.x - uy * width, y: mid.y + ux * width }
  const b = { x: mid.x + uy * width, y: mid.y - ux * width }
  return ` M ${r(p.x)} ${r(p.y)} Q ${r(a.x)} ${r(a.y)} ${r(tip.x)} ${r(tip.y)} Q ${r(b.x)} ${r(b.y)} ${r(p.x)} ${r(p.y)} Z`
}

function lengthOf(points: Stop[]): number {
  let len = 0
  for (let i = 1; i < points.length; i++) len += Math.hypot(points[i].x - points[i - 1].x, points[i].y - points[i - 1].y)
  return len
}

function boundsOf(points: Stop[], pad: number): Box {
  const xs = points.map((p) => p.x)
  const ys = points.map((p) => p.y)
  const x = Math.min(...xs) - pad
  const y = Math.min(...ys) - pad
  return { x, y, w: Math.max(...xs) + pad - x, h: Math.max(...ys) + pad - y }
}

/** A wave across the whole stage (and a little past it, for the camera's pan). */
function wave(width: number, bleed: number, f: (x: number) => number): Stop[] {
  const out: Stop[] = []
  for (let x = -bleed; x <= width + bleed; x += 12) out.push({ x, y: f(x) })
  return out
}

const line = (points: Stop[]) => `M ${points.map((p) => `${r(p.x)} ${r(p.y)}`).join(' L ')}`

export function growClimb(input: ClimbInput): ClimbGeometry {
  const { width, height, compact, ground, stops } = input
  const bleed = compact ? 40 : 160
  const baseW = compact ? 20 : 56
  const topW = compact ? 5 : 10
  const base: Stop = { x: stops[0].x, y: ground + (compact ? 16 : 30) }
  const top = stops[stops.length - 1]
  const span = Math.max(1, base.y - top.y)
  // Tapering all the way up, and flaring into the roots over the last stretch above the soil.
  const flareH = compact ? 60 : 150
  const widthAt = (y: number) => {
    const t = Math.min(1, Math.max(0, (base.y - y) / span))
    const flare = Math.max(0, 1 - (base.y - y) / flareH)
    return topW + (baseW - topW) * Math.pow(1 - t, 1.25) + flare * flare * baseW * 1.1
  }

  // ── the trunk: sampled up its height, tapered along its normals, and measured for the growth mask ──
  const samples: Stop[] = []
  for (let y = base.y; y > top.y; y -= 8) samples.push({ x: trunkXAt(stops, y), y })
  samples.push({ x: top.x, y: top.y })
  const cum: number[] = [0]
  for (let i = 1; i < samples.length; i++) cum.push(cum[i - 1] + Math.hypot(samples[i].x - samples[i - 1].x, samples[i].y - samples[i - 1].y))
  const total = cum[cum.length - 1] || 1
  const fractionAt = (y: number) => {
    const i = samples.findIndex((s) => s.y <= y)
    return i < 0 ? 1 : cum[i] / total
  }
  /** The band between two offsets across the trunk (-0.5 is its left edge, 0.5 its right). */
  const strip = (a: number, b: number) => {
    const left: string[] = []
    const right: string[] = []
    samples.forEach((p, i) => {
      const prev = samples[Math.max(0, i - 1)]
      const next = samples[Math.min(samples.length - 1, i + 1)]
      const dx = next.x - prev.x
      const dy = next.y - prev.y
      const len = Math.hypot(dx, dy) || 1
      // the normal, pointing to the trunk's right as it climbs
      const nx = -dy / len
      const ny = dx / len
      const w = widthAt(p.y)
      left.push(`${r(p.x + nx * w * a)} ${r(p.y + ny * w * a)}`)
      right.unshift(`${r(p.x + nx * w * b)} ${r(p.y + ny * w * b)}`)
    })
    return `M ${left.join(' L ')} L ${right.join(' L ')} Z`
  }
  const trunk = strip(-0.5, 0.5)
  const trunkLight = strip(-0.34, -0.1)
  const trunkShade = strip(0.2, 0.5)
  const trunkLine = line(samples)

  const sapPoints = samples.filter((p) => p.y >= (input.beatTops[1] ?? top.y) + 40)
  const sapStart = { x: base.x, y: base.y + (compact ? 30 : 70) }
  const sap = { d: line([sapStart, ...sapPoints]), len: Math.round(lengthOf([sapStart, ...sapPoints])), box: boundsOf([sapStart, ...sapPoints], 24) }

  const grownAt = input.beatTops.map((y, i) =>
    i === input.beatTops.length - 1 ? 1 : Math.min(1, fractionAt(y - (compact ? 40 : 90))),
  )

  // ── a branch out to each card: it leaves the trunk a little below the card and rises to its near edge ──
  const branches: Wood[] = input.twigs.map((t, n) => {
    const cy = t.box.y + Math.min(t.box.h / 2, compact ? 34 : Math.max(56, t.box.h * 0.36))
    const tx = trunkXAt(stops, cy)
    const dir = t.box.x + t.box.w / 2 < tx ? -1 : 1
    const ex = dir < 0 ? t.box.x + t.box.w - 4 : t.box.x + 4
    const gap = Math.abs(ex - tx)
    const drop = Math.min(compact ? 30 : 120, gap * 0.55)
    const oy = cy + drop
    const ox = trunkXAt(stops, oy)
    const points = cubic({ x: ox, y: oy }, { x: ox + dir * gap * 0.3, y: oy - 2 }, { x: ex - dir * gap * 0.5, y: cy + 2 }, { x: ex, y: cy })
    const w0 = Math.max(compact ? 3 : 6, widthAt(oy) * (compact ? 0.45 : 0.4))
    // A few leaves along the branch, alternating sides.
    const leaves = (compact ? [0.62] : [0.42, 0.7]).map((f, k) => {
      const i = Math.round(f * (points.length - 1))
      const p = points[i]
      const q = points[Math.min(points.length - 1, i + 1)]
      const along = Math.atan2(q.y - p.y, q.x - p.x)
      const side = (k + n) % 2 === 0 ? -1 : 1
      return leaf(p, along + side * 0.75, compact ? 10 : 17, compact ? 4 : 6.5)
    })
    return { key: t.key, beat: t.beat, d: taper(points, w0, compact ? 1.6 : 2.2, 0.8) + leaves.join(''), ox: r(ox), oy: r(oy) }
  })

  // ── the crown: a branch from the top of the trunk up to each blossom ──
  const crown: Wood[] = input.blossoms.map((b) => {
    const ex = b.box.x + b.box.w / 2
    const ey = b.box.y + b.box.h - 6
    const rise = Math.max(20, top.y - ey)
    const points = cubic(top, { x: top.x, y: top.y - rise * 0.55 }, { x: ex, y: ey + rise * 0.5 }, { x: ex, y: ey })
    return { key: b.key, beat: b.beat, d: taper(points, topW * 0.9, compact ? 1.6 : 2.4, 0.9), ox: r(top.x), oy: r(top.y) }
  })

  // ── the roots: spreading through the soil, the long ones reaching across the stage ──
  const depth = height - ground
  const roots = (compact ? [-1.6, -0.9, -0.35, 0.3, 0.8] : [-2.4, -1.5, -0.8, -0.3, 0.25, 0.7, 1.2]).map((k, i) => {
    const reach = compact ? width * 0.55 : width * 0.3
    const ex = base.x + k * reach
    const ey = ground + depth * (0.35 + 0.5 * (1 - Math.min(1, Math.abs(k) / 2.6)) * (i % 2 ? 0.8 : 1))
    const start = { x: base.x + k * (compact ? 3 : 9), y: ground + 6 }
    const points = cubic(start, { x: start.x + k * 12, y: ground + depth * 0.4 }, { x: ex - k * reach * 0.25, y: ey - 12 }, { x: ex, y: ey }, 30)
    const w0 = (compact ? 7 : 22) * (1 - Math.min(0.6, Math.abs(k) * 0.18))
    return { d: taper(points, w0, 1.2, 0.7), glow: Math.abs(k) < 1.3 }
  })

  // ── an arrow from each beat up to the next, top edge to bottom edge, landing on an arrowhead ──
  const links: Link[] = []
  for (let i = 1; i < input.chain.length; i++) {
    const a = input.chain[i - 1].box
    const b = input.chain[i].box
    const acx = a.x + a.w / 2
    const bcx = b.x + b.w / 2
    const ax = a.w > 200 ? acx + Math.sign(bcx - acx) * a.w * 0.2 : acx
    const bx = b.w > 200 ? bcx + Math.sign(acx - bcx) * b.w * 0.2 : bcx
    const ay = a.y - 2
    const by = b.y + b.h + 2
    if (ay - by < 24) continue
    const k = Math.max(30, (ay - by) * 0.5)
    const end = { x: bx, y: by + 9 }
    const points = cubic({ x: ax, y: ay }, { x: ax, y: ay - k }, { x: bx, y: end.y + k }, end, 32)
    links.push({
      key: `${input.chain[i - 1].key}-${input.chain[i].key}`,
      from: input.chain[i - 1].beat,
      beat: input.chain[i].beat,
      d: `M ${r(ax)} ${r(ay)} C ${r(ax)} ${r(ay - k)}, ${r(bx)} ${r(end.y + k)}, ${r(bx)} ${r(end.y)}`,
      arrow: `M ${r(bx - 5.5)} ${r(by + 11)} L ${r(bx)} ${r(by + 1)} L ${r(bx + 5.5)} ${r(by + 11)} Z`,
      len: Math.round(lengthOf(points)),
      box: boundsOf(points, 24),
    })
  }

  // ── the colour zones meet in waves: a mound where the trunk leaves the soil, a soft swell under the sky ──
  const moundW = compact ? 70 : 260
  const groundWave = wave(width, bleed, (x) => {
    const m = Math.exp(-(((x - base.x) / moundW) ** 2))
    return ground + (compact ? 6 : 12) * Math.sin((x / width) * Math.PI * 2.2 + 0.8) - (compact ? 12 : 30) * m
  })
  const soil = `${line(groundWave)} L ${width + bleed} ${height} L ${-bleed} ${height} Z`
  const skyWave = wave(width, bleed, (x) => input.dusk + (compact ? 12 : 26) * Math.sin((x / width) * Math.PI * 1.7 + 2.2) + (compact ? 5 : 10) * Math.sin((x / width) * Math.PI * 4.1))
  const sky = `M ${-bleed} 0 L ${width + bleed} 0 L ${[...skyWave].reverse().map((p) => `${r(p.x)} ${r(p.y)}`).join(' L ')} Z`

  let band: string | null = null
  if (input.band) {
    const { top: bt, bottom: bb } = input.band
    const upper = wave(width, bleed, (x) => bt + (compact ? 10 : 22) * Math.sin((x / width) * Math.PI * 1.5 + 0.4))
    const lower = wave(width, bleed, (x) => bb + (compact ? 10 : 22) * Math.sin((x / width) * Math.PI * 1.3 + 2.6))
    band = `${line(upper)} L ${[...lower].reverse().map((p) => `${r(p.x)} ${r(p.y)}`).join(' L ')} Z`
  }

  return {
    width,
    height,
    compact,
    trunk,
    trunkLight,
    trunkShade,
    trunkLine,
    trunkWidth: baseW,
    grownAt,
    roots,
    branches,
    crown,
    links,
    sap,
    cards: [...[...input.twigs, ...input.chain, ...input.blossoms].map((t) => t.box), ...input.masks],
    dusk: input.dusk,
    soil,
    groundLine: line(groundWave),
    sky,
    skyLine: line(skyWave),
    band,
    base,
    top,
    stops,
  }
}

// Max's face: the owl mascot in one of four poses (public/max/owl-*.png, transparent 256px). Every
// place Max shows up uses this, so he looks and moves the same everywhere. Decorative next to text
// that already says what he's doing, so it's hidden from screen readers unless given a label.
import type { OwlPose } from './owlPose.ts'
import './maxOwl.css'

const POSES: OwlPose[] = ['idle', 'thinking', 'talking', 'celebrating']

const src = (pose: OwlPose) => `${import.meta.env.BASE_URL}max/owl-${pose}.png`

export function MaxOwl({ pose = 'idle', size = 48, label, className }: { pose?: OwlPose; size?: number; label?: string; className?: string }) {
  return (
    <span className={`max-owl max-owl--${pose}${className ? ` ${className}` : ''}`} style={{ width: size, height: size }}>
      {/* All four stay loaded, so a pose change is an instant swap, never a flash of nothing. */}
      {POSES.map((p) => (
        <img
          key={p}
          src={src(p)}
          alt={p === pose && label ? label : ''}
          aria-hidden={p === pose && label ? undefined : true}
          className={p === pose ? 'is-shown' : undefined}
          width={size}
          height={size}
          draggable={false}
          decoding="async"
        />
      ))}
    </span>
  )
}

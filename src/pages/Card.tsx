import type { ReactNode } from 'react'
import { Icon, type IconName } from '../ui/Icon.tsx'
import { Appear, CountUp } from '../ui/primitives.tsx'

// The desktop's building block, from TandemTeach: a rounded card on the page ground with a hairline
// and a soft shadow, lifting a little under the pointer. Inside it, the tonal surfaces step up a tone
// (tokens.css: --card-surface), so a Group still reads as a group.

export function Card({
  title,
  icon,
  action,
  index = 0,
  className,
  id,
  children,
}: {
  title?: ReactNode
  icon?: IconName
  action?: ReactNode
  index?: number
  className?: string
  id?: string
  children: ReactNode
}) {
  return (
    <Appear index={index} className={`card${className ? ` ${className}` : ''}`} id={id}>
      {(title || action) && (
        <div className="card__head">
          {title && (
            <h2 className="card__title">
              {icon && (
                <span className="card__icon">
                  <Icon name={icon} size={16} />
                </span>
              )}
              {title}
            </h2>
          )}
          {action}
        </div>
      )}
      {children}
    </Appear>
  )
}

/** A quiet text link in a card's head: "View all". */
export function CardLink({ children, onClick }: { children: ReactNode; onClick: () => void }) {
  return (
    <button type="button" className="card__link" onClick={onClick}>
      {children}
      <Icon name="arrow" size={14} />
    </button>
  )
}

/** One figure that counts up on first view, with what it measures under it. */
export function StatCard({
  icon,
  label,
  value,
  unit,
  sub,
  index,
  onClick,
  invite,
}: {
  icon: IconName
  label: string
  value: number | null
  unit?: string
  sub: ReactNode
  index: number
  onClick?: () => void
  /** Shown instead of an empty figure: an invitation to do the thing the figure counts. */
  invite?: string
}) {
  const body = (
    <>
      <span className="stat__icon">
        <Icon name={icon} size={20} />
      </span>
      <span className="stat__text">
        <span className="stat__label">{label}</span>
        {invite ? (
          <span className="stat__invite">
            {invite}
            <Icon name="arrow" size={16} />
          </span>
        ) : (
          <span className="stat__value">
            {value === null ? '–' : <CountUp value={value} duration={0.9} delay={0.15 + index * 0.06} />}
            {unit && <span className="stat__unit">{unit}</span>}
          </span>
        )}
        <span className="stat__sub">{sub}</span>
      </span>
    </>
  )
  return (
    <Appear index={index} className="card stat">
      {onClick ? (
        <button type="button" className="stat__body" onClick={onClick}>
          {body}
        </button>
      ) : (
        <div className="stat__body">{body}</div>
      )}
    </Appear>
  )
}

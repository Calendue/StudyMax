// Editing onboarding's answers after the reveal, from Settings (AccountSheet.tsx). Each field gets
// its own small sheet rather than a new screen — same list UI as the matching onboarding step
// (Onboarding.tsx's MajorScreen/MinorScreen/ConcentrationScreen/GraduationScreen), wired to
// updateMajor/updateMinor/toggleConcentration/updateGradYear instead of the onboarding handlers, so
// picking a value here never advances a flow that doesn't exist on this screen.
import { useModel } from '../model.ts'
import { Icon } from '../ui/Icon.tsx'
import { Button, Group, Row } from '../ui/primitives.tsx'
import { Sheet } from '../ui/Sheet.tsx'

const check = <Icon name="check" size={20} className="row__check" />

export function EditMajorSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const m = useModel()
  return (
    <Sheet open={open} onClose={onClose} title="Change your major" tall>
      <div className="field field--search">
        <Icon name="search" size={20} />
        <input
          type="search"
          enterKeyHint="search"
          value={m.programPickQuery}
          onChange={(e) => m.setProgramPickQuery(e.target.value)}
          placeholder="Computer science, psychology, PHYS…"
          aria-label="Search programs"
          autoComplete="off"
        />
      </div>
      {m.programResults.length === 0 ? (
        <p className="empty">No Arts &amp; Science program matches &ldquo;{m.programPickQuery}&rdquo;.</p>
      ) : (
        <Group>
          {m.programResults.map((option, i) => (
            <Row
              key={option.id}
              index={i}
              title={option.name}
              subtitle={option.hasData ? 'Full plan' : 'Awards only'}
              selected={option.id === m.programId}
              trailing={option.id === m.programId ? check : null}
              onClick={() => {
                m.updateMajor(option.id)
                onClose()
              }}
            />
          ))}
        </Group>
      )}
    </Sheet>
  )
}

export function EditMinorSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const m = useModel()
  return (
    <Sheet open={open} onClose={onClose} title="Change your minor">
      <Group>
        <Row
          index={0}
          title="No minor, or not sure yet"
          selected={m.minorId === null}
          trailing={m.minorId === null ? check : null}
          onClick={() => {
            m.updateMinor(null)
            onClose()
          }}
        />
        {m.minorOptions.map((minor, i) => (
          <Row
            key={minor.id}
            index={i + 1}
            title={minor.name}
            selected={m.minorId === minor.id}
            trailing={m.minorId === minor.id ? check : null}
            onClick={() => {
              m.updateMinor(minor.id)
              onClose()
            }}
          />
        ))}
      </Group>
    </Sheet>
  )
}

export function EditConcentrationsSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const m = useModel()
  const count = m.concentrationIds.length
  return (
    <Sheet
      open={open}
      onClose={onClose}
      title="Change your specializations"
      tall
      footer={
        <Button block onClick={onClose}>
          Done
        </Button>
      }
    >
      <p className="footnote">{count === 0 ? 'None picked yet.' : count === 1 ? 'One target picked.' : `${count} targets picked.`}</p>
      <Group>
        {m.concentrationOptions.map((spec, i) => {
          const on = m.concentrationIds.includes(spec.id)
          return (
            <Row
              key={spec.id}
              index={i}
              title={spec.name}
              selected={on}
              trailing={<Icon name={on ? 'check' : 'plus'} size={20} className={on ? 'row__check' : 'row__add'} />}
              onClick={() => m.toggleConcentration(spec.id)}
            />
          )
        })}
      </Group>
    </Sheet>
  )
}

export function EditGradYearSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const m = useModel()
  const thisYear = m.today.getFullYear()
  const years = Array.from({ length: 7 }, (_, i) => thisYear + i)
  return (
    <Sheet open={open} onClose={onClose} title="Expected year of graduation">
      <Group>
        {years.map((year, i) => (
          <Row
            key={year}
            index={i}
            title={String(year)}
            selected={m.gradYear === year}
            trailing={m.gradYear === year ? check : null}
            onClick={() => {
              m.updateGradYear(year)
              onClose()
            }}
          />
        ))}
      </Group>
    </Sheet>
  )
}

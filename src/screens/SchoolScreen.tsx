import { useModel } from '../model.ts'
import { ActionBar, ScreenBody, ScreenTitle, TopBar } from '../ui/chrome.tsx'
import { Icon } from '../ui/Icon.tsx'
import { Appear, Button, Group, Row, RowIcon, SectionLabel } from '../ui/primitives.tsx'
import { Sheet } from '../ui/Sheet.tsx'

export function SchoolScreen() {
  const m = useModel()
  const check = <Icon name="check" size={20} className="row__check" />

  return (
    <>
      <TopBar brand />
      <ScreenBody>
        <ScreenTitle lead="StudyMax finds the specializations, certificates and awards your school spreads across dozens of pages, and shows you which ones you're closest to.">
          Where do you study?
        </ScreenTitle>

        <Appear index={1}>
          <SectionLabel>University</SectionLabel>
        </Appear>
        <Group>
          <Row
            index={1}
            leading={<RowIcon name="school" />}
            title="University of Saskatchewan"
            subtitle="Full plans for Computer Science, Applied Mathematics, Physics and Applied Computing"
            selected={m.universityId === 'usask'}
            trailing={m.universityId === 'usask' ? check : null}
            onClick={() => m.handleUniversityChange('usask')}
          />
          <Row
            index={2}
            leading={<RowIcon name="globe" />}
            title="Another university"
            subtitle="Scholarship direction for any school"
            selected={m.universityId === 'other'}
            trailing={m.universityId === 'other' ? check : null}
            onClick={() => m.handleUniversityChange('other')}
          />
        </Group>

        {m.universityId === 'usask' && (
          <>
            <Appear index={0}>
              <SectionLabel>Program</SectionLabel>
            </Appear>
            <Group>
              <Row
                index={0}
                title={
                  m.selectedProgram ? m.selectedProgram.name : <span className="placeholder">Choose your program</span>
                }
                subtitle={
                  m.selectedProgram
                    ? m.hasProgramData
                      ? 'Full plan: specializations, certificates, a term-by-term path and awards'
                      : 'Awards and scholarships. Requirement data for this program is still to come.'
                    : 'Any Arts & Science program'
                }
                onClick={() => {
                  m.setProgramPickQuery('')
                  m.openSheet('program')
                }}
              />
            </Group>
          </>
        )}

        <Appear index={3} className="demo-link">
          <p>Just looking around?</p>
          <button type="button" className="inline-link" onClick={m.loadSampleStudent}>
            Load a sample student
          </button>
        </Appear>
      </ScreenBody>

      <ActionBar>
        <Button block disabled={!m.selectedProgram} onClick={m.continueFromSchool}>
          Continue
        </Button>
      </ActionBar>

      <Sheet open={m.sheet === 'program'} onClose={() => m.setSheet(null)} title="Your program" tall>
        <div className="field field--search">
          <Icon name="search" size={20} />
          <input
            type="search"
            enterKeyHint="search"
            value={m.programPickQuery}
            onChange={(e) => m.setProgramPickQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && m.programResults.length > 0) {
                e.preventDefault()
                m.handleProgramChange(m.programResults[0].id)
              }
            }}
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
                onClick={() => m.handleProgramChange(option.id)}
              />
            ))}
          </Group>
        )}
      </Sheet>
    </>
  )
}

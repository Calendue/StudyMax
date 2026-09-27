import { useModel } from '../model.ts'
import { Icon } from '../ui/Icon.tsx'
import { ClassFinder, OpeningAlert, Watching } from '../screens/ClassesTab.tsx'
import { Card } from './Card.tsx'

// The desktop's Classes: finding a section on one side, what's being watched on the other, and an
// opening, when one comes, across the top.
export function ClassesPage() {
  const c = useModel().classes
  return (
    <div className="page classes-page">
      {c.alert && <OpeningAlert watch={c.alert} onDismiss={c.dismissAlert} />}
      <div className="classes-page__grid">
        <Card index={0} title="Find a section" icon="search" className="classes-page__finder">
          <p className="lead">
            Watch a full section and StudyMax tells you the moment a seat opens, live from USask&rsquo;s class search.
            Registering still happens in PAWS.
          </p>
          <ClassFinder />
        </Card>
        <Card index={1} className="classes-page__watching">
          {c.watches.length > 0 ? (
            <Watching />
          ) : (
            <>
              <h2 className="card__title">
                <span className="card__icon">
                  <Icon name="seat" size={16} />
                </span>
                Watching
              </h2>
              <p className="card__empty">
                <Icon name="seat" size={20} />
                Nothing yet. Search a course, then Watch a full section to hear the moment a seat opens.
              </p>
            </>
          )}
        </Card>
      </div>
    </div>
  )
}

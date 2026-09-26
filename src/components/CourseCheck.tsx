export function CourseCheck({ label, checked, onToggle }: { label: string; checked: boolean; onToggle: () => void }) {
  return (
    <li>
      <label className="check">
        <input type="checkbox" checked={checked} onChange={onToggle} />
        <span className="check__box" aria-hidden />
        <span className="check__label">{label}</span>
      </label>
    </li>
  )
}

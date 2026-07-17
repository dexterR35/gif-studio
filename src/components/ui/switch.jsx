import { cn } from '../../lib/cn'

/** Shared toggle — styles live in `.gs-switch*` (index.css). */
export function Switch({ checked, onChange, label, className }) {
  return (
    <label className={cn('gs-switch', className)}>
      {label && <span className="min-w-0 leading-tight">{label}</span>}
      <span className="gs-switch-control">
        <input
          type="checkbox"
          checked={checked}
          onChange={(e) => onChange(e.target.checked)}
        />
        <span className="gs-switch-track" />
        <span className="gs-switch-thumb" />
      </span>
    </label>
  )
}

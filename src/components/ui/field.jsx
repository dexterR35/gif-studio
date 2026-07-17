import { cn } from '../../lib/cn'
import { clampNice, decimalsFromStep, nice } from '../../lib/format'
import { Label } from './label'

/** Shared number field — styles live in `.gs-input-shell` / `.gs-input` (index.css). */
export function Field({ label, value, onChange, suffix, min, max, step = 1, className }) {
  const decimals = decimalsFromStep(step)
  const display = nice(value, decimals)
  return (
    <label className={cn('block', className)}>
      {label && <Label>{label}</Label>}
      <div className="gs-input-shell">
        <input
          type="number"
          value={display}
          min={min}
          max={max}
          step={step}
          onChange={(e) => onChange(clampNice(e.target.value, min ?? -9999, max ?? 9999, decimals))}
          className="gs-input"
        />
        {suffix && <span className="gs-suffix">{suffix}</span>}
      </div>
    </label>
  )
}

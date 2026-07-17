import { cn } from '../../lib/cn'
import { clampNice, decimalsFromStep, nice } from '../../lib/format'
import { InfoTip } from './info-tip'

/** Shared range — styles live in `.gs-range` (index.css). */
export function Slider({ label, info, value, onChange, min = 0, max = 100, step = 1, suffix = '', className }) {
  const decimals = decimalsFromStep(step)
  const display = nice(value, decimals)
  return (
    <div className={cn(className)}>
      {label && (
        <label className="gs-label mb-1.5 flex items-center justify-between tracking-wider">
          <span className="flex items-center gap-1.5">
            {label}
            {info && <InfoTip side="bottom">{info}</InfoTip>}
          </span>
          <b className="text-[12px] font-semibold normal-case tracking-normal text-zinc-300">{display}{suffix}</b>
        </label>
      )}
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={display}
        onChange={(e) => onChange(clampNice(e.target.value, min, max, decimals))}
        className="gs-range mt-1"
      />
    </div>
  )
}

export function RangeEnds({ left, right, className }) {
  return (
    <div className={cn('flex justify-between text-[9px] font-semibold uppercase tracking-wider text-zinc-600', className)}>
      <span>{left}</span>
      <span>{right}</span>
    </div>
  )
}

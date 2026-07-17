import { cn } from '../../lib/cn'
import { InfoTip } from './info-tip'

/** Dual start/end ranges — uses shared `.gs-range`. */
export function DualRange({
  label,
  start,
  end,
  onStart,
  onEnd,
  min = 0,
  max = 100,
  step = 1,
  suffix = '',
  info,
  className,
}) {
  return (
    <div className={cn('border-t border-white/[.05] py-2', className)}>
      <div className="mb-1.5 flex items-center justify-between gap-2">
        <span className="gs-label mb-0 flex items-center gap-1.5">
          {label}
          {info && <InfoTip>{info}</InfoTip>}
        </span>
        <span className="font-mono text-[10px] text-zinc-500">
          <b className="text-zinc-300">{start}{suffix}</b>
          <span className="mx-1 text-zinc-700">→</span>
          <b className="text-zinc-300">{end}{suffix}</b>
        </span>
      </div>
      <div className="space-y-1.5">
        <label className="flex items-center gap-2">
          <span className="w-6 shrink-0 text-[9px] font-bold uppercase tracking-wider text-zinc-600">In</span>
          <input
            aria-label={`${label} start`}
            type="range"
            min={min}
            max={max}
            step={step}
            value={start}
            onChange={(e) => onStart(Number(e.target.value))}
            className="gs-range"
          />
        </label>
        <label className="flex items-center gap-2">
          <span className="w-6 shrink-0 text-[9px] font-bold uppercase tracking-wider text-zinc-600">Out</span>
          <input
            aria-label={`${label} end`}
            type="range"
            min={min}
            max={max}
            step={step}
            value={end}
            onChange={(e) => onEnd(Number(e.target.value))}
            className="gs-range"
          />
        </label>
      </div>
    </div>
  )
}

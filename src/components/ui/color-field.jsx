import { cn } from '../../lib/cn'
import { Label } from './label'

export function ColorField({ label, value, onChange, disabled = false, showHex = true, className }) {
  return (
    <label className={cn('flex items-center justify-between text-[12px] text-zinc-500', className)}>
      <span>{label}</span>
      <span className="flex items-center gap-2">
        <input
          type="color"
          value={value}
          disabled={disabled}
          onChange={(e) => onChange(e.target.value)}
          className="h-7 w-9 cursor-pointer rounded-md border-0 bg-transparent disabled:cursor-not-allowed disabled:opacity-40"
        />
        {showHex && <span className="font-mono text-[10px] text-zinc-400">{value}</span>}
      </span>
    </label>
  )
}

export function ColorSwatchRow({ label, value, onChange, presets = [], className }) {
  return (
    <div className={cn(className)}>
      {label && <Label>{label}</Label>}
      <div className="gs-chip-row">
        {presets.map(([name, hex]) => (
          <button
            key={name}
            type="button"
            onClick={() => onChange(hex)}
            className={cn('gs-chip flex-1', value === hex && 'is-active')}
          >
            {name}
          </button>
        ))}
        <input
          type="color"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="h-7 w-full min-w-[2.5rem] flex-1 bg-transparent"
        />
      </div>
    </div>
  )
}

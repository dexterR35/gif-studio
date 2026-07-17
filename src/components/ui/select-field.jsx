import { ChevronDown } from 'lucide-react'
import { cn } from '../../lib/cn'
import { InfoTip } from './info-tip'
import { Label } from './label'

/** Shared dropdown — styles live in `.gs-select` (index.css). */
export function SelectField({ label, info, value, onChange, children, icon: Icon, className }) {
  return (
    <label className={cn('block', className)}>
      {label && (
        <Label className="flex items-center gap-1.5">
          {label}
          {info && <InfoTip side="bottom">{info}</InfoTip>}
        </Label>
      )}
      <div className="gs-select-wrap">
        <select
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className={cn('gs-select focus-ring', Icon && 'has-icon')}
        >
          {children}
        </select>
        {Icon && <Icon className="gs-select-icon" aria-hidden />}
        <ChevronDown className="gs-select-chevron" aria-hidden />
      </div>
    </label>
  )
}

import { cn } from '../../lib/cn'

/** Segmented chip toggles — styles live in `.gs-chip` (index.css). */
export function ToggleGroup({ value, onChange, options, className }) {
  const stretch = options.length >= 2 && options.length <= 3
  return (
    <div className={cn('gs-chip-row', stretch && 'stretch', className)}>
      {options.map((option) => {
        const id = typeof option === 'string' ? option : option.value
        const label = typeof option === 'string' ? option : option.label
        const Icon = typeof option === 'object' ? option.icon : null
        const active = value === id
        return (
          <button
            key={id}
            type="button"
            onClick={() => onChange(id)}
            className={cn('gs-chip', active && 'is-active')}
          >
            {Icon ? <Icon className="h-3.5 w-3.5" /> : label}
          </button>
        )
      })}
    </div>
  )
}

export function WorkspaceTabs({ tabs, value, onChange, className }) {
  return (
    <div className={cn('flex w-full max-w-3xl items-center gap-1 rounded-xl border border-white/[.06] bg-black/20 p-0.5', className)}>
      {tabs.map(({ id, icon: Icon, label }) => (
        <button
          key={id}
          type="button"
          onClick={() => onChange(id)}
          className={cn(
            'flex h-8 min-w-0 flex-1 items-center justify-center gap-1.5 rounded-lg px-1 text-[8px] font-bold uppercase tracking-normal transition sm:px-2 sm:text-[10px] sm:tracking-[.08em]',
            value === id
              ? 'bg-acid text-black shadow-tab'
              : 'text-zinc-500 hover:bg-white/[.05] hover:text-white',
          )}
        >
          {Icon && <Icon className="hidden h-3.5 w-3.5 shrink-0 sm:block" />}
          <span>{label ?? id}</span>
        </button>
      ))}
    </div>
  )
}

import { CircleHelp } from 'lucide-react'
import { cn } from '../../lib/cn'

export function InfoTip({ children, className, side = 'bottom' }) {
  const sideClass =
    side === 'left'
      ? 'right-full top-1/2 mr-2 -translate-y-1/2'
      : side === 'right'
        ? 'left-full top-1/2 ml-2 -translate-y-1/2'
        : side === 'top'
          ? 'bottom-full left-1/2 mb-2 -translate-x-1/2'
          : 'top-full left-1/2 mt-2 -translate-x-1/2'

  return (
    <span className={cn('relative inline-flex', className)}>
      <button
        type="button"
        aria-label="More info"
        onClick={(e) => e.stopPropagation()}
        className="peer focus-ring grid h-4 w-4 shrink-0 place-items-center rounded-full text-zinc-600 transition hover:text-zinc-300"
      >
        <CircleHelp className="h-3.5 w-3.5" />
      </button>
      <span
        role="tooltip"
        className={cn(
          'pointer-events-none absolute z-50 w-56 rounded-lg border border-white/10 bg-zinc-950 px-2.5 py-2 text-left text-[10px] font-medium normal-case leading-relaxed tracking-normal text-zinc-400 opacity-0 shadow-xl transition peer-hover:opacity-100 peer-focus-visible:opacity-100',
          sideClass,
        )}
      >
        {children}
      </span>
    </span>
  )
}

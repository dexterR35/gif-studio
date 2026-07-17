import { cn } from '../../lib/cn'
import { statusTone } from '../../lib/colors'

export function Badge({ children, className }) {
  return (
    <span
      className={cn(
        'rounded-full border border-white/10 px-2 py-0.5 text-[9px] font-bold tracking-widest text-zinc-500',
        className,
      )}
    >
      {children}
    </span>
  )
}

export function StatusBadge({ tone = 'neutral', children, className }) {
  const styles = statusTone[tone] || statusTone.neutral
  return (
    <div className={cn('flex items-center gap-2 rounded-lg px-2.5 py-2 text-[10px] font-semibold', styles.wrap, className)}>
      <span className={cn('h-1.5 w-1.5 rounded-full', styles.dot)} />
      {children}
    </div>
  )
}

export function Dot({ active = false, className }) {
  return <span className={cn('h-2 w-2 rounded-full', active ? 'bg-acid' : 'bg-zinc-700', className)} />
}

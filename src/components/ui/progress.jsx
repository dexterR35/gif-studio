import { cn } from '../../lib/cn'

export function Progress({ value = 0, className }) {
  const pct = Math.max(0, Math.min(100, value))
  return (
    <div className={cn('h-1.5 overflow-hidden rounded-full bg-black/40', className)}>
      <div className="h-full rounded-full bg-acid transition-all" style={{ width: `${Math.max(3, pct)}%` }} />
    </div>
  )
}

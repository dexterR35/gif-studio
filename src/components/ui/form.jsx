import { cn } from '../../lib/cn'

export function FormGrid({ cols = 2, gap = 2, className, children }) {
  return (
    <div
      className={cn(
        cols === 2 && 'grid grid-cols-2',
        cols === 3 && 'grid grid-cols-3',
        gap === 2 && 'gap-2',
        gap === 3 && 'gap-3',
        className,
      )}
    >
      {children}
    </div>
  )
}

import { cn } from '../../lib/cn'

export function StageHint({ children, className }) {
  return (
    <div
      className={cn(
        'pointer-events-none absolute left-1/2 top-4 -translate-x-1/2 rounded-lg bg-black/75 px-3 py-2 text-[10px] font-semibold text-white shadow-xl',
        className,
      )}
    >
      {children}
    </div>
  )
}

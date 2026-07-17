import { cn } from '../../lib/cn'

export function IconButton({ label, children, className, disabled = false, ...props }) {
  return (
    <button
      title={label}
      aria-label={label}
      disabled={disabled}
      className={cn('gs-chip focus-ring !h-7 !w-7 !px-0 disabled:opacity-30', className)}
      {...props}
    >
      {children}
    </button>
  )
}

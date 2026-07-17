import { cn } from '../../lib/cn'

const variants = {
  primary: 'gs-btn-primary',
  ghost: '',
  accent: 'gs-btn-accent',
  danger: 'gs-btn-danger',
  solid: 'gs-btn-solid',
  soft: '',
}

const sizes = {
  sm: '',
  md: '',
  lg: 'gs-btn-lg',
  xl: 'gs-btn-xl',
}

/** Shared button — styles live in `.gs-btn*` (index.css). */
export function Button({
  variant = 'ghost',
  size = 'md',
  full = false,
  className,
  children,
  type = 'button',
  ...props
}) {
  return (
    <button
      type={type}
      className={cn(
        'gs-btn focus-ring',
        variants[variant],
        sizes[size],
        full && 'gs-btn-full',
        className,
      )}
      {...props}
    >
      {children}
    </button>
  )
}

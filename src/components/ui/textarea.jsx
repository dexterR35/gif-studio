import { cn } from '../../lib/cn'

export function Textarea({ className, ...props }) {
  return <textarea className={cn('gs-textarea', className)} {...props} />
}

import { cn } from '../../lib/cn'

export function Label({ children, className, as: Tag = 'span' }) {
  return (
    <Tag className={cn('gs-label', className)}>
      {children}
    </Tag>
  )
}

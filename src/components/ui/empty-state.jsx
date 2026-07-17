import { cn } from '../../lib/cn'

export function EmptyState({ icon: Icon, children, className }) {
  return (
    <div className={cn('rounded-xl border border-dashed border-white/10 px-4 py-6 text-center', className)}>
      {Icon && <Icon className="mx-auto h-5 w-5 text-zinc-700" />}
      <p className="mt-2 text-[11px] text-zinc-600">{children}</p>
    </div>
  )
}

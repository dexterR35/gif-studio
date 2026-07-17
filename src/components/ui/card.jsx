import { cn } from '../../lib/cn'
import { Eye, EyeOff, Lock, Trash2, Unlock } from 'lucide-react'

export function Card({ children, selected = false, interactive = false, className, as: Tag = 'div', ...props }) {
  return (
    <Tag
      className={cn(
        'rounded-[10px] border p-2 transition',
        selected
          ? 'border-acid/40 bg-acid/[.06]'
          : 'border-white/[.06] bg-surface',
        interactive && !selected && 'hover:border-white/15 hover:bg-control',
        interactive && 'w-full text-left',
        className,
      )}
      {...props}
    >
      {children}
    </Tag>
  )
}

export function LayerRow({
  selected = false,
  onClick,
  thumb,
  icon: Icon,
  title,
  subtitle,
  visible,
  locked,
  onToggleLock,
  onToggleVisible,
  onRemove,
  className,
}) {
  return (
    <Card as="div" selected={selected} className={cn('flex items-center gap-1', className)}>
      {typeof visible === 'boolean' && (
        <button
          type="button"
          title={visible ? 'Hide layer' : 'Show layer'}
          onClick={(e) => {
            e.stopPropagation()
            onToggleVisible?.()
          }}
          className={cn(
            'grid h-6 w-6 shrink-0 place-items-center rounded-md transition',
            visible ? 'text-zinc-300 hover:text-white' : 'text-zinc-600 hover:text-zinc-400',
            !onToggleVisible && 'pointer-events-none',
          )}
        >
          {visible ? <Eye className="h-3.5 w-3.5" /> : <EyeOff className="h-3.5 w-3.5" />}
        </button>
      )}
      <button type="button" onClick={(event) => onClick?.(event)} className="flex min-w-0 flex-1 items-center gap-2 text-left">
        {thumb}
        {Icon && !thumb && <Icon className="h-3.5 w-3.5 shrink-0 text-zinc-500" />}
        <span className="min-w-0 flex-1">
          <b className="block truncate text-[12px] font-medium text-zinc-200">{title}</b>
          {subtitle && <small className="text-[10px] text-zinc-600">{subtitle}</small>}
        </span>
      </button>
      {onToggleLock && (
        <button
          type="button"
          title={locked ? 'Unlock' : 'Lock'}
          onClick={(e) => { e.stopPropagation(); onToggleLock() }}
          className={cn(
            'grid h-6 w-6 shrink-0 place-items-center rounded-md border border-white/[.06] transition',
            locked ? 'text-amber-300' : 'text-zinc-600 hover:text-zinc-300',
          )}
        >
          {locked ? <Lock className="h-3 w-3" /> : <Unlock className="h-3 w-3" />}
        </button>
      )}
      {onRemove && (
        <button
          type="button"
          title={locked ? 'Unlock to remove' : 'Remove layer'}
          disabled={locked}
          onClick={(e) => { e.stopPropagation(); if (!locked) onRemove() }}
          className={cn(
            'grid h-6 w-6 shrink-0 place-items-center rounded-md border border-white/[.06] transition',
            locked ? 'cursor-not-allowed text-zinc-700' : 'text-zinc-600 hover:border-red-500/30 hover:text-red-300',
          )}
        >
          <Trash2 className="h-3 w-3" />
        </button>
      )}
    </Card>
  )
}

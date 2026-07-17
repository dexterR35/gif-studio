import { cn } from '../../lib/cn'
import {
  ArrowDown, ArrowUp, ChevronsDown, ChevronsUp, Eye, EyeOff, GripVertical, Lock, Trash2, Unlock,
} from 'lucide-react'

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
  role = null,
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
  onMoveFront,
  onMoveUp,
  onMoveDown,
  onMoveBack,
  canMoveFront = false,
  canMoveUp = false,
  canMoveDown = false,
  canMoveBack = false,
  /** Pointer drag handle — same idea as timeline clip drag. */
  onDragStart,
  onDragMove,
  onDragEnd,
  dragging = false,
  dropTarget = false,
  className,
}) {
  const showArrange = onMoveFront || onMoveUp || onMoveDown || onMoveBack
  const canDrag = Boolean(onDragStart)

  return (
    <Card
      as="div"
      selected={selected}
      className={cn(
        'flex flex-col gap-1 transition',
        dragging && 'opacity-55 ring-1 ring-acid/40',
        dropTarget && !dragging && 'border-acid/50 bg-acid/[.08]',
        className,
      )}
    >
      <div className="flex items-center gap-0.5">
        {canDrag && (
          <button
            type="button"
            title="Drag to reorder (z-index)"
            aria-label="Drag to reorder"
            className="grid h-6 w-5 shrink-0 cursor-grab place-items-center rounded text-zinc-600 touch-none hover:text-zinc-300 active:cursor-grabbing"
            onPointerDown={(event) => {
              event.preventDefault()
              event.stopPropagation()
              onDragStart?.(event)
              event.currentTarget.setPointerCapture?.(event.pointerId)
            }}
            onPointerMove={(event) => onDragMove?.(event)}
            onPointerUp={(event) => {
              onDragEnd?.(event)
              try { event.currentTarget.releasePointerCapture?.(event.pointerId) } catch { /* ignore */ }
            }}
            onPointerCancel={(event) => onDragEnd?.(event)}
          >
            <GripVertical className="h-3.5 w-3.5" />
          </button>
        )}
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
            <small className="flex items-center gap-1 text-[10px] text-zinc-600">
              {role === 'primary' && <span className="font-semibold text-acid/90">Primary</span>}
              {role === 'secondary' && <span className="font-semibold text-zinc-400">Secondary</span>}
              {role && subtitle ? <span>·</span> : null}
              {subtitle}
            </small>
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
      </div>
      {showArrange && (
        <div className="flex items-center justify-end gap-0.5 pl-6">
          <ArrangeButton title="Bring to front" disabled={!canMoveFront} onClick={onMoveFront}>
            <ChevronsUp className="h-3 w-3" />
          </ArrangeButton>
          <ArrangeButton title="Bring forward" disabled={!canMoveUp} onClick={onMoveUp}>
            <ArrowUp className="h-3 w-3" />
          </ArrangeButton>
          <ArrangeButton title="Send backward" disabled={!canMoveDown} onClick={onMoveDown}>
            <ArrowDown className="h-3 w-3" />
          </ArrangeButton>
          <ArrangeButton title="Send to back" disabled={!canMoveBack} onClick={onMoveBack}>
            <ChevronsDown className="h-3 w-3" />
          </ArrangeButton>
        </div>
      )}
    </Card>
  )
}

function ArrangeButton({ title, disabled, onClick, children }) {
  return (
    <button
      type="button"
      title={title}
      disabled={disabled || !onClick}
      onClick={(e) => {
        e.stopPropagation()
        if (!disabled) onClick?.()
      }}
      className={cn(
        'grid h-5 w-5 place-items-center rounded transition',
        disabled || !onClick
          ? 'cursor-not-allowed text-zinc-700'
          : 'text-zinc-500 hover:bg-white/[.06] hover:text-zinc-200',
      )}
    >
      {children}
    </button>
  )
}

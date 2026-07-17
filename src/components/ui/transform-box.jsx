import { Lock, Unlock } from 'lucide-react'
import { cn } from '../../lib/cn'

const HANDLES = [
  { id: 'nw', cursor: 'nwse-resize', style: { left: 0, top: 0, transform: 'translate(-50%, -50%)' } },
  { id: 'n', cursor: 'ns-resize', style: { left: '50%', top: 0, transform: 'translate(-50%, -50%)' } },
  { id: 'ne', cursor: 'nesw-resize', style: { left: '100%', top: 0, transform: 'translate(-50%, -50%)' } },
  { id: 'e', cursor: 'ew-resize', style: { left: '100%', top: '50%', transform: 'translate(-50%, -50%)' } },
  { id: 'se', cursor: 'nwse-resize', style: { left: '100%', top: '100%', transform: 'translate(-50%, -50%)' } },
  { id: 's', cursor: 'ns-resize', style: { left: '50%', top: '100%', transform: 'translate(-50%, -50%)' } },
  { id: 'sw', cursor: 'nesw-resize', style: { left: 0, top: '100%', transform: 'translate(-50%, -50%)' } },
  { id: 'w', cursor: 'ew-resize', style: { left: 0, top: '50%', transform: 'translate(-50%, -50%)' } },
]

/**
 * Photoshop-style transform frame for stage selection.
 * Box values are percentages of the stage (x/y/w/h) plus rotation degrees.
 */
export function TransformBox({
  x,
  y,
  w,
  h,
  rotation = 0,
  locked = false,
  label,
  onPointerDownMove,
  onPointerDownHandle,
  onPointerDownRotate,
  onToggleLock,
  className,
}) {
  return (
    <div
      className={cn('absolute z-30', className)}
      style={{
        left: `${x * 100}%`,
        top: `${y * 100}%`,
        width: `${w * 100}%`,
        height: `${h * 100}%`,
        transform: `rotate(${rotation}deg)`,
        transformOrigin: 'center center',
      }}
    >
      <div
        className={cn(
          'absolute inset-0 border-2',
          locked ? 'border-amber-400/80 border-dashed' : 'border-acid',
        )}
        onPointerDown={locked ? undefined : onPointerDownMove}
        style={{ cursor: locked ? 'not-allowed' : 'move' }}
      />

      <div className="absolute -left-px -top-6 flex max-w-[calc(100%+24px)] items-center gap-1">
        <span className="truncate rounded-t bg-black/80 px-1.5 py-0.5 text-[8px] font-bold text-zinc-200">
          {label}
        </span>
        {onToggleLock && (
          <button
            type="button"
            title={locked ? 'Unlock' : 'Lock'}
            onPointerDown={(e) => e.stopPropagation()}
            onClick={(e) => { e.stopPropagation(); onToggleLock() }}
            className={cn(
              'grid h-5 w-5 place-items-center rounded border border-white/10 bg-black/80 transition',
              locked ? 'text-amber-300' : 'text-zinc-400 hover:text-white',
            )}
          >
            {locked ? <Lock className="h-3 w-3" /> : <Unlock className="h-3 w-3" />}
          </button>
        )}
      </div>

      {!locked && HANDLES.map((handle) => (
        <button
          key={handle.id}
          type="button"
          aria-label={`Resize ${handle.id}`}
          className="absolute z-10 h-2.5 w-2.5 rounded-[2px] border border-black/40 bg-white shadow"
          style={{ ...handle.style, cursor: handle.cursor }}
          onPointerDown={(event) => onPointerDownHandle?.(event, handle.id)}
        />
      ))}

      {!locked && (
        <button
          type="button"
          aria-label="Rotate"
          className="absolute left-1/2 top-0 z-10 h-3 w-3 -translate-x-1/2 -translate-y-[22px] rounded-full border border-black/40 bg-acid"
          style={{ cursor: 'grab' }}
          onPointerDown={onPointerDownRotate}
        >
          <span className="pointer-events-none absolute left-1/2 top-full h-3 w-px -translate-x-1/2 bg-acid" />
        </button>
      )}
    </div>
  )
}

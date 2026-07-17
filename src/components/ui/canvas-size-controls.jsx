import { Link2, Link2Off, RotateCcw } from 'lucide-react'
import { Button } from './button'
import { Field } from './field'
import { SelectField } from './select-field'
import { fmtBytes, MAX_CANVAS } from '../../lib/format'
import { cn } from '../../lib/cn'

const FIT_MODES = ['Contain', 'Cover', 'Stretch', 'Original size']

/**
 * Shared canvas + image resize controls (matches Python desktop sizing UX).
 * Shrinking width/height lowers estimated render memory (MB).
 */
export function CanvasSizeControls({
  width,
  height,
  fit,
  lockAspect,
  sourceWidth,
  sourceHeight,
  memoryBytes,
  onWidthChange,
  onHeightChange,
  onFitChange,
  onLockAspectChange,
  onUseSourceSize,
  max = MAX_CANVAS,
  showFit = true,
  className,
}) {
  const sourceLabel = sourceWidth && sourceHeight ? `${sourceWidth} × ${sourceHeight} px` : '—'
  const atSource = sourceWidth > 0 && width === sourceWidth && height === sourceHeight

  return (
    <div className={cn(className)}>
      <div className="mb-3 flex items-center justify-between gap-2 text-[10px] text-zinc-600">
        <span>Source image <b className="text-zinc-400">{sourceLabel}</b></span>
        {atSource && <span className="font-semibold text-acid/80">Original size</span>}
      </div>

      <div className="grid grid-cols-2 gap-3">
        <Field label="Canvas width" value={width} onChange={onWidthChange} min={1} max={max} suffix="px" />
        <Field label="Canvas height" value={height} onChange={onHeightChange} min={1} max={max} suffix="px" />
      </div>

      <div className="mt-3 flex flex-wrap gap-2">
        <Button
          type="button"
          disabled={!sourceWidth}
          onClick={onUseSourceSize}
        >
          <RotateCcw className="h-3.5 w-3.5" /> Use original size
        </Button>
        <button
          type="button"
          onClick={() => onLockAspectChange?.(!lockAspect)}
          className={cn('gs-chip focus-ring', lockAspect && 'is-active')}
        >
          {lockAspect ? <Link2 className="h-3.5 w-3.5" /> : <Link2Off className="h-3.5 w-3.5" />}
          Lock aspect
        </button>
      </div>

      {showFit && (
        <div className="mt-3">
          <SelectField
            label="Image fit"
            info="Contain fits inside the canvas. Cover fills it. Stretch ignores aspect. Original size draws source pixels 1:1 (may crop)."
            value={fit}
            onChange={onFitChange}
          >
            {FIT_MODES.map((mode) => (
              <option key={mode}>{mode}</option>
            ))}
          </SelectField>
        </div>
      )}

      {typeof memoryBytes === 'number' && (
        <div className={cn(
          'mt-3 rounded-xl border border-white/[.06] bg-black/15 px-3 py-2 text-[10px] leading-relaxed text-zinc-500',
          memoryBytes > 1.8e9 && 'border-red-500/30 text-red-300',
        )}>
          Render memory <b className="text-zinc-300">{fmtBytes(memoryBytes)}</b>
          <span className="text-zinc-600"> · {width} × {height} × frames · shrink canvas to reduce MB</span>
        </div>
      )}
    </div>
  )
}

export { MAX_CANVAS, FIT_MODES }

import { Field } from './field'
import { FormGrid } from './form'
import { SelectField } from './select-field'
import { Button } from './button'
import { FIT_MODES } from '../../lib/catalogs'
import { MAX_CANVAS } from '../../lib/format'
import { cn } from '../../lib/cn'

/**
 * Artboard size controls — independent from the base-image background layer.
 */
export function CanvasSizeControls({
  width,
  height,
  fit,
  sourceWidth,
  sourceHeight,
  onWidthChange,
  onHeightChange,
  onFitChange,
  onMatchSource,
  locked = false,
  max = MAX_CANVAS,
  showFit = false,
  className,
}) {
  const sourceLabel = sourceWidth && sourceHeight ? `${sourceWidth} × ${sourceHeight} px` : '—'
  const atSource = sourceWidth > 0 && width === sourceWidth && height === sourceHeight
  const boardLarger = sourceWidth > 0 && (width > sourceWidth || height > sourceHeight)
  const originalFit = fit === 'Original size'

  return (
    <div className={cn(className, locked && 'pointer-events-none opacity-40')}>
      <div className="mb-3 flex items-center justify-between gap-2 text-[10px] text-zinc-600">
        <span>Base image size <b className="text-zinc-400">{sourceLabel}</b></span>
        {atSource && <span className="font-semibold text-acid/80">Matched</span>}
        {!atSource && originalFit && (
          <span className="font-semibold text-acid/80">Image unchanged</span>
        )}
      </div>

      <FormGrid gap={3}>
        <Field label="Artboard width" value={width} onChange={onWidthChange} min={1} max={max} suffix="px" />
        <Field label="Artboard height" value={height} onChange={onHeightChange} min={1} max={max} suffix="px" />
      </FormGrid>

      {boardLarger && originalFit && (
        <p className="mt-2 text-[10px] leading-relaxed text-zinc-500">
          The image stays {sourceLabel}. Extra artboard space is empty around it.
        </p>
      )}
      {boardLarger && !originalFit && (
        <p className="mt-2 text-[10px] leading-relaxed text-zinc-500">
          Contain / Cover / Stretch scale the image with the artboard. Choose Original size to keep {sourceLabel}.
        </p>
      )}

      {boardLarger && !originalFit && onFitChange && (
        <Button
          variant="soft"
          full
          className="mt-3 text-[10px]"
          disabled={locked}
          onClick={() => onFitChange('Original size')}
        >
          Keep image at original size
        </Button>
      )}

      {showFit && (
        <div className="mt-3">
          <SelectField
            label="Image fit"
            info="Original size keeps the image at native pixels while the artboard can be larger. Contain / Cover / Stretch scale the image to the artboard."
            value={fit}
            onChange={onFitChange}
          >
            {FIT_MODES.map((mode) => (
              <option key={mode}>{mode}</option>
            ))}
          </SelectField>
        </div>
      )}

      {onMatchSource && sourceWidth > 0 && sourceHeight > 0 && (
        <Button
          variant="soft"
          full
          className="mt-3 text-[10px]"
          disabled={atSource || locked}
          onClick={onMatchSource}
        >
          Match base image size
        </Button>
      )}
    </div>
  )
}

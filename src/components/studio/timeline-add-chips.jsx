/**
 * Shared “add text” chip row for Timeline page.
 */
import { Type } from 'lucide-react'
import { cn } from '../../lib/cn'
import { MAX_TEXT_LAYERS } from '../../lib/presets'

export function TimelineAddChips({
  textCount = 0,
  onAddText,
  className,
}) {
  const textAtCap = textCount >= MAX_TEXT_LAYERS

  return (
    <div className={cn('gs-chip-row', className)}>
      <button
        type="button"
        className="gs-chip"
        disabled={textAtCap}
        title={textAtCap ? `Maximum ${MAX_TEXT_LAYERS} text layers` : 'Add text track'}
        onClick={onAddText}
      >
        <Type className="h-3 w-3" />
        Text
      </button>
    </div>
  )
}

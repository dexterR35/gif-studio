/**
 * Shared “add text / motion effect” chip row for Timeline page + EffectTimeline.
 */
import { Plus, Type } from 'lucide-react'
import { cn } from '../../lib/cn'
import { MAX_TEXT_LAYERS } from '../../lib/presets'
import { MOTION_EFFECT_TYPES, MAX_MOTION_EFFECTS } from '../../lib/motion-effects'

export function TimelineAddChips({
  textCount = 0,
  effectCount = 0,
  onAddText,
  onAddEffect,
  className,
}) {
  const textAtCap = textCount >= MAX_TEXT_LAYERS
  const atCap = effectCount >= MAX_MOTION_EFFECTS

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
      {MOTION_EFFECT_TYPES.map((type) => (
        <button
          key={type}
          type="button"
          className="gs-chip"
          disabled={atCap}
          title={atCap ? `Maximum ${MAX_MOTION_EFFECTS} effects` : `Add ${type}`}
          onClick={() => onAddEffect?.(type)}
        >
          <Plus className="h-3 w-3" />
          {type}
        </button>
      ))}
    </div>
  )
}

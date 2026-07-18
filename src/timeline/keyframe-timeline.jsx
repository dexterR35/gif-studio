/**
 * Custom React keyframe timeline — multi-track scrubber for studio properties.
 */
import { useMemo, useRef } from 'react'
import { cn } from '../lib/cn'
import { PRIMARY_ACCENT } from '../lib/colors'

function uid() {
  return `kf_${Math.random().toString(36).slice(2, 9)}`
}

export function createKeyframe({ time = 0, prop = 'opacity', value = 100, target = 'base' } = {}) {
  return { id: uid(), time, prop, value, target }
}

/**
 * @param {{
 *   duration: number,
 *   keyframes: Array,
 *   tracks?: Array<{ id: string, label: string, prop: string, color?: string }>,
 *   selectedId?: string|null,
 *   playhead?: number,
 *   onSelect?: (id:string)=>void,
 *   onChange?: (keyframes:Array)=>void,
 *   onScrub?: (t:number)=>void,
 *   onAdd?: (track:object, time:number)=>void,
 * }} props
 */
export function KeyframeTimeline({
  duration = 1,
  keyframes = [],
  tracks = [
    { id: 'opacity', label: 'Opacity', prop: 'opacity', color: PRIMARY_ACCENT },
    { id: 'scale', label: 'Scale', prop: 'scale', color: '#60a5fa' },
    { id: 'x', label: 'X', prop: 'x', color: '#f472b6' },
    { id: 'y', label: 'Y', prop: 'y', color: '#a78bfa' },
  ],
  selectedId = null,
  playhead = 0,
  onSelect,
  onChange,
  onScrub,
  onAdd,
  hint = 'Double-click a track to add a keyframe. Drag diamonds to retime.',
  className,
}) {
  const railRef = useRef(null)
  const maxT = Math.max(0.1, Number(duration) || 1)

  const byTrack = useMemo(() => {
    const map = Object.fromEntries(tracks.map((t) => [t.prop, []]))
    for (const kf of keyframes) {
      if (map[kf.prop]) map[kf.prop].push(kf)
      else if (map[kf.target]) map[kf.target].push(kf)
    }
    for (const list of Object.values(map)) list.sort((a, b) => a.time - b.time)
    return map
  }, [keyframes, tracks])

  const timeFromEvent = (event) => {
    const el = railRef.current
    if (!el) return 0
    const rect = el.getBoundingClientRect()
    const x = Math.max(0, Math.min(1, (event.clientX - rect.left) / rect.width))
    return +(x * maxT).toFixed(3)
  }

  const moveKeyframe = (id, time) => {
    onChange?.(keyframes.map((k) => (k.id === id ? { ...k, time: Math.max(0, Math.min(maxT, time)) } : k)))
  }

  return (
    <div className={cn('rounded-xl border border-white/[.08] bg-black/30 p-3', className)}>
      <div className="mb-2 flex items-center justify-between text-[10px] font-bold uppercase tracking-[.14em] text-zinc-500">
        <span>Keyframes</span>
        <span>{maxT.toFixed(2)}s</span>
      </div>

      <div className="relative mb-1 h-4" ref={railRef}>
        <div className="absolute inset-x-0 top-1/2 h-px -translate-y-1/2 bg-white/10" />
        <button
          type="button"
          aria-label="Playhead"
          className="absolute top-0 h-full w-0.5 -translate-x-1/2 bg-acid"
          style={{ left: `${(playhead / maxT) * 100}%` }}
          onPointerDown={(e) => {
            e.preventDefault()
            const move = (ev) => onScrub?.(timeFromEvent(ev) / maxT)
            const up = () => {
              window.removeEventListener('pointermove', move)
              window.removeEventListener('pointerup', up)
            }
            window.addEventListener('pointermove', move)
            window.addEventListener('pointerup', up)
          }}
        />
      </div>

      <div className="space-y-2">
        {tracks.map((track) => (
          <div key={track.id} className="grid grid-cols-[72px_1fr] items-center gap-2">
            <span className="truncate text-[10px] font-medium text-zinc-400">{track.label}</span>
            <div
              className="relative h-7 cursor-crosshair rounded-md bg-white/[.04]"
              onDoubleClick={(e) => {
                const time = timeFromEvent(e)
                if (onAdd) onAdd(track, time)
                else {
                  onChange?.([
                    ...keyframes,
                    createKeyframe({ time, prop: track.prop, value: 100, target: 'base' }),
                  ])
                }
              }}
              onPointerDown={(e) => {
                if (e.target !== e.currentTarget) return
                onScrub?.(timeFromEvent(e) / maxT)
              }}
            >
              {(byTrack[track.prop] || []).map((kf) => (
                <button
                  key={kf.id}
                  type="button"
                  title={`${kf.prop} @ ${kf.time}s = ${kf.value}`}
                  className={cn(
                    'absolute top-1/2 h-3 w-3 -translate-x-1/2 -translate-y-1/2 rotate-45 border border-black/40',
                    selectedId === kf.id ? 'ring-2 ring-white' : '',
                  )}
                  style={{
                    left: `${(kf.time / maxT) * 100}%`,
                    background: track.color || PRIMARY_ACCENT,
                  }}
                  onPointerDown={(e) => {
                    e.stopPropagation()
                    onSelect?.(kf.id)
                    const move = (ev) => moveKeyframe(kf.id, timeFromEvent(ev))
                    const up = () => {
                      window.removeEventListener('pointermove', move)
                      window.removeEventListener('pointerup', up)
                    }
                    window.addEventListener('pointermove', move)
                    window.addEventListener('pointerup', up)
                  }}
                />
              ))}
            </div>
          </div>
        ))}
      </div>
      {hint ? <p className="mt-2 text-[10px] text-zinc-600">{hint}</p> : null}
    </div>
  )
}

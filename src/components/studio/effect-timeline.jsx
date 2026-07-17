import { useRef } from 'react'
import { Plus } from 'lucide-react'
import {
  BASE_MOTION_ID,
  MAX_MOTION_EFFECTS,
  MOTION_EFFECT_COLORS,
  MOTION_EFFECT_TYPES,
  getBaseMotionClip,
  isBaseMotionClip,
  moveClipWindow,
} from '../../lib/motion-effects'
import { useStudio } from '../../context/studio-provider'
import { Collapsible } from '../ui'
import { cn } from '../../lib/cn'

/** Premiere-style lanes under the play bar — M = base motion; V* = editable effects. */
export function EffectTimeline({ defaultOpen = true }) {
  const {
    settings, progress, setProgress, actualDuration, setPlaying, draw,
    addMotionEffect, updateMotionEffect, moveMotionEffectTrack,
    selectedMotionEffect, setSelectedMotionEffect, goToWorkspace,
  } = useStudio()

  const clips = settings.motionEffects || []
  const baseClip = getBaseMotionClip(settings)
  const duration = Math.max(0.1, settings.duration || 1)
  const playheadPct = Math.min(100, Math.max(0, progress * 100))
  const displayDuration = actualDuration || duration
  const atCap = clips.length >= MAX_MOTION_EFFECTS
  const railsRef = useRef(null)
  const dragRef = useRef(null)

  const selectClip = (id) => {
    setSelectedMotionEffect(id)
    goToWorkspace?.('motion')
  }

  const beginDrag = (event, clip, mode) => {
    if (isBaseMotionClip(clip)) return
    event.preventDefault()
    event.stopPropagation()
    const rect = railsRef.current?.getBoundingClientRect()
    if (!rect) return
    selectClip(clip.id)
    setPlaying(false)
    dragRef.current = {
      id: clip.id,
      mode,
      startX: event.clientX,
      startY: event.clientY,
      originIn: clip.in,
      originOut: clip.out,
      originTrack: clip.track ?? 0,
      width: rect.width,
      laneHeight: 28,
    }
    event.currentTarget.setPointerCapture?.(event.pointerId)
  }

  const onPointerMove = (event) => {
    const drag = dragRef.current
    if (!drag) return
    const deltaSec = ((event.clientX - drag.startX) / drag.width) * duration
    const minSpan = 0.1

    if (drag.mode === 'move') {
      updateMotionEffect(
        drag.id,
        moveClipWindow({ in: drag.originIn, out: drag.originOut }, deltaSec, duration),
      )
      const laneDelta = Math.round((event.clientY - drag.startY) / drag.laneHeight)
      const nextTrack = Math.max(0, Math.min(MAX_MOTION_EFFECTS - 1, drag.originTrack + laneDelta))
      if (nextTrack !== drag.originTrack) {
        moveMotionEffectTrack(drag.id, nextTrack)
        drag.originTrack = nextTrack
        drag.startY = event.clientY
      }
      return
    }

    if (drag.mode === 'in') {
      const nextIn = Math.max(0, Math.min(drag.originOut - minSpan, drag.originIn + deltaSec))
      updateMotionEffect(drag.id, { in: +nextIn.toFixed(2) })
      return
    }

    if (drag.mode === 'out') {
      const nextOut = Math.max(drag.originIn + minSpan, Math.min(duration, drag.originOut + deltaSec))
      updateMotionEffect(drag.id, { out: +nextOut.toFixed(2) })
    }
  }

  const endDrag = (event) => {
    if (!dragRef.current) return
    dragRef.current = null
    try { event.currentTarget.releasePointerCapture?.(event.pointerId) } catch { /* ignore */ }
  }

  const scrubTo = (clientX) => {
    const rect = railsRef.current?.getBoundingClientRect()
    if (!rect) return
    const t = Math.min(1, Math.max(0, (clientX - rect.left) / rect.width))
    setPlaying(false)
    setProgress(t)
    draw(t)
  }

  return (
    <Collapsible
      className="!border-b-0 border-t border-white/[.05] !py-3"
      title={(
        <>
          Effect timeline
          <span className="ml-2 font-mono normal-case tracking-normal text-zinc-600">
            M + {clips.length}/{MAX_MOTION_EFFECTS}
          </span>
        </>
      )}
      meta={`0s → ${displayDuration.toFixed(1)}s`}
      open={defaultOpen}
      bodyClassName="!mt-2"
    >
      <div className="gs-timeline-lanes">
        <div className="gs-timeline-labels">
          <span className="gs-timeline-lane-label" title="Base motion from Motion dropdown">M</span>
          {Array.from({ length: MAX_MOTION_EFFECTS }, (_, track) => (
            <span key={track} className="gs-timeline-lane-label">V{track + 1}</span>
          ))}
        </div>
        <div
          ref={railsRef}
          className="gs-timeline-rails"
          onPointerDown={(e) => {
            if (e.target === e.currentTarget || e.target.classList?.contains('gs-timeline-lane-rail')) {
              scrubTo(e.clientX)
            }
          }}
        >
          <div className="gs-timeline-lane-rail" data-track="base">
            <div
              role="button"
              tabIndex={0}
              title={`${baseClip.type} · base motion (change via Motion dropdown)`}
              className={cn(
                'gs-timeline-clip gs-timeline-clip-base',
                selectedMotionEffect === BASE_MOTION_ID && 'is-active',
              )}
              style={{
                left: '0%',
                width: '100%',
                background: MOTION_EFFECT_COLORS.Base,
              }}
              onPointerDown={(e) => {
                e.preventDefault()
                e.stopPropagation()
                selectClip(BASE_MOTION_ID)
                setPlaying(false)
              }}
            >
              <span>{baseClip.type}</span>
              <em className="gs-timeline-lock">locked</em>
            </div>
          </div>

          {Array.from({ length: MAX_MOTION_EFFECTS }, (_, track) => {
            const clip = clips.find((item) => (item.track ?? 0) === track)
            return (
              <div key={track} className="gs-timeline-lane-rail" data-track={track}>
                {clip && (
                  <div
                    role="button"
                    tabIndex={0}
                    title={`${clip.type} ${clip.in.toFixed(1)}s → ${clip.out.toFixed(1)}s · drag to move`}
                    className={cn(
                      'gs-timeline-clip',
                      selectedMotionEffect === clip.id && 'is-active',
                    )}
                    style={{
                      left: `${(clip.in / duration) * 100}%`,
                      width: `${Math.max(1.5, ((clip.out - clip.in) / duration) * 100)}%`,
                      background: MOTION_EFFECT_COLORS[clip.type] || '#a1a1aa',
                    }}
                    onPointerDown={(e) => beginDrag(e, clip, 'move')}
                    onPointerMove={onPointerMove}
                    onPointerUp={endDrag}
                    onPointerCancel={endDrag}
                  >
                    <button
                      type="button"
                      aria-label="Trim in"
                      className="gs-timeline-handle gs-timeline-handle-in"
                      onPointerDown={(e) => beginDrag(e, clip, 'in')}
                      onPointerMove={onPointerMove}
                      onPointerUp={endDrag}
                      onPointerCancel={endDrag}
                    />
                    <span>{clip.type}</span>
                    <button
                      type="button"
                      aria-label="Trim out"
                      className="gs-timeline-handle gs-timeline-handle-out"
                      onPointerDown={(e) => beginDrag(e, clip, 'out')}
                      onPointerMove={onPointerMove}
                      onPointerUp={endDrag}
                      onPointerCancel={endDrag}
                    />
                  </div>
                )}
              </div>
            )
          })}
          <div className="gs-timeline-playhead" style={{ left: `${playheadPct}%` }} />
        </div>
      </div>

      <div className="mt-2.5 flex flex-wrap items-center gap-1.5">
        {MOTION_EFFECT_TYPES.map((type) => (
          <button
            key={type}
            type="button"
            className="gs-chip"
            disabled={atCap}
            title={atCap ? `Maximum ${MAX_MOTION_EFFECTS} effects` : `Add ${type}`}
            onClick={() => addMotionEffect(type)}
          >
            <Plus className="h-3 w-3" />
            {type}
          </button>
        ))}
      </div>
    </Collapsible>
  )
}

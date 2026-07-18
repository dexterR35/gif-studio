import { useRef } from 'react'
import {
  BASE_MOTION_ID,
  MAX_MOTION_EFFECTS,
  MOTION_EFFECT_COLORS,
  getBaseMotionClip,
  isBaseMotionClip,
  layerTrackId,
  moveClipWindow,
} from '../../lib/motion-effects'
import { MAX_TEXT_LAYERS } from '../../lib/presets'
import { useStudio } from '../../context/studio-provider'
import { Collapsible } from '../ui'
import { TimelineAddChips } from './timeline-add-chips'
import { cn } from '../../lib/cn'

const LAYER_LANE_COLORS = {
  element: '#94a3b8',
  overlay: '#a78bfa',
  text: '#fbbf24',
}

/** Premiere-style lanes — M locked, V* effects, T* text (editable), L/O locked. */
export function EffectTimeline({ defaultOpen = true }) {
  const {
    settings, progress, setProgress, actualDuration, setPlaying, draw,
    addMotionEffect, updateMotionEffect, moveMotionEffectTrack,
    selectedMotionEffect, setSelectedMotionEffect, goToWorkspace,
    elements, overlays, textLayers, addTextLayer, updateTextById, activeTab,
    poseRig, setPoseRig,
  } = useStudio()

  const clips = settings.motionEffects || []
  const baseClip = getBaseMotionClip(settings)
  const duration = Math.max(0.1, settings.duration || 1)
  const playheadPct = Math.min(100, Math.max(0, progress * 100))
  const displayDuration = actualDuration || duration
  const railsRef = useRef(null)
  const dragRef = useRef(null)
  const editable = activeTab === 'timeline'

  const textLanes = [...textLayers].reverse().map((layer, index) => {
    const clipIn = Number.isFinite(Number(layer.in)) ? Number(layer.in) : 0
    const clipOut = Number.isFinite(Number(layer.out)) ? Number(layer.out) : duration
    return {
      id: layerTrackId('text', layer.id),
      layerId: layer.id,
      label: `T${textLayers.length - index}`,
      title: layer.text || 'Empty text',
      in: clipIn,
      out: clipOut,
      color: LAYER_LANE_COLORS.text,
      visible: layer.visible !== false,
    }
  })

  const lockedLanes = [
    ...[...elements].reverse().map((el, index) => ({
      id: layerTrackId('element', el.id),
      label: `L${elements.length - index}`,
      title: el.name || 'Layer',
      subtitle: el.motion || 'Float',
      color: LAYER_LANE_COLORS.element,
      visible: el.visible !== false,
    })),
    ...[...overlays].reverse().map((ov, index) => ({
      id: layerTrackId('overlay', ov.id),
      label: `O${overlays.length - index}`,
      title: ov.name || 'Overlay',
      subtitle: 'Image',
      color: LAYER_LANE_COLORS.overlay,
      visible: ov.visible !== false,
    })),
  ]

  const jointCount = (poseRig.joints || []).filter((j) => (j.score ?? 1) >= 0.25).length
  const jointLane = jointCount > 0
    ? {
      id: 'joints',
      label: 'J',
      title: poseRig.selectedJoint
        ? poseRig.selectedJoint.replace(/_/g, ' ')
        : 'Joints',
      subtitle: `${jointCount} keys`,
      color: '#d8ff3e',
    }
    : null

  const openJointPanel = () => {
    setPoseRig((current) => ({
      ...current,
      panelOpen: true,
      visible: true,
      selectedJoint: current.selectedJoint
        || current.joints?.find((j) => (j.score ?? 1) >= 0.25)?.name
        || null,
    }))
    setSelectedMotionEffect('joints')
    setPlaying(false)
    if (activeTab !== 'ai' && activeTab !== 'motion') goToWorkspace?.('ai')
  }

  const selectClip = (id) => {
    setSelectedMotionEffect(id)
    goToWorkspace?.('timeline')
  }

  const beginDrag = (event, clip, mode, kind = 'effect') => {
    if (isBaseMotionClip(clip) || !editable) return
    event.preventDefault()
    event.stopPropagation()
    const rect = railsRef.current?.getBoundingClientRect()
    if (!rect) return
    selectClip(clip.id)
    setPlaying(false)
    dragRef.current = {
      kind,
      id: kind === 'text' ? clip.layerId : clip.id,
      trackId: clip.id,
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

    if (drag.kind === 'text') {
      if (drag.mode === 'move') {
        updateTextById(drag.id, moveClipWindow({ in: drag.originIn, out: drag.originOut }, deltaSec, duration))
        return
      }
      if (drag.mode === 'in') {
        const nextIn = Math.max(0, Math.min(drag.originOut - minSpan, drag.originIn + deltaSec))
        updateTextById(drag.id, { in: +nextIn.toFixed(2) })
        return
      }
      if (drag.mode === 'out') {
        const nextOut = Math.max(drag.originIn + minSpan, Math.min(duration, drag.originOut + deltaSec))
        updateTextById(drag.id, { out: +nextOut.toFixed(2) })
      }
      return
    }

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
    setProgress(t, { force: true })
    draw(t)
  }

  return (
    <Collapsible
      className="!border-b-0 border-t border-white/[.05] !py-3"
      title={(
        <>
          Timeline
          <span className="ml-2 font-mono normal-case tracking-normal text-zinc-600">
            M · {textLanes.length}/{MAX_TEXT_LAYERS}T · {clips.length}/{MAX_MOTION_EFFECTS}
            {jointLane ? ' · J' : ''}
          </span>
        </>
      )}
      meta={`0s → ${displayDuration.toFixed(1)}s`}
      open={defaultOpen}
      bodyClassName="!mt-2"
    >
      <div className="gs-timeline-lanes">
        <div className="gs-timeline-labels">
          <span className="gs-timeline-lane-label" title="Base motion from Motion tab">M</span>
          {Array.from({ length: MAX_MOTION_EFFECTS }, (_, track) => (
            <span key={track} className="gs-timeline-lane-label">V{track + 1}</span>
          ))}
          {textLanes.map((lane) => (
            <span key={lane.id} className="gs-timeline-lane-label" title={lane.title}>
              {lane.label}
            </span>
          ))}
          {jointLane && (
            <span className="gs-timeline-lane-label" title="Body joint keys">J</span>
          )}
          {lockedLanes.map((lane) => (
            <span key={lane.id} className="gs-timeline-lane-label" title={lane.title}>
              {lane.label}
            </span>
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
              title={`${baseClip.type} · base motion (change via Motion tab)`}
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
                    title={`${clip.type} ${clip.in.toFixed(1)}s → ${clip.out.toFixed(1)}s · ${editable ? 'drag to move' : 'open Timeline to edit'}`}
                    className={cn(
                      'gs-timeline-clip',
                      !editable && 'gs-timeline-clip-readonly',
                      selectedMotionEffect === clip.id && 'is-active',
                    )}
                    style={{
                      left: `${(clip.in / duration) * 100}%`,
                      width: `${Math.max(1.5, ((clip.out - clip.in) / duration) * 100)}%`,
                      background: MOTION_EFFECT_COLORS[clip.type] || '#a1a1aa',
                    }}
                    onPointerDown={(e) => {
                      if (!editable) {
                        e.preventDefault()
                        e.stopPropagation()
                        selectClip(clip.id)
                        setPlaying(false)
                        return
                      }
                      beginDrag(e, clip, 'move')
                    }}
                    onPointerMove={onPointerMove}
                    onPointerUp={endDrag}
                    onPointerCancel={endDrag}
                  >
                    {editable && (
                      <button
                        type="button"
                        aria-label="Trim in"
                        className="gs-timeline-handle gs-timeline-handle-in"
                        onPointerDown={(e) => beginDrag(e, clip, 'in')}
                        onPointerMove={onPointerMove}
                        onPointerUp={endDrag}
                        onPointerCancel={endDrag}
                      />
                    )}
                    <span>{clip.type}</span>
                    {editable && (
                      <button
                        type="button"
                        aria-label="Trim out"
                        className="gs-timeline-handle gs-timeline-handle-out"
                        onPointerDown={(e) => beginDrag(e, clip, 'out')}
                        onPointerMove={onPointerMove}
                        onPointerUp={endDrag}
                        onPointerCancel={endDrag}
                      />
                    )}
                  </div>
                )}
              </div>
            )
          })}

          {textLanes.map((lane) => (
            <div key={lane.id} className="gs-timeline-lane-rail" data-track={lane.id}>
              <div
                role="button"
                tabIndex={0}
                title={`${lane.title} ${lane.in.toFixed(1)}s → ${lane.out.toFixed(1)}s · ${editable ? 'drag to trim' : 'open Timeline to edit'}`}
                className={cn(
                  'gs-timeline-clip',
                  !editable && 'gs-timeline-clip-readonly',
                  !lane.visible && 'is-hidden',
                  selectedMotionEffect === lane.id && 'is-active',
                )}
                style={{
                  left: `${(lane.in / duration) * 100}%`,
                  width: `${Math.max(1.5, ((lane.out - lane.in) / duration) * 100)}%`,
                  background: lane.color,
                }}
                onPointerDown={(e) => {
                  if (!editable) {
                    e.preventDefault()
                    e.stopPropagation()
                    selectClip(lane.id)
                    setPlaying(false)
                    return
                  }
                  beginDrag(e, lane, 'move', 'text')
                }}
                onPointerMove={onPointerMove}
                onPointerUp={endDrag}
                onPointerCancel={endDrag}
              >
                {editable && (
                  <button
                    type="button"
                    aria-label="Trim in"
                    className="gs-timeline-handle gs-timeline-handle-in"
                    onPointerDown={(e) => beginDrag(e, lane, 'in', 'text')}
                    onPointerMove={onPointerMove}
                    onPointerUp={endDrag}
                    onPointerCancel={endDrag}
                  />
                )}
                <span>{lane.title}</span>
                {editable && (
                  <button
                    type="button"
                    aria-label="Trim out"
                    className="gs-timeline-handle gs-timeline-handle-out"
                    onPointerDown={(e) => beginDrag(e, lane, 'out', 'text')}
                    onPointerMove={onPointerMove}
                    onPointerUp={endDrag}
                    onPointerCancel={endDrag}
                  />
                )}
              </div>
            </div>
          ))}

          {jointLane && (
            <div className="gs-timeline-lane-rail" data-track="joints">
              <div
                role="button"
                tabIndex={0}
                title={`${jointLane.title} · start → end joint keys · click to edit`}
                className={cn(
                  'gs-timeline-clip',
                  selectedMotionEffect === 'joints' && 'is-active',
                )}
                style={{
                  left: '0%',
                  width: '100%',
                  background: jointLane.color,
                  color: '#111',
                }}
                onPointerDown={(e) => {
                  e.preventDefault()
                  e.stopPropagation()
                  openJointPanel()
                }}
              >
                <span>{jointLane.title}</span>
                <em className="gs-timeline-lock" style={{ color: '#111', opacity: 0.7 }}>
                  {jointLane.subtitle}
                </em>
                {/* Start / end key markers */}
                <i
                  aria-hidden
                  className="pointer-events-none absolute top-1/2 left-0 h-2.5 w-2.5 -translate-y-1/2 rotate-45 border border-black/40 bg-white"
                  title="Start key"
                />
                <i
                  aria-hidden
                  className="pointer-events-none absolute top-1/2 right-0 h-2.5 w-2.5 -translate-x-1/2 -translate-y-1/2 rotate-45 border border-black/40 bg-white"
                  title="End key"
                />
              </div>
            </div>
          )}

          {lockedLanes.map((lane) => (
            <div key={lane.id} className="gs-timeline-lane-rail" data-track={lane.id}>
              <div
                role="button"
                tabIndex={0}
                title={`${lane.title} · ${lane.subtitle} (locked — edit on Motion)`}
                className={cn(
                  'gs-timeline-clip gs-timeline-clip-base gs-timeline-clip-layer',
                  !lane.visible && 'is-hidden',
                  selectedMotionEffect === lane.id && 'is-active',
                )}
                style={{
                  left: '0%',
                  width: '100%',
                  background: lane.color,
                }}
                onPointerDown={(e) => {
                  e.preventDefault()
                  e.stopPropagation()
                  selectClip(lane.id)
                  setPlaying(false)
                }}
              >
                <span>{lane.title}</span>
                <em className="gs-timeline-lock">{lane.subtitle}</em>
              </div>
            </div>
          ))}

          <div className="gs-timeline-playhead" style={{ left: `${playheadPct}%` }} />
        </div>
      </div>

      {editable && (
        <TimelineAddChips
          className="mt-2.5"
          textCount={textLayers.length}
          effectCount={clips.length}
          onAddText={() => {
            const id = addTextLayer({ stay: true })
            if (id != null) selectClip(layerTrackId('text', id))
          }}
          onAddEffect={(type) => {
            const id = addMotionEffect(type)
            if (id != null) selectClip(id)
          }}
        />
      )}
    </Collapsible>
  )
}

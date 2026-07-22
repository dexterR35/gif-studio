/**
 * Single shared timeline (all workspaces) — Studio timeline:
 * layer names · expand props with live values · duration bars · keyframe diamonds.
 */
import { useCallback, useMemo, useRef, useState } from 'react'
import {
  ChevronDown, ChevronRight, Eye, EyeOff, Lock, Unlock,
  Image, Type, Layers, Bone, Sparkles,
} from 'lucide-react'
import { useStudio } from '../../context/studio-provider'
import {
  BASE_MOTION_ID,
  getBaseMotionClip,
  isBaseMotionClip,
  layerTrackId,
  moveClipWindow,
  parseLayerTrackId,
} from '../../lib/timeline-ids'
import { cn } from '../../lib/cn'

const TRACK_H = 28
const RULER_H = 24
const LAYER_PANEL_W = 260

const LAYER_COLORS = {
  element: '#5eead4',
  overlay: '#a78bfa',
  text: '#fbbf24',
  effect: '#22d3ee',
  base: '#71717a',
  joints: '#d8ff3e',
}

function fmt(n, digits = 2) {
  if (!Number.isFinite(Number(n))) return '—'
  return Number(n).toFixed(digits)
}

function TimeRuler({ duration }) {
  const marks = []
  const step = duration <= 2 ? 0.5 : duration <= 6 ? 1 : Math.ceil(duration / 6)
  for (let t = 0; t <= duration + 0.001; t += step) {
    const pct = (t / duration) * 100
    marks.push(
      <g key={t}>
        <line x1={`${pct}%`} y1={RULER_H - 10} x2={`${pct}%`} y2={RULER_H} stroke="#555" strokeWidth="1" />
        <text x={`${pct}%`} y={RULER_H - 13} fill="#888" fontSize="9" textAnchor="middle" fontFamily="monospace">
          {t % 1 === 0 ? `${t}s` : `${t.toFixed(1)}s`}
        </text>
      </g>,
    )
  }
  return (
    <svg className="gs-tl-ruler" width="100%" height={RULER_H}>
      <line x1="0" y1={RULER_H - 1} x2="100%" y2={RULER_H - 1} stroke="#333" strokeWidth="1" />
      {marks}
    </svg>
  )
}

function KeyframeDiamond({ pct, selected, color, title, onPointerDown }) {
  return (
    <button
      type="button"
      title={title}
      className={cn('gs-tl-keyframe', selected && 'is-selected')}
      style={{ left: `${pct}%`, background: color || '#c8c8c8' }}
      onPointerDown={onPointerDown}
    />
  )
}

function LayerRow({
  layer,
  depth = 0,
  selected,
  expanded,
  onSelect,
  onToggleExpand,
  onToggleVisible,
  onToggleLock,
  children,
}) {
  const IconComp = layer.icon || Layers

  return (
    <div className="gs-tl-layer-group">
      <div
        className={cn('gs-tl-layer-row', selected && 'is-selected')}
        style={{ paddingLeft: 6 + depth * 14 }}
        onClick={() => onSelect?.(layer.id)}
      >
        {layer.expandable ? (
          <button
            type="button"
            className="gs-tl-layer-chevron"
            onClick={(e) => { e.stopPropagation(); onToggleExpand?.(layer.id) }}
          >
            {expanded ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
          </button>
        ) : (
          <span className="gs-tl-layer-chevron-spacer" />
        )}

        <IconComp className="h-3 w-3 shrink-0 text-zinc-500" />

        <span className="gs-tl-layer-name" title={layer.name}>{layer.name}</span>

        {typeof layer.visible === 'boolean' && (
          <button
            type="button"
            className={cn('gs-tl-layer-btn', !layer.visible && 'is-off')}
            title={layer.visible ? 'Hide' : 'Show'}
            onClick={(e) => { e.stopPropagation(); onToggleVisible?.(layer.id) }}
          >
            {layer.visible ? <Eye className="h-3 w-3" /> : <EyeOff className="h-3 w-3" />}
          </button>
        )}

        {typeof layer.locked === 'boolean' && (
          <button
            type="button"
            className={cn('gs-tl-layer-btn', layer.locked && 'is-locked')}
            title={layer.locked ? 'Unlock' : 'Lock'}
            onClick={(e) => { e.stopPropagation(); onToggleLock?.(layer.id) }}
          >
            {layer.locked ? <Lock className="h-2.5 w-2.5" /> : <Unlock className="h-2.5 w-2.5" />}
          </button>
        )}
      </div>
      {expanded && children}
    </div>
  )
}

function PropertyRow({ name, value, color, depth = 1 }) {
  return (
    <div className="gs-tl-layer-row gs-tl-prop-row" style={{ paddingLeft: 6 + depth * 14 }}>
      <span className="gs-tl-layer-chevron-spacer" />
      <span className="gs-tl-prop-dot" style={{ background: color }} />
      <span className="gs-tl-prop-label">{name}</span>
      {value != null && <span className="gs-tl-prop-value">{value}</span>}
    </div>
  )
}

export function StudioTimeline() {
  const {
    settings, progress, setProgress, actualDuration, setPlaying, draw,
    selectedMotionEffect, setSelectedMotionEffect,
    elements, overlays, textLayers, updateTextById, updateOverlayById,
    poseRig, setPoseRig,
    toggleElementVisible, toggleOverlayVisible, toggleElementLock, toggleTextLock,
    selectLayer, selectOverlay, setSelectedText, clearLayerSelection, setSelectedOverlay,
    selectedElements, selectedOverlay, selectedText,
  } = useStudio()

  const baseClip = getBaseMotionClip(settings)
  const duration = Math.max(0.1, settings.duration || 1)
  const fps = settings.fps || 24
  const totalFrames = Math.max(1, Math.round(duration * fps))
  const playheadPct = Math.min(100, Math.max(0, progress * 100))
  const displayDuration = actualDuration || duration
  // One shared timeline — always editable on every workspace
  const editable = true
  const railsRef = useRef(null)
  const dragRef = useRef(null)
  const [expanded, setExpanded] = useState({})

  const toggleExpand = useCallback((id) => {
    setExpanded((prev) => ({ ...prev, [id]: !prev[id] }))
  }, [])

  const layers = useMemo(() => {
    const list = []

    // Content layers first (match Outliner order feeling) — front first
    ;[...textLayers].reverse().forEach((layer, index) => {
      const clipIn = Number.isFinite(Number(layer.in)) ? Number(layer.in) : 0
      const clipOut = Number.isFinite(Number(layer.out)) ? Number(layer.out) : duration
      list.push({
        id: layerTrackId('text', layer.id),
        layerId: layer.id,
        name: layer.text || `Text ${textLayers.length - index}`,
        icon: Type,
        visible: layer.visible !== false,
        locked: !!layer.locked,
        expandable: true,
        kind: 'text',
        color: LAYER_COLORS.text,
        clipIn,
        clipOut,
        entity: layer,
        properties: [
          { id: 'opacity', name: 'Opacity', color: '#d8ff3e', value: `${fmt(layer.opacity ?? 100, 0)}%` },
          {
            id: 'position',
            name: 'Position',
            color: '#60a5fa',
            value: `X: ${fmt((layer.x ?? 0.5) * 100, 1)}  Y: ${fmt((layer.y ?? 0.5) * 100, 1)}`,
          },
          {
            id: 'scale',
            name: 'Scale',
            color: '#f472b6',
            value: `${fmt(layer.scale ?? 100, 0)}%`,
          },
        ],
      })
    })

    ;[...elements].reverse().forEach((el) => {
      list.push({
        id: layerTrackId('element', el.id),
        layerId: el.id,
        name: el.name || 'Layer',
        icon: Image,
        visible: el.visible !== false,
        locked: !!el.locked,
        expandable: true,
        kind: 'element',
        color: LAYER_COLORS.element,
        clipIn: 0,
        clipOut: duration,
        entity: el,
        properties: [
          { id: 'opacity', name: 'Opacity', color: '#d8ff3e', value: `${fmt(el.opacity ?? 100, 0)}%` },
          {
            id: 'position',
            name: 'Position',
            color: '#60a5fa',
            value: `X: ${fmt((el.x ?? 0) * 100, 2)}  Y: ${fmt((el.y ?? 0) * 100, 2)}`,
          },
          {
            id: 'scale',
            name: 'Scale',
            color: '#f472b6',
            value: `${fmt(el.scaleX ?? 100, 0)}% × ${fmt(el.scaleY ?? 100, 0)}%`,
          },
          {
            id: 'rotation',
            name: 'Rotation',
            color: '#a78bfa',
            value: `${fmt(el.rotation ?? 0, 1)}°`,
          },
        ],
      })
    })

    ;[...overlays].reverse().forEach((ov) => {
      list.push({
        id: layerTrackId('overlay', ov.id),
        layerId: ov.id,
        name: ov.name || 'Overlay',
        icon: Image,
        visible: ov.visible !== false,
        locked: !!ov.locked,
        expandable: true,
        kind: 'overlay',
        color: LAYER_COLORS.overlay,
        clipIn: 0,
        clipOut: duration,
        entity: ov,
        properties: [
          { id: 'opacity', name: 'Opacity', color: '#d8ff3e', value: `${fmt(ov.opacity ?? 100, 0)}%` },
          {
            id: 'position',
            name: 'Position',
            color: '#60a5fa',
            value: `X: ${fmt((ov.x ?? 0) * 100, 2)}  Y: ${fmt((ov.y ?? 0) * 100, 2)}`,
          },
          {
            id: 'scale',
            name: 'Scale',
            color: '#f472b6',
            value: `${fmt(ov.scaleX ?? 100, 0)}% × ${fmt(ov.scaleY ?? 100, 0)}%`,
          },
        ],
      })
    })

    list.push({
      id: BASE_MOTION_ID,
      name: `Base · ${baseClip.type}`,
      icon: Sparkles,
      visible: true,
      locked: false,
      expandable: true,
      kind: 'base',
      color: LAYER_COLORS.base,
      clipIn: 0,
      clipOut: duration,
      properties: [
        {
          id: 'opacity',
          name: 'Opacity',
          color: '#d8ff3e',
          value: `${fmt(settings.opacityStart, 0)}% → ${fmt(settings.opacityEnd, 0)}%`,
        },
        {
          id: 'position',
          name: 'Position',
          color: '#60a5fa',
          value: `X: ${fmt(settings.xStart, 1)} → ${fmt(settings.xEnd, 1)}`,
        },
        {
          id: 'scale',
          name: 'Scale',
          color: '#f472b6',
          value: `${fmt(settings.scaleStart, 0)}% → ${fmt(settings.scaleEnd, 0)}%`,
        },
      ],
    })

    const jointCount = (poseRig.joints || []).filter((j) => (j.score ?? 1) >= 0.25).length
    if (jointCount > 0) {
      list.push({
        id: 'joints',
        name: poseRig.selectedJoint ? poseRig.selectedJoint.replace(/_/g, ' ') : 'Joints',
        icon: Bone,
        visible: poseRig.visible !== false,
        locked: false,
        expandable: false,
        kind: 'joints',
        color: LAYER_COLORS.joints,
        clipIn: 0,
        clipOut: duration,
      })
    }

    return list
  }, [baseClip, textLayers, elements, overlays, poseRig, duration, settings])

  const isLayerSelected = useCallback((layer) => {
    if (selectedMotionEffect === layer.id) return true
    if (layer.kind === 'element' && selectedElements?.includes(layer.layerId)) return true
    if (layer.kind === 'overlay' && selectedOverlay === layer.layerId) return true
    if (layer.kind === 'text' && selectedText === layer.layerId) return true
    return false
  }, [selectedMotionEffect, selectedElements, selectedOverlay, selectedText])

  const selectClip = (id) => {
    setSelectedMotionEffect(id)
    setPlaying(false)

    if (id === BASE_MOTION_ID || id === 'joints') {
      clearLayerSelection?.()
      setSelectedOverlay?.(null)
      setSelectedText?.(null)
      if (id === 'joints') {
        setPoseRig((cur) => ({
          ...cur,
          panelOpen: true,
          visible: true,
          selectedJoint: cur.selectedJoint
            || cur.joints?.find((j) => (j.score ?? 1) >= 0.25)?.name
            || null,
        }))
      }
      return
    }

    const ref = parseLayerTrackId(id)
    if (ref?.kind === 'element') {
      selectLayer?.(ref.id, { stopPropagation() {} })
      setSelectedText?.(null)
      setSelectedOverlay?.(null)
      return
    }
    if (ref?.kind === 'overlay') {
      selectOverlay?.(ref.id)
      clearLayerSelection?.()
      setSelectedText?.(null)
      return
    }
    if (ref?.kind === 'text') {
      clearLayerSelection?.()
      setSelectedOverlay?.(null)
      setSelectedText?.(ref.id)
      return
    }

    // Motion effect clip
    clearLayerSelection?.()
    setSelectedOverlay?.(null)
    setSelectedText?.(null)
  }

  const scrubTo = (clientX) => {
    const rect = railsRef.current?.getBoundingClientRect()
    if (!rect) return
    const t = Math.min(1, Math.max(0, (clientX - rect.left) / rect.width))
    setPlaying(false)
    setProgress(t, { force: true })
    draw(t)
  }

  const beginDrag = (event, clip, mode, kind = 'effect') => {
    if (isBaseMotionClip(clip) || clip?.locked) return
    event.preventDefault()
    event.stopPropagation()
    const rect = railsRef.current?.getBoundingClientRect()
    if (!rect) return
    const trackId = kind === 'text'
      ? layerTrackId('text', clip.layerId || clip.id)
      : clip.id
    selectClip(trackId)
    setPlaying(false)
    dragRef.current = {
      kind,
      id: kind === 'text' ? (clip.layerId || clip.id) : clip.id,
      mode,
      startX: event.clientX,
      startY: event.clientY,
      originIn: clip.in ?? clip.clipIn ?? 0,
      originOut: clip.out ?? clip.clipOut ?? duration,
      originTrack: clip.track ?? 0,
      width: rect.width,
      laneHeight: TRACK_H,
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
    }
  }

  const endDrag = (event) => {
    if (!dragRef.current) return
    dragRef.current = null
    try { event.currentTarget.releasePointerCapture?.(event.pointerId) } catch { /* noop */ }
  }

  const scrubPlayhead = (e) => {
    e.preventDefault()
    e.stopPropagation()
    const move = (ev) => scrubTo(ev.clientX)
    const up = () => {
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', up)
    }
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', up)
    scrubTo(e.clientX)
  }

  return (
    <div className="gs-tl-timeline">
      <div className="gs-tl-timeline-body">
        {/* Layer list */}
        <div className="gs-tl-layer-panel" style={{ width: LAYER_PANEL_W }}>
          <div className="gs-tl-layer-header">
            <Layers className="h-3 w-3 text-zinc-500" />
            <span>Timeline</span>
            <span className="gs-tl-layer-count">{layers.length}</span>
          </div>
          <div className="gs-tl-layer-list scrollbar">
            {layers.map((layer) => {
              const selected = isLayerSelected(layer)
              return (
                <LayerRow
                  key={layer.id}
                  layer={layer}
                  selected={selected}
                  expanded={!!expanded[layer.id]}
                  onSelect={selectClip}
                  onToggleExpand={toggleExpand}
                  onToggleVisible={(id) => {
                    const l = layers.find((x) => x.id === id)
                    if (!l) return
                    if (l.kind === 'joints') setPoseRig((cur) => ({ ...cur, visible: !cur.visible }))
                    else if (l.kind === 'element') toggleElementVisible?.(l.layerId)
                    else if (l.kind === 'overlay') toggleOverlayVisible?.(l.layerId)
                    else if (l.kind === 'text') {
                      const tl = textLayers.find((t) => t.id === l.layerId)
                      if (tl) updateTextById(tl.id, { visible: tl.visible === false })
                    }
                  }}
                  onToggleLock={(id) => {
                    const l = layers.find((x) => x.id === id)
                    if (!l) return
                    if (l.kind === 'element') toggleElementLock?.(l.layerId)
                    else if (l.kind === 'text') toggleTextLock?.(l.layerId)
                    else if (l.kind === 'overlay' && updateOverlayById) {
                      updateOverlayById(l.layerId, { locked: !l.locked })
                    }
                  }}
                >
                  {layer.properties?.map((prop) => (
                    <PropertyRow
                      key={prop.id || prop.name}
                      name={prop.name}
                      value={prop.value}
                      color={prop.color}
                    />
                  ))}
                </LayerRow>
              )
            })}
          </div>
        </div>

        {/* Tracks */}
        <div className="gs-tl-track-panel">
          <div
            className="gs-tl-ruler-wrap"
            onPointerDown={(e) => {
              const rect = railsRef.current?.getBoundingClientRect()
              if (!rect) return
              const t = Math.min(1, Math.max(0, (e.clientX - rect.left) / rect.width))
              setPlaying(false)
              setProgress(t, { force: true })
              draw(t)
            }}
          >
            <TimeRuler duration={duration} />
            <div
              className="gs-tl-playhead-handle"
              style={{ left: `${playheadPct}%` }}
              onPointerDown={scrubPlayhead}
            >
              <svg width="10" height="8" viewBox="0 0 10 8" className="gs-tl-playhead-tri">
                <polygon points="0,0 10,0 5,8" fill="#f97316" />
              </svg>
            </div>
          </div>

          <div
            ref={railsRef}
            className="gs-tl-tracks scrollbar"
            onPointerDown={(e) => {
              if (e.target === e.currentTarget || e.target.classList?.contains('gs-tl-track-row')) {
                scrubTo(e.clientX)
              }
            }}
          >
            {layers.map((layer) => {
              const inPct = (layer.clipIn / duration) * 100
              const widthPct = Math.max(1.2, ((layer.clipOut - layer.clipIn) / duration) * 100)
              const isSelected = isLayerSelected(layer)
              const isText = layer.kind === 'text'
              const canTrim = editable && !layer.locked && isText

              return (
                <div key={layer.id}>
                  <div className={cn('gs-tl-track-row', isSelected && 'is-selected')} data-track={layer.id}>
                    <div
                      className={cn(
                        'gs-tl-clip',
                        isSelected && 'is-selected',
                        layer.locked && 'is-dim',
                        !layer.visible && 'is-hidden',
                      )}
                      style={{
                        left: `${inPct}%`,
                        width: `${widthPct}%`,
                        '--clip-color': isSelected ? '#2dd4bf' : (layer.color || '#555'),
                      }}
                      title={`${layer.name} · ${layer.clipIn.toFixed(1)}s → ${layer.clipOut.toFixed(1)}s`}
                      onPointerDown={(e) => {
                        if (layer.locked) {
                          e.preventDefault()
                          e.stopPropagation()
                          selectClip(layer.id)
                          return
                        }
                        if (isText) beginDrag(e, layer, 'move', 'text')
                        else {
                          e.preventDefault()
                          e.stopPropagation()
                          selectClip(layer.id)
                        }
                      }}
                      onPointerMove={onPointerMove}
                      onPointerUp={endDrag}
                      onPointerCancel={endDrag}
                    >
                      {canTrim && (
                        <button
                          type="button"
                          aria-label="Trim in"
                          className="gs-tl-clip-handle gs-tl-clip-handle-in"
                          onPointerDown={(e) => {
                            if (isText) beginDrag(e, layer, 'in', 'text')
                          }}
                          onPointerMove={onPointerMove}
                          onPointerUp={endDrag}
                          onPointerCancel={endDrag}
                        />
                      )}
                      <span className="gs-tl-clip-label">{layer.name}</span>
                      {canTrim && (
                        <button
                          type="button"
                          aria-label="Trim out"
                          className="gs-tl-clip-handle gs-tl-clip-handle-out"
                          onPointerDown={(e) => {
                            if (isText) beginDrag(e, layer, 'out', 'text')
                          }}
                          onPointerMove={onPointerMove}
                          onPointerUp={endDrag}
                          onPointerCancel={endDrag}
                        />
                      )}
                    </div>

                    {/* Start / end keyframe diamonds */}
                    <KeyframeDiamond
                      pct={inPct}
                      color={isSelected ? '#2dd4bf' : '#c8c8c8'}
                      title={`In ${layer.clipIn.toFixed(2)}s`}
                      selected={isSelected}
                      onPointerDown={(e) => { e.stopPropagation(); selectClip(layer.id) }}
                    />
                    <KeyframeDiamond
                      pct={Math.min(100, inPct + widthPct)}
                      color={isSelected ? '#2dd4bf' : '#c8c8c8'}
                      title={`Out ${layer.clipOut.toFixed(2)}s`}
                      selected={isSelected}
                      onPointerDown={(e) => { e.stopPropagation(); selectClip(layer.id) }}
                    />
                  </div>

                  {expanded[layer.id] && layer.properties?.map((prop) => (
                    <div key={prop.id || prop.name} className={cn('gs-tl-track-row gs-tl-track-prop', isSelected && 'is-selected')}>
                      <div className="gs-tl-prop-track-line" style={{ background: `${prop.color}44` }} />
                      {/* Property keyframes at start/end */}
                      <KeyframeDiamond
                        pct={inPct}
                        color={prop.color}
                        title={`${prop.name} @ ${layer.clipIn.toFixed(2)}s`}
                        onPointerDown={(e) => { e.stopPropagation(); selectClip(layer.id) }}
                      />
                      <KeyframeDiamond
                        pct={Math.min(100, inPct + widthPct)}
                        color={prop.color}
                        title={`${prop.name} @ ${layer.clipOut.toFixed(2)}s`}
                        onPointerDown={(e) => { e.stopPropagation(); selectClip(layer.id) }}
                      />
                    </div>
                  ))}
                </div>
              )
            })}

            <div className="gs-tl-playhead-line" style={{ left: `${playheadPct}%` }} />
          </div>
        </div>
      </div>

      <div className="gs-tl-timeline-footer">
        <button
          type="button"
          className="gs-tl-footer-btn"
          onClick={() => { setPlaying(false); setProgress(0, { force: true }); draw(0) }}
        >
          0s
        </button>
        <span className="gs-tl-footer-time">
          {Math.round(progress * totalFrames)}f / {totalFrames}f
        </span>
        <span className="gs-tl-footer-time">
          {(progress * displayDuration).toFixed(1)}s / {displayDuration.toFixed(1)}s
        </span>
        <span className="gs-tl-footer-fps">{fps} fps · one timeline</span>
      </div>
    </div>
  )
}

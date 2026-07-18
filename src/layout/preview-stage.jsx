import { Crosshair, ImagePlus, Info, Pause, Play } from 'lucide-react'
import { Button, CanvasViewport, SelectionPath, StageHint, Switch, TransformBox, ZoomControls } from '../components/ui'
import { EffectTimeline } from '../components/studio/effect-timeline'
import { fmtBytes, MAX_CANVAS } from '../lib/format'
import { useStudio } from '../context/studio-provider'
import { cn } from '../lib/cn'

export function PreviewStage() {
  const {
    stageRef, stageStyle, startSelection, moveSelection, finishSelection,
    selectMode, selectionTool, completePathSelection, canvasRef, image, selection,
    selectionPoints, smoothSelectionPath, maskEditing, playing, elements, selectedElement,
    textLayers, textBounds, beginTextDrag, dragTextLayer,
    endTextDrag, selectedText, setSelectionPoints, cancelSelection, censorSelecting,
    setPlaying, progress, setProgress, actualDuration, frames, draw, frameDelays, actualFps,
    settings, setSettings, update, source, memory, canvasZoom, imageEdits,
    baseImageSelected, imageLocked, imageTransformBox, selectBaseImage, selectStageElement,
    toggleImageLock, toggleElementLock, beginTransform, moveTransform, endTransform,
    clearLayerSelection, selectedElements, setSelectedText,
    beginAnchorDrag, moveAnchorDrag, endAnchorDrag,
    overlays, selectedOverlay, selectStageOverlay, overlayBounds,
    activeTab,
  } = useStudio()

  const canSelectLayers = activeTab === 'motion'
  const interacting = selectMode || maskEditing || censorSelecting
  const selectedEl = elements.find((el) => el.id === selectedElement)
  const selectedOv = overlays.find((ov) => ov.id === selectedOverlay)
  const multiSelect = selectedElements.length >= 2
  const showOffCanvasGhost = canSelectLayers && baseImageSelected && Boolean(image) && !playing && !selectMode && !maskEditing

  // Anchor only when a single layer is selected (base image, element, or overlay).
  const showMotionAnchor = canSelectLayers && !playing && !selectMode && !maskEditing && !censorSelecting && (
    baseImageSelected
    || (Boolean(selectedOv) && !multiSelect)
    || (Boolean(selectedEl) && !multiSelect && selectedElements.length === 1)
  )

  let anchorLeft = 50
  let anchorTop = 50
  if (baseImageSelected) {
    anchorLeft = settings.anchorX ?? 50
    anchorTop = settings.anchorY ?? 50
  } else if (selectedEl && selectedElements.length === 1) {
    anchorLeft = (selectedEl.x + ((selectedEl.anchorX ?? 50) / 100) * selectedEl.w) * 100
    anchorTop = (selectedEl.y + ((selectedEl.anchorY ?? 50) / 100) * selectedEl.h) * 100
  } else if (selectedOv) {
    const box = overlayBounds(selectedOv)
    anchorLeft = (box.x + ((selectedOv.anchorX ?? 50) / 100) * box.w) * 100
    anchorTop = (box.y + ((selectedOv.anchorY ?? 50) / 100) * box.h) * 100
  }

  const atOriginalView = (
    canvasZoom.zoom === 100
    && canvasZoom.pan.x === 0
    && canvasZoom.pan.y === 0
    && settings.fit === 'Original size'
    && (!source.width || (settings.width === source.width && settings.height === source.height))
    && settings.scaleStart === 100 && settings.scaleEnd === 100
    && settings.xStart === 0 && settings.xEnd === 0
    && settings.yStart === 0 && settings.yEnd === 0
  )

  const centerCanvasAndImage = () => {
    canvasZoom.reset()
    setSettings((current) => {
      const next = {
        ...current,
        fit: 'Original size',
        scaleStart: 100,
        scaleEnd: 100,
        xStart: 0,
        xEnd: 0,
        yStart: 0,
        yEnd: 0,
      }
      if (
        source.width > 0
        && source.height > 0
        && source.width <= MAX_CANVAS
        && source.height <= MAX_CANVAS
      ) {
        next.width = source.width
        next.height = source.height
      }
      return next
    })
  }

  const clearSelection = () => {
    clearLayerSelection()
    setSelectedText(null)
  }

  const onStagePointerDown = (event) => {
    if (!canSelectLayers) return
    if (interacting) {
      startSelection(event)
      return
    }
    // Click empty stage → select base image (unless locked / hitting a layer).
    if (event.target === event.currentTarget || event.target === canvasRef.current) {
      if (!imageLocked) selectBaseImage()
      else clearSelection()
    }
  }

  return (
    <section data-canvas-stage className="relative flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden bg-stage">
      <div className="flex h-12 shrink-0 items-center justify-between border-b border-white/[.06] px-4 md:px-5">
        <div className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-[.15em] text-zinc-600">
          <span className="h-1.5 w-1.5 rounded-full bg-acid" />Live preview
        </div>
        <div className="flex items-center gap-3">
          <Switch
            label="Ping-pong"
            checked={settings.pingPong}
            onChange={(v) => update('pingPong', v)}
            className="justify-start gap-2 text-[10px] font-bold uppercase tracking-[.15em] text-zinc-600"
          />
          <button
            type="button"
            title="Center canvas & image · 100% zoom · original size"
            onClick={centerCanvasAndImage}
            className={cn(
              'gs-chip focus-ring gap-1.5 text-[10px] font-bold uppercase tracking-[.12em]',
              !atOriginalView && 'is-active',
            )}
          >
            <Crosshair className="h-3.5 w-3.5" />
            <span className="hidden sm:inline">Center</span>
          </button>
          <ZoomControls
            zoom={canvasZoom.zoom}
            onZoomChange={canvasZoom.setZoom}
            onZoomIn={canvasZoom.zoomIn}
            onZoomOut={canvasZoom.zoomOut}
            onFit={canvasZoom.fit}
            onReset={canvasZoom.reset}
            onFullscreen={canvasZoom.toggleFullscreen}
            isFullscreen={canvasZoom.isFullscreen}
          />
        </div>
      </div>

      <CanvasViewport
        zoomApi={canvasZoom}
        contentWidth={settings.width}
        contentHeight={settings.height}
        panEnabled
        className="min-h-[360px] p-0"
        onBackgroundPointerDown={() => {
          if (!interacting) clearSelection()
        }}
      >
        <div
          ref={stageRef}
          style={stageStyle}
          onPointerDown={onStagePointerDown}
          onPointerMove={(e) => { moveAnchorDrag(e); moveTransform(e); moveSelection(e) }}
          onPointerUp={(e) => { endAnchorDrag(e); endTransform(e); finishSelection(e) }}
          onDoubleClick={() => {
            if (selectMode && (selectionTool === 'Polygonal Lasso' || selectionTool === 'Pen Path')) completePathSelection()
          }}
          className={cn(
            'card-shadow relative h-full w-full rounded-[4px] ring-1 ring-white/10',
            showOffCanvasGhost ? 'overflow-visible' : 'overflow-hidden',
            interacting && 'cursor-crosshair ring-2 ring-acid',
            canvasZoom.spaceDown && 'cursor-grab',
          )}
        >
          {/* Off-canvas ghost: 50% opacity outside the artboard while transforming */}
          {showOffCanvasGhost && (
            <img
              src={image.src}
              alt=""
              draggable={false}
              className="pointer-events-none absolute z-0 max-w-none select-none"
              style={{
                left: `${imageTransformBox.x * 100}%`,
                top: `${imageTransformBox.y * 100}%`,
                width: `${imageTransformBox.w * 100}%`,
                height: `${imageTransformBox.h * 100}%`,
                opacity: 0.5,
                objectFit: 'fill',
                transform: `rotate(${imageTransformBox.rotation}deg) scale(${imageEdits.flipX ? -1 : 1}, ${imageEdits.flipY ? -1 : 1})`,
                transformOrigin: 'center center',
              }}
            />
          )}
          <canvas ref={canvasRef} className="relative z-[1] block h-full w-full" />
          {!image && (
            <div className="absolute inset-0 z-10 grid place-items-center bg-zinc-900">
              <ImagePlus className="h-8 w-8 text-zinc-700" />
            </div>
          )}
          {selection && selectionTool === 'Rectangle' && (
            <div
              className="pointer-events-none absolute z-10 border-2 border-acid bg-acid/10 shadow-[0_0_0_9999px_rgba(0,0,0,.38)]"
              style={{ left: `${selection.x * 100}%`, top: `${selection.y * 100}%`, width: `${selection.w * 100}%`, height: `${selection.h * 100}%` }}
            />
          )}
          {selectMode && selectionPoints.length > 0 && (
            <SelectionPath points={selectionPoints} tool={selectionTool} smoothPath={smoothSelectionPath} />
          )}

          {/* Overlays — click to select only on Motion */}
          {canSelectLayers && !selectMode && !maskEditing && !playing && overlays.filter((ov) => ov.visible).map((overlay, stackIndex) => {
            const box = overlayBounds(overlay)
            const selected = selectedOverlay === overlay.id
            return (
              <button
                key={overlay.id}
                type="button"
                onPointerDown={(e) => {
                  e.stopPropagation()
                  selectStageOverlay(overlay.id, e)
                }}
                title={overlay.name}
                className={cn(
                  'absolute border transition',
                  selected
                    ? 'border-acid shadow-[0_0_0_1px_rgb(var(--primary_accent-rgb))] cursor-move'
                    : 'border-transparent hover:border-white/40 cursor-pointer',
                )}
                style={{
                  left: `${box.x * 100}%`,
                  top: `${box.y * 100}%`,
                  width: `${box.w * 100}%`,
                  height: `${box.h * 100}%`,
                  transform: `rotate(${box.rotation}deg)`,
                  zIndex: 9 + stackIndex,
                }}
              >
                {selected && (
                  <span className="absolute -left-px -top-5 rounded-t bg-black/70 px-1.5 py-0.5 text-[8px] font-bold text-zinc-300">
                    {overlay.name}
                  </span>
                )}
              </button>
            )
          })}

          {canSelectLayers && !selectMode && !maskEditing && !playing && elements.map((el, stackIndex) => {
            const selected = selectedElements.includes(el.id)
            const multi = selectedElements.length >= 2
            const isPrimary = selected && el.id === selectedElement
            return (
              <button
                key={el.id}
                type="button"
                onPointerDown={(e) => {
                  e.stopPropagation()
                  selectStageElement(el.id, e)
                }}
                title={el.locked ? `${el.name} (locked)` : el.name}
                className={cn(
                  'absolute border transition',
                  selected
                    ? isPrimary || !multi
                      ? 'border-acid shadow-[0_0_0_1px_rgb(var(--primary_accent-rgb))]'
                      : 'border-acid/50 shadow-[0_0_0_1px_rgb(var(--primary_accent-rgb)/.35)]'
                    : el.locked
                      ? 'border-amber-400/50 border-dashed'
                      : 'border-transparent hover:border-white/40',
                  !el.visible && 'opacity-30',
                  el.locked ? 'cursor-not-allowed' : selected ? 'cursor-move' : 'cursor-pointer',
                )}
                style={{
                  left: `${el.x * 100}%`,
                  top: `${el.y * 100}%`,
                  width: `${el.w * 100}%`,
                  height: `${el.h * 100}%`,
                  transform: `rotate(${el.rotation}deg)`,
                  zIndex: 20 + stackIndex,
                }}
              >
                {selected && (
                  <span className="absolute -left-px -top-5 rounded-t bg-black/70 px-1.5 py-0.5 text-[8px] font-bold text-zinc-300">
                    {el.locked ? 'Locked · ' : ''}
                    {multi ? (isPrimary ? 'Primary · ' : 'Secondary · ') : ''}
                    {el.name}
                  </span>
                )}
              </button>
            )
          })}

          {activeTab === 'text' && !selectMode && !maskEditing && !playing && textLayers.filter((layer) => layer.visible).map((layer) => {
            const box = textBounds(layer)
            return (
              <button
                key={layer.id}
                type="button"
                onPointerDown={(e) => beginTextDrag(e, layer)}
                onPointerMove={dragTextLayer}
                onPointerUp={endTextDrag}
                title={layer.locked ? `${layer.name} (locked)` : 'Drag to position text'}
                className={`absolute z-10 border border-dashed transition ${selectedText === layer.id ? 'border-acid bg-acid/[.04]' : layer.locked ? 'cursor-not-allowed border-amber-400/50' : 'cursor-move border-white/30 hover:border-acid/70'}`}
                style={{ left: `${box.left}%`, top: `${box.top}%`, width: `${box.width}%`, height: `${box.height}%`, transform: `rotate(${layer.rotation}deg)` }}
              >
                <span className="absolute -left-px -top-5 rounded-t bg-black/70 px-1.5 py-0.5 text-[8px] font-bold text-zinc-300">
                  {layer.locked ? 'Locked · ' : ''}{layer.name}
                </span>
              </button>
            )
          })}

          {canSelectLayers && !selectMode && !maskEditing && !playing && baseImageSelected && image && (
            <TransformBox
              x={imageTransformBox.x}
              y={imageTransformBox.y}
              w={imageTransformBox.w}
              h={imageTransformBox.h}
              rotation={imageTransformBox.rotation}
              locked={imageLocked}
              label={imageLocked ? 'Image · locked' : 'Image'}
              onToggleLock={toggleImageLock}
              onPointerDownMove={(event) => beginTransform(event, {
                kind: 'image',
                mode: 'move',
                origin: {},
              })}
              onPointerDownHandle={(event, handle) => beginTransform(event, {
                kind: 'image',
                mode: `resize-${handle}`,
                origin: {
                  scale: (settings.scaleStart + settings.scaleEnd) / 2,
                  scaleStart: settings.scaleStart,
                  scaleEnd: settings.scaleEnd,
                },
              })}
              onPointerDownRotate={(event) => {
                const box = imageTransformBox
                const bounds = stageRef.current.getBoundingClientRect()
                const cx = (box.x + box.w / 2) * bounds.width
                const cy = (box.y + box.h / 2) * bounds.height
                const startAngle = Math.atan2(event.clientY - bounds.top - cy, event.clientX - bounds.left - cx) * 180 / Math.PI
                beginTransform(event, {
                  kind: 'image',
                  mode: 'rotate',
                  origin: {
                    box,
                    startAngle,
                    rotateStart: settings.rotateStart,
                    rotateEnd: settings.rotateEnd,
                  },
                })
              }}
            />
          )}

          {canSelectLayers && !selectMode && !maskEditing && !playing && !multiSelect && selectedEl && (
            <TransformBox
              x={selectedEl.x}
              y={selectedEl.y}
              w={selectedEl.w}
              h={selectedEl.h}
              rotation={selectedEl.rotation}
              locked={Boolean(selectedEl.locked)}
              label={selectedEl.locked ? `${selectedEl.name} · locked` : selectedEl.name}
              onToggleLock={() => toggleElementLock(selectedEl.id)}
              onPointerDownMove={(event) => beginTransform(event, {
                kind: 'element',
                id: selectedEl.id,
                mode: 'move',
                origin: { x: selectedEl.x, y: selectedEl.y, w: selectedEl.w, h: selectedEl.h, rotation: selectedEl.rotation },
              })}
              onPointerDownHandle={(event, handle) => beginTransform(event, {
                kind: 'element',
                id: selectedEl.id,
                mode: `resize-${handle}`,
                origin: { x: selectedEl.x, y: selectedEl.y, w: selectedEl.w, h: selectedEl.h, rotation: selectedEl.rotation },
              })}
              onPointerDownRotate={(event) => {
                const bounds = stageRef.current.getBoundingClientRect()
                const cx = (selectedEl.x + selectedEl.w / 2) * bounds.width
                const cy = (selectedEl.y + selectedEl.h / 2) * bounds.height
                const startAngle = Math.atan2(event.clientY - bounds.top - cy, event.clientX - bounds.left - cx) * 180 / Math.PI
                beginTransform(event, {
                  kind: 'element',
                  id: selectedEl.id,
                  mode: 'rotate',
                  origin: { x: selectedEl.x, y: selectedEl.y, w: selectedEl.w, h: selectedEl.h, rotation: selectedEl.rotation, startAngle },
                })
              }}
            />
          )}

          {canSelectLayers && !selectMode && !maskEditing && !playing && selectedOv && (
            <TransformBox
              x={overlayBounds(selectedOv).x}
              y={overlayBounds(selectedOv).y}
              w={overlayBounds(selectedOv).w}
              h={overlayBounds(selectedOv).h}
              rotation={overlayBounds(selectedOv).rotation}
              label={selectedOv.name}
              onPointerDownMove={(event) => beginTransform(event, {
                kind: 'overlay',
                id: selectedOv.id,
                mode: 'move',
                origin: { x: selectedOv.x, y: selectedOv.y },
              })}
              onPointerDownHandle={(event, handle) => beginTransform(event, {
                kind: 'overlay',
                id: selectedOv.id,
                mode: `resize-${handle}`,
                origin: { width: selectedOv.width },
              })}
              onPointerDownRotate={(event) => {
                const box = overlayBounds(selectedOv)
                const bounds = stageRef.current.getBoundingClientRect()
                const cx = (box.x + box.w / 2) * bounds.width
                const cy = (box.y + box.h / 2) * bounds.height
                const startAngle = Math.atan2(event.clientY - bounds.top - cy, event.clientX - bounds.left - cx) * 180 / Math.PI
                beginTransform(event, {
                  kind: 'overlay',
                  id: selectedOv.id,
                  mode: 'rotate',
                  origin: { box, rotation: selectedOv.rotation, startAngle },
                })
              }}
            />
          )}

          {selectMode && !selection && selectionPoints.length === 0 && (
            <StageHint>
              {selectionTool === 'Rectangle'
                ? 'Drag a box around the object'
                : selectionTool === 'Freehand Lasso'
                  ? 'Draw around the object continuously'
                  : 'Click to place selection anchors'}
            </StageHint>
          )}
          {selectMode && (selectionTool === 'Polygonal Lasso' || selectionTool === 'Pen Path') && selectionPoints.length > 0 && (
            <div
              className="absolute bottom-3 left-1/2 z-20 flex -translate-x-1/2 gap-2 rounded-xl border border-white/10 bg-black/80 p-2 shadow-xl backdrop-blur"
              onPointerDown={(event) => event.stopPropagation()}
            >
              <Button size="sm" className="rounded-lg text-[9px] font-bold" onClick={() => setSelectionPoints((points) => points.slice(0, -1))}>Undo point</Button>
              <Button variant="primary" size="sm" className="rounded-lg text-[9px] font-bold" disabled={selectionPoints.length < 3} onClick={completePathSelection}>Complete</Button>
              <Button size="sm" className="rounded-lg text-[9px] font-bold" onClick={cancelSelection}>Cancel</Button>
            </div>
          )}
          {censorSelecting && !selection && <StageHint>Drag over the area to censor</StageHint>}

          {showMotionAnchor && (
            <button
              type="button"
              title="Anchor point — drag to set pivot"
              aria-label="Anchor point"
              className="gs-motion-anchor"
              style={{ left: `${anchorLeft}%`, top: `${anchorTop}%` }}
              onPointerDown={beginAnchorDrag}
              onPointerMove={moveAnchorDrag}
              onPointerUp={endAnchorDrag}
              onPointerCancel={endAnchorDrag}
            >
              <span className="gs-motion-anchor__ring" />
              <span className="gs-motion-anchor__x" />
              <span className="gs-motion-anchor__y" />
              <span className="gs-motion-anchor__dot" />
            </button>
          )}
        </div>
      </CanvasViewport>

      <div className="max-h-[38vh] shrink-0 overflow-y-auto border-t border-white/[.07] bg-panel px-4 pb-4 pt-3 scrollbar md:px-6">
        <div className="mb-3 flex items-center gap-3">
          <button
            type="button"
            onClick={() => setPlaying(!playing)}
            className="focus-ring grid h-9 w-9 shrink-0 place-items-center rounded-full bg-white text-black transition hover:scale-105"
          >
            {playing ? <Pause className="h-4 w-4 fill-current" /> : <Play className="ml-0.5 h-4 w-4 fill-current" />}
          </button>
          <span className="w-11 text-right font-mono text-[10px] text-zinc-500">{(progress * actualDuration).toFixed(1)}s</span>
          <input
            aria-label="Timeline"
            type="range"
            min="0"
            max={frames - 1}
            step="1"
            value={Math.round(progress * frames)}
            onChange={(e) => {
              const t = Number(e.target.value) / frames
              setPlaying(false)
              setProgress(t)
              draw(t)
            }}
            className="gs-range"
          />
          <span className="w-11 font-mono text-[10px] text-zinc-500">{actualDuration.toFixed(1)}s</span>
        </div>

        {activeTab === 'timeline' && <EffectTimeline />}

        <div className="mt-3 flex items-center justify-between gap-4 border-t border-white/[.05] pt-3 text-[10px] text-zinc-600">
          <div className="flex gap-4">
            <span><b className="text-zinc-400">{frames}</b> frames</span>
            <span title={`GIF delays: ${[...new Set(frameDelays)].join('/')} ms`}>
              <b className="text-zinc-400">{actualFps.toFixed(2)}</b> real fps
            </span>
            <span className="hidden sm:inline">
              <b className="text-zinc-400">{settings.width} × {settings.height}</b> px
            </span>
          </div>
          <div className={`flex items-center gap-1.5 ${memory > 1.8e9 ? 'text-red-400' : ''}`}>
            <Info className="h-3.5 w-3.5" /> {fmtBytes(memory)} render memory
          </div>
        </div>
      </div>
    </section>
  )
}

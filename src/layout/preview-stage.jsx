import { Crosshair, ImagePlus, Info, Pause, Play } from 'lucide-react'
import { useMemo } from 'react'
import { Button, CanvasViewport, StageHint, Switch, ZoomControls } from '../components/ui'
import { EffectTimeline } from '../components/studio/effect-timeline'
import { StudioKonvaStage } from '../engine/konva-editor'
import { fmtBytes, MAX_CANVAS, nice, clampNice } from '../lib/format'
import { useStudio } from '../context/studio-provider'
import { cn } from '../lib/cn'

export function PreviewStage() {
  const {
    stageRef, stageStyle, startSelection, moveSelection, finishSelection,
    selectMode, selectionTool, completePathSelection, canvasRef, pixiCanvasRef, image, selection,
    selectionPoints, maskEditing, playing, elements, selectedElement,
    textLayers, textBounds, selectedText, setSelectionPoints, cancelSelection, censorSelecting,
    setPlaying, progress, setProgress, actualDuration, frames, draw, frameDelays, actualFps,
    settings, setSettings, update, source, memory, canvasZoom, imageEdits,
    baseImageSelected, imageLocked, imageTransformBox, selectBaseImage, selectStageElement,
    clearLayerSelection, selectedElements, setSelectedText,
    beginAnchorDrag, moveAnchorDrag, endAnchorDrag,
    overlays, selectedOverlay, selectStageOverlay, overlayBounds,
    activeTab, updateElementById, updateOverlayById, updateTextById, goToWorkspace,
    gpuPreview, poseRig,
  } = useStudio()

  const canSelectLayers = activeTab === 'motion' || activeTab === 'text'
  const interacting = selectMode || maskEditing || censorSelecting
  const showKonva = Boolean(image) && !playing
  const showPixi = Boolean(image) && playing && gpuPreview
  const selectedEl = elements.find((el) => el.id === selectedElement)

  const selectedKind = useMemo(() => {
    if (selectedText != null) return 'text'
    if (selectedOverlay != null) return 'overlay'
    if (selectedElements.length) return 'element'
    if (baseImageSelected) return 'image'
    return null
  }, [selectedText, selectedOverlay, selectedElements, baseImageSelected])

  const selectedId = selectedText ?? selectedOverlay ?? selectedElement ?? null

  const atOriginalView = (
    canvasZoom.zoom === 100
    && canvasZoom.pan.x === 0
    && canvasZoom.pan.y === 0
    && settings.fit === 'Original size'
    && (!source?.width || (settings.width === source.width && settings.height === source.height))
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
        source?.width > 0
        && source?.height > 0
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
    if (!interacting) return
    startSelection(event)
  }

  const handleKonvaSelect = ({ kind, id, additive }) => {
    if (interacting || playing) return
    if (kind === 'image') {
      if (!imageLocked) selectBaseImage()
      else clearSelection()
      return
    }
    if (kind === 'element') {
      selectStageElement(id, { metaKey: additive, ctrlKey: additive, shiftKey: additive, stopPropagation() {} })
      return
    }
    if (kind === 'overlay') {
      selectStageOverlay(id)
      return
    }
    if (kind === 'text') {
      setSelectedText(id)
      clearLayerSelection()
      goToWorkspace('text')
    }
  }

  const handleImageTransform = ({ centerX, centerY, boxW, boxH, rotation }) => {
    // Reverse imageTransformBox at t≈progress: derive offsets + scale from fitted unscaled size.
    const iw = source?.width || settings.width
    const ih = source?.height || settings.height
    const fit = settings.fit
    let udw
    let udh
    if (fit === 'Stretch') {
      udw = 1
      udh = 1
    } else if (fit === 'Original size') {
      udw = iw / settings.width
      udh = ih / settings.height
    } else {
      const contain = Math.min(settings.width / iw, settings.height / ih)
      const cover = Math.max(settings.width / iw, settings.height / ih)
      const base = fit === 'Cover' ? cover : contain
      udw = (iw * base) / settings.width
      udh = (ih * base) / settings.height
    }
    const scalePct = clampNice((boxW / Math.max(0.02, udw)) * 100, 5, 400, 1)
    const xOff = nice((centerX - 0.5) * 100, 1)
    const yOff = nice((centerY - 0.5) * 100, 1)
    const rot = nice(rotation - (imageEdits.rotation || 0), 1)
    setSettings((s) => ({
      ...s,
      xStart: xOff,
      xEnd: xOff,
      yStart: yOff,
      yEnd: yOff,
      scaleStart: scalePct,
      scaleEnd: scalePct,
      rotateStart: rot,
      rotateEnd: rot,
    }))
  }

  let anchorLeft = 50
  let anchorTop = 50
  if (baseImageSelected) {
    anchorLeft = settings.anchorX ?? 50
    anchorTop = settings.anchorY ?? 50
  } else if (selectedEl && selectedElements.length === 1) {
    anchorLeft = (selectedEl.x + ((selectedEl.anchorX ?? 50) / 100) * selectedEl.w) * 100
    anchorTop = (selectedEl.y + ((selectedEl.anchorY ?? 50) / 100) * selectedEl.h) * 100
  } else if (selectedOverlay) {
    const ov = overlays.find((o) => o.id === selectedOverlay)
    if (ov) {
      const box = overlayBounds(ov)
      anchorLeft = (box.x + ((ov.anchorX ?? 50) / 100) * box.w) * 100
      anchorTop = (box.y + ((ov.anchorY ?? 50) / 100) * box.h) * 100
    }
  }

  const showMotionAnchor = canSelectLayers && !playing && !interacting && (
    baseImageSelected
    || (Boolean(selectedOverlay) && selectedElements.length < 2)
    || (Boolean(selectedEl) && selectedElements.length === 1)
  )

  return (
    <section data-canvas-stage className="relative flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden bg-stage">
      <div className="flex h-12 shrink-0 items-center justify-between border-b border-white/[.06] px-4 md:px-5">
        <div className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-[.15em] text-zinc-600">
          <span className="h-1.5 w-1.5 rounded-full bg-acid" />
          {showKonva ? 'Konva editor' : 'Live preview'}
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
          onPointerMove={(e) => { moveAnchorDrag(e); moveSelection(e) }}
          onPointerUp={(e) => { endAnchorDrag(e); finishSelection(e) }}
          onDoubleClick={() => {
            if (selectMode && (selectionTool === 'Polygonal Lasso' || selectionTool === 'Pen Path')) completePathSelection()
          }}
          className={cn(
            'card-shadow relative h-full w-full rounded-[4px] ring-1 ring-white/10 overflow-hidden',
            interacting && 'cursor-crosshair ring-2 ring-acid',
            canvasZoom.spaceDown && 'cursor-grab',
          )}
        >
          {/* Offscreen / play renderer — export & GSAP playback still use canvas 2D + effects */}
          <canvas
            ref={canvasRef}
            className={cn(
              'absolute inset-0 z-[1] block h-full w-full',
              showKonva && !interacting ? 'pointer-events-none opacity-0' : 'relative opacity-100',
            )}
          />

          {gpuPreview && (
            <canvas
              ref={pixiCanvasRef}
              className={cn(
                'absolute inset-0 z-[2] block h-full w-full pointer-events-none',
                showPixi ? 'opacity-100' : 'opacity-0',
              )}
              width={settings.width}
              height={settings.height}
            />
          )}

          {showKonva && (
            <div className={cn('absolute inset-0 z-[2]', interacting && 'pointer-events-none opacity-40')}>
              <StudioKonvaStage
                width={settings.width}
                height={settings.height}
                sourceUrl={source?.url}
                imageTransformBox={imageTransformBox}
                imageLocked={imageLocked}
                imageEdits={imageEdits}
                background={settings.background}
                transparent={settings.transparent}
                elements={elements}
                overlays={overlays}
                textLayers={textLayers}
                selectedKind={selectedKind}
                selectedId={selectedId}
                selectedIds={selectedElements}
                interactive={!interacting && canSelectLayers}
                selection={interacting ? selection : null}
                selectionPoints={interacting ? selectionPoints : []}
                poseJoints={poseRig.joints || []}
                showPose={Boolean(poseRig.visible && poseRig.joints?.length)}
                overlayBounds={overlayBounds}
                textBounds={textBounds}
                onSelect={handleKonvaSelect}
                onTransformImage={handleImageTransform}
                onTransformElement={(id, patch) => {
                  Object.entries(patch).forEach(([key, value]) => updateElementById(id, key, value))
                }}
                onTransformOverlay={(id, patch) => updateOverlayById(id, patch)}
                onTransformText={(id, patch) => updateTextById?.(id, patch)}
              />
            </div>
          )}

          {!image && (
            <div className="absolute inset-0 z-10 grid place-items-center bg-zinc-900 px-6 text-center">
              <div>
                <ImagePlus className="mx-auto h-8 w-8 text-zinc-700" />
                <p className="mt-3 text-[12px] font-medium text-zinc-500">Open or drop a PNG, JPG, GIF, or MP4 to start</p>
              </div>
            </div>
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
            value={Math.min(frames - 1, Math.max(0, Math.round(progress * frames)))}
            onChange={(e) => {
              const t = Number(e.target.value) / frames
              setPlaying(false)
              setProgress(t, { force: true })
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

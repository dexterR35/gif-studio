import { Crosshair, ImagePlus } from 'lucide-react'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { Button, CanvasViewport, StageHint, ZoomControls } from '../components/ui'
import { ContextualTaskBar } from '../components/studio/contextual-task-bar'
import { StudioKonvaStage } from '../engine/konva-editor'
import { MAX_CANVAS, nice, clampNice } from '../lib/format'
import { useStudio } from '../context/studio-provider'
import { cn } from '../lib/cn'

export function PreviewStage() {
  const {
    stageRef, stageStyle, startSelection, moveSelection, finishSelection,
    selectMode, selectionTool, canvasRef, image, selection,
    selectionPoints, maskEditing, elements, selectedElement,
    textLayers, selectedText, setSelectionPoints, cancelSelection,
    applyKonvaSelection, selectionPurpose, pendingSelection,
    settings, setSettings, source, canvasZoom, imageEdits,
    baseImageSelected, imageLocked, imageTransformBox, selectBaseImage, selectStageElement,
    imageVisible, enhancedLayer, enhancedSelected, enhancedTransformBox, selectEnhancedLayer,
    clearLayerSelection, selectedElements, setSelectedText,
    beginAnchorDrag, moveAnchorDrag, endAnchorDrag,
    overlays, selectedOverlay, selectStageOverlay, overlayBounds,
    activeTab, updateElementById, updateOverlayById, updateTextById, goToWorkspace,
    setKonvaStageApi, konvaStageApiRef,
  } = useStudio()

  const canSelectLayers = activeTab === 'ai' || activeTab === 'text'
  const hasPendingCut = Boolean(pendingSelection?.rect)
  const interacting = selectMode || maskEditing || hasPendingCut
  const showKonva = Boolean(image)
  const selectedEl = elements.find((el) => el.id === selectedElement)
  const [viewportSize, setViewportSize] = useState(null)
  const [artboardView, setArtboardView] = useState({ x: 0, y: 0, scale: 1 })
  const onViewportResize = useCallback((size) => {
    setViewportSize((prev) => (
      prev && prev.width === size.width && prev.height === size.height ? prev : size
    ))
  }, [])

  // ZoomControls → Stage (preserve pan / center via setZoomPct).
  useEffect(() => {
    const api = konvaStageApiRef?.current
    if (!api?.setZoomPct) return
    const current = api.getZoomPan?.()?.zoomPct
    if (current != null && Math.abs(current - canvasZoom.zoom) < 1) return
    api.setZoomPct(canvasZoom.zoom)
  }, [canvasZoom.zoom, konvaStageApiRef])

  const handleKonvaZoomChange = useCallback((z, pan) => {
    if (Math.abs((canvasZoom.zoom || 100) - z) >= 1) canvasZoom?.setZoom?.(z)
    if (pan && (pan.x != null || pan.y != null)) {
      setArtboardView({
        x: pan.x,
        y: pan.y,
        scale: Math.max(0.05, (Number(z) || 100) / 100),
      })
    }
  }, [canvasZoom])

  const selectedKind = useMemo(() => {
    if (selectedText != null) return 'text'
    if (selectedOverlay != null) return 'overlay'
    if (selectedElements.length) return 'element'
    if (enhancedSelected) return 'enhanced'
    if (baseImageSelected) return 'image'
    return null
  }, [selectedText, selectedOverlay, selectedElements, enhancedSelected, baseImageSelected])

  const selectedId = selectedText ?? selectedOverlay ?? selectedElement ?? null

  const atOriginalView = (
    canvasZoom.zoom === 100
    && canvasZoom.pan.x === 0
    && canvasZoom.pan.y === 0
    && settings.fit === 'Original size'
    && (!source?.width || (settings.width === source.width && settings.height === source.height))
    && settings.scale === 100
    && settings.x === 0
    && settings.y === 0
  )

  const centerCanvasAndImage = () => {
    canvasZoom.reset()
    setSettings((current) => {
      const next = {
        ...current,
        fit: 'Original size',
        scale: 100,
        x: 0,
        y: 0,
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
    // Center artboard in the viewport (fit), not raw 1:1 at origin.
    setTimeout(() => {
      const api = konvaStageApiRef?.current
      if (api?.fit && viewportSize) api.fit(viewportSize.width, viewportSize.height)
      else api?.resetZoom?.()
    }, 0)
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
    if (interacting) return
    if (kind === 'image') {
      selectBaseImage()
      return
    }
    if (kind === 'enhanced') {
      selectEnhancedLayer()
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

  const handleImageTransform = ({ centerX, centerY, boxW, boxH, rotation, pivotX, pivotY }) => {
    // Reverse imageTransformBox: derive the static offsets and scale from fitted size.
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
      x: xOff,
      y: yOff,
      scale: scalePct,
      rotation: rot,
      ...(typeof pivotX === 'number' && typeof pivotY === 'number'
        ? { anchorX: nice(pivotX * 100, 1), anchorY: nice(pivotY * 100, 1) }
        : {}),
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

  const showTransformAnchor = canSelectLayers && !interacting && (
    baseImageSelected
    || (Boolean(selectedOverlay) && selectedElements.length < 2)
    || (Boolean(selectedEl) && selectedElements.length === 1)
  )

  return (
    <section data-canvas-stage className="relative flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden bg-stage">
      <div className="flex h-12 shrink-0 items-center justify-between border-b border-white/[.06] px-4 md:px-5">
        <div className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-[.15em] text-zinc-600">
          <span className="h-1.5 w-1.5 rounded-full bg-acid" />
          Canvas editor
        </div>
        <div className="flex items-center gap-3">
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
            onFit={() => {
              const api = konvaStageApiRef?.current
              if (api?.fit && viewportSize) api.fit(viewportSize.width, viewportSize.height)
              else if (api?.fit) api.fit()
              else canvasZoom.fit()
            }}
            onReset={() => {
              konvaStageApiRef?.current?.resetZoom?.()
              canvasZoom.reset()
            }}
            onFullscreen={canvasZoom.toggleFullscreen}
            isFullscreen={canvasZoom.isFullscreen}
          />
        </div>
      </div>

      <div className="relative flex min-h-0 flex-1 flex-col">
        {/* Photoshop-style contextual bar — centered 50% under Konva / preview top bar */}
        <ContextualTaskBar />
        <CanvasViewport
          zoomApi={canvasZoom}
          contentWidth={settings.width}
          contentHeight={settings.height}
          panEnabled={false}
          wheelEnabled={false}
          className="min-h-[360px] p-0"
          onViewportResize={onViewportResize}
          onBackgroundPointerDown={() => {
            if (!interacting) clearSelection()
          }}
        >
          <div className="absolute inset-0 overflow-hidden">
          {showKonva && (
            <div className={cn(
              'pointer-events-auto absolute inset-0 z-[2]',
              maskEditing && 'pointer-events-none opacity-40',
            )}
            >
              <StudioKonvaStage
                width={settings.width}
                height={settings.height}
                sourceUrl={source?.url}
                imageVisible={imageVisible}
                imageTransformBox={imageTransformBox}
                imageAnchor={{ x: settings.anchorX ?? 50, y: settings.anchorY ?? 50 }}
                imageLocked={imageLocked}
                imageEdits={imageEdits}
                enhancedUrl={enhancedLayer?.url}
                enhancedVisible={enhancedLayer?.visible !== false}
                enhancedTransformBox={enhancedTransformBox}
                background={settings.background}
                transparent={settings.transparent}
                elements={elements}
                overlays={overlays}
                textLayers={textLayers}
                selectedKind={selectedKind}
                selectedId={selectedId}
                selectedIds={selectedElements}
                interactive={!interacting && canSelectLayers}
                selectMode={selectMode}
                selectionTool={selectionTool}
                onSelectionComplete={applyKonvaSelection}
                onSelectionDraftChange={setSelectionPoints}
                spacePan={canvasZoom.spaceDown}
                viewportSize={viewportSize}
                imageFilters={settings.imageFilters || []}
                selection={interacting ? (pendingSelection?.rect || selection) : null}
                selectionPoints={interacting
                  ? (pendingSelection?.points?.length
                    ? pendingSelection.points
                    : selectionPoints)
                  : []}
                overlayBounds={overlayBounds}
                onStageApi={setKonvaStageApi}
                onZoomChange={handleKonvaZoomChange}
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

          <div
            ref={stageRef}
            style={showKonva ? {
              position: 'absolute',
              left: artboardView.x,
              top: artboardView.y,
              width: settings.width,
              height: settings.height,
              transform: `scale(${artboardView.scale})`,
              transformOrigin: '0 0',
            } : stageStyle}
            onPointerDown={(e) => {
              if (maskEditing || (selectMode && !showKonva)) onStagePointerDown(e)
            }}
            onPointerMove={(e) => {
              moveAnchorDrag(e)
              if (maskEditing || (selectMode && !showKonva)) moveSelection(e)
            }}
            onPointerUp={(e) => {
              endAnchorDrag(e)
              if (maskEditing || (selectMode && !showKonva)) finishSelection(e)
            }}
            className={cn(
              'card-shadow relative overflow-hidden rounded-[4px] ring-1 ring-white/10',
              showKonva ? 'z-[1]' : 'h-full w-full',
              showKonva && !maskEditing && 'pointer-events-none',
              interacting && 'cursor-crosshair ring-2 ring-acid',
              canvasZoom.spaceDown && 'cursor-grab',
            )}
          >
          {/* Offscreen renderer used for PNG output and pixel-based editing tools. */}
          <canvas
            ref={canvasRef}
            className={cn(
              'absolute inset-0 z-[1] block h-full w-full',
              showKonva && !interacting ? 'pointer-events-none opacity-0' : 'relative opacity-100',
            )}
          />

          {!image && (
            <div className="absolute inset-0 z-10 grid place-items-center bg-zinc-900 px-6 text-center">
              <div>
                <ImagePlus className="mx-auto h-8 w-8 text-zinc-700" />
                <p className="mt-3 text-[12px] font-medium text-zinc-500">Open or drop a PNG, JPG, or WEBP to start</p>
              </div>
            </div>
          )}

          {selectMode && !selection && !pendingSelection && selectionPoints.length === 0 && (
            <StageHint>
              {selectionPurpose === 'erase'
                ? (selectionTool === 'Rectangle'
                  ? 'Drag a box around what to remove — then press Cut'
                  : selectionTool === 'Freehand Lasso'
                    ? 'Draw around what to remove — then press Cut'
                    : 'Click anchors, Complete, then press Cut')
                : selectionTool === 'Rectangle'
                  ? 'Drag a box around the object'
                  : selectionTool === 'Freehand Lasso'
                    ? 'Draw around the object continuously'
                    : 'Click to place selection anchors'}
            </StageHint>
          )}
          {selectMode && !hasPendingCut && (selectionTool === 'Polygonal Lasso' || selectionTool === 'Pen Path') && (
            <div
              className="absolute bottom-3 left-1/2 z-20 flex -translate-x-1/2 gap-2 rounded-xl border border-white/10 bg-black/80 p-2 shadow-xl backdrop-blur"
              onPointerDown={(event) => event.stopPropagation()}
            >
              <Button size="sm" className="rounded-lg text-[9px] font-bold" onClick={() => konvaStageApiRef?.current?.undoSelectionPoint?.()}>Undo point</Button>
              <Button
                variant="primary"
                size="sm"
                className="rounded-lg text-[9px] font-bold"
                disabled={(selectionPoints?.length || 0) < 3}
                onClick={() => konvaStageApiRef?.current?.finishSelectionDraft?.()}
              >
                Complete
              </Button>
              <Button size="sm" className="rounded-lg text-[9px] font-bold" onClick={cancelSelection}>Cancel</Button>
            </div>
          )}
          {maskEditing && (
            <StageHint>
              Brush on the cutout — erase stray hair / hand; box shrinks when you release
            </StageHint>
          )}

          {showTransformAnchor && (
            <button
              type="button"
              title="Anchor point — drag to set pivot"
              aria-label="Anchor point"
              className="gs-transform-anchor"
              style={{ left: `${anchorLeft}%`, top: `${anchorTop}%` }}
              onPointerDown={beginAnchorDrag}
              onPointerMove={moveAnchorDrag}
              onPointerUp={endAnchorDrag}
              onPointerCancel={endAnchorDrag}
            >
              <span className="gs-transform-anchor__ring" />
              <span className="gs-transform-anchor__x" />
              <span className="gs-transform-anchor__y" />
              <span className="gs-transform-anchor__dot" />
            </button>
          )}

        </div>
          </div>
      </CanvasViewport>
      </div>

    </section>
  )
}

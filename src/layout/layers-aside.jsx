import { useEffect, useMemo, useRef, useState } from 'react'
import { Frame, ImageIcon, Layers3, Maximize2, Type, Shield, Grid3x3 } from 'lucide-react'
import { EmptyState, LayerRow } from '../components/ui'
import { useStudio } from '../context/studio-provider'
import { useStudioStore, getActiveProjectDocument } from '../store/studio-store'
import { buildUnifiedLayerList } from '../domain/layers/unified-layer-list'

/**
 * Third sidebar — Photoshop-style layers (front at top · drag to reorder).
 * When unifiedLayers is on, order comes from the active Project V2 document.
 */
export function LayersAside() {
  const elements = useStudioStore((s) => s.editor.elements)
  const overlays = useStudioStore((s) => s.editor.overlays)
  const textLayers = useStudioStore((s) => s.editor.textLayers)
  const enhancedLayer = useStudioStore((s) => s.editor.enhancedLayer)
  const project = useStudioStore((s) => s.project)
  const selectedElements = useStudioStore((s) => s.selection.selectedElements)
  const selectedOverlay = useStudioStore((s) => s.selection.selectedOverlay)
  const selectedText = useStudioStore((s) => s.selection.selectedText)
  const baseImageSelected = useStudioStore((s) => s.selection.baseImageSelected)
  const enhancedSelected = useStudioStore((s) => s.selection.enhancedSelected)
  const artboardSelected = useStudioStore((s) => s.selection.artboardSelected)
  const imageLocked = useStudioStore((s) => s.selection.imageLocked)
  const imageVisible = useStudioStore((s) => s.selection.imageVisible)
  const canvasLocked = useStudioStore((s) => s.selection.canvasLocked)
  const setImageVisible = useStudioStore((s) => s.setImageVisible)
  const setSelectedText = useStudioStore((s) => s.setSelectedText)
  const setSelectedOverlay = useStudioStore((s) => s.setSelectedOverlay)
  const setSelectMode = useStudioStore((s) => s.setSelectMode)
  const setMaskEditing = useStudioStore((s) => s.setMaskEditing)
  const setPlaying = useStudioStore((s) => s.setPlaying)

  const selectedElement = selectedElements.length ? selectedElements[selectedElements.length - 1] : null
  const activeDoc = useMemo(
    () => getActiveProjectDocument({ project }),
    [project],
  )
  const unified = activeDoc?.schemaVersion === 2

  const {
    selectLayer, selectBaseImage, toggleImageLock,
    selectEnhancedLayer, updateEnhancedLayer, removeEnhancedLayer,
    selectArtboard, toggleCanvasLock,
    toggleElementLock, toggleElementVisible, removeElement, reorderElement,
    selectOverlay, toggleOverlayVisible, removeOverlay, reorderOverlay,
    removeText, reorderText, toggleTextLock, updateText,
    goToWorkspace, clearLayerSelection,
  } = useStudio()

  const dragRef = useRef(null)
  const [dragState, setDragState] = useState(null)

  const unifiedRows = useMemo(() => (
    unified
      ? buildUnifiedLayerList(activeDoc, { elements, overlays, textLayers, enhancedLayer })
      : []
  ), [unified, activeDoc, elements, overlays, textLayers, enhancedLayer])

  const layerCount = unified
    ? unifiedRows.length
    : elements.length + overlays.length + textLayers.length + (enhancedLayer ? 1 : 0)

  const elementsFrontFirst = [...elements].reverse()
  const overlaysFrontFirst = [...overlays].reverse()
  const textFrontFirst = [...textLayers].reverse()

  const beginLayerDrag = (event, kind, id) => {
    event.preventDefault()
    event.stopPropagation()
    dragRef.current = { kind, id, overId: id }
    setDragState({ kind, id, overId: id })
    setSelectMode(false)
    setPlaying(false)
  }

  const moveLayerDrag = (event) => {
    const drag = dragRef.current
    if (!drag) return

    const hit = document.elementsFromPoint(event.clientX, event.clientY)
      .find((node) => (
        node instanceof Element
        && node.getAttribute('data-layer-kind') === drag.kind
        && node.getAttribute('data-layer-id')
      ))
    if (!hit) return

    const overId = hit.getAttribute('data-layer-id')
    if (!overId || overId === drag.id || overId === drag.overId) return

    drag.overId = overId
    if (drag.kind === 'element') reorderElement(drag.id, overId)
    if (drag.kind === 'overlay') reorderOverlay(drag.id, overId)
    if (drag.kind === 'text') reorderText(drag.id, overId)
    setDragState({ kind: drag.kind, id: drag.id, overId })
  }

  const endLayerDrag = () => {
    if (!dragRef.current) return
    dragRef.current = null
    setDragState(null)
  }

  useEffect(() => {
    if (!dragState) return undefined
    const onMove = (event) => moveLayerDrag(event)
    const onUp = () => endLayerDrag()
    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', onUp)
    window.addEventListener('pointercancel', onUp)
    return () => {
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onUp)
      window.removeEventListener('pointercancel', onUp)
    }
  }, [dragState?.kind, dragState?.id])

  const isDragging = (kind, id) => dragState?.kind === kind && dragState?.id === id
  const isDropTarget = (kind, id) => (
    dragState?.kind === kind && dragState?.overId === id && dragState?.id !== id
  )

  const renderUnifiedRow = (row) => {
    const kind = row.legacyKind
    if (kind === 'background') {
      return (
        <LayerRow
          key={row.id}
          selected={baseImageSelected}
          onClick={() => {
            selectBaseImage()
            setSelectMode(false)
            setMaskEditing(false)
          }}
          icon={ImageIcon}
          title="Background"
          subtitle={imageLocked ? 'Locked' : 'Base image'}
          visible={imageVisible !== false}
          onToggleVisible={() => setImageVisible((v) => !v)}
          locked={imageLocked}
          onToggleLock={toggleImageLock}
          className="!rounded-md !p-1.5"
        />
      )
    }
    if (kind === 'enhanced') {
      return (
        <LayerRow
          key={row.id}
          selected={enhancedSelected}
          onClick={() => {
            selectEnhancedLayer()
            setSelectMode(false)
            setMaskEditing(false)
            goToWorkspace('scale')
          }}
          icon={Maximize2}
          title={row.name}
          subtitle={`${row.subtitle} · rollback kept`}
          visible={row.visible}
          onToggleVisible={() => updateEnhancedLayer({ visible: enhancedLayer?.visible === false })}
          onRemove={removeEnhancedLayer}
          className="!rounded-md !p-1.5"
        />
      )
    }
    if (kind === 'text') {
      const layer = row.legacyEntity
      if (!layer) return null
      return (
        <LayerRow
          key={row.id}
          layerKind="text"
          layerId={layer.id}
          selected={selectedText === layer.id}
          onClick={() => {
            clearLayerSelection()
            setSelectedOverlay(null)
            setSelectedText(layer.id)
            setPlaying(false)
            setSelectMode(false)
            setMaskEditing(false)
            goToWorkspace('text')
          }}
          icon={Type}
          title={layer.text || 'Empty text'}
          subtitle="Text"
          visible={layer.visible}
          locked={layer.locked}
          onToggleVisible={() => updateText('visible', !layer.visible)}
          onToggleLock={() => toggleTextLock(layer.id)}
          onRemove={() => removeText(layer.id)}
          onDragStart={(e) => beginLayerDrag(e, 'text', layer.id)}
          onDragEnd={endLayerDrag}
          dragging={isDragging('text', layer.id)}
          dropTarget={isDropTarget('text', layer.id)}
          className="!rounded-md !p-1.5"
        />
      )
    }
    if (kind === 'element') {
      const el = row.legacyEntity
      if (!el) return null
      const selected = selectedElements.includes(el.id)
      const multi = selectedElements.length >= 2
      const role = selected && multi
        ? (el.id === selectedElement ? 'primary' : 'secondary')
        : null
      return (
        <LayerRow
          key={row.id}
          layerKind="element"
          layerId={el.id}
          selected={selected}
          role={role}
          onClick={(event) => {
            selectLayer(el.id, event)
            setSelectMode(false)
          }}
          thumb={(
            <span className="grid h-7 w-7 shrink-0 place-items-center overflow-hidden rounded checker ring-1 ring-white/[.08]">
              {el.bitmap?.toDataURL ? (
                <img src={el.bitmap.toDataURL()} alt="" className="max-h-full max-w-full" />
              ) : null}
            </span>
          )}
          title={el.name}
          subtitle={el.cutoutMode || el.motion || 'None'}
          visible={el.visible}
          locked={el.locked}
          onToggleVisible={() => toggleElementVisible(el.id)}
          onToggleLock={() => toggleElementLock(el.id)}
          onRemove={() => removeElement(el.id)}
          onDragStart={(e) => beginLayerDrag(e, 'element', el.id)}
          onDragEnd={endLayerDrag}
          dragging={isDragging('element', el.id)}
          dropTarget={isDropTarget('element', el.id)}
          className="!rounded-md !p-1.5"
        />
      )
    }
    if (kind === 'overlay') {
      const overlay = row.legacyEntity
      if (!overlay) return null
      return (
        <LayerRow
          key={row.id}
          layerKind="overlay"
          layerId={overlay.id}
          selected={selectedOverlay === overlay.id}
          onClick={() => {
            selectOverlay(overlay.id)
            setSelectMode(false)
            setMaskEditing(false)
          }}
          thumb={(
            <span className="grid h-7 w-7 shrink-0 place-items-center overflow-hidden rounded checker ring-1 ring-white/[.08]">
              <img src={overlay.url} alt="" className="max-h-full max-w-full object-contain" />
            </span>
          )}
          title={overlay.name}
          subtitle="Image"
          visible={overlay.visible}
          onToggleVisible={() => toggleOverlayVisible(overlay.id)}
          onRemove={() => removeOverlay(overlay.id)}
          onDragStart={(e) => beginLayerDrag(e, 'overlay', overlay.id)}
          onDragEnd={endLayerDrag}
          dragging={isDragging('overlay', overlay.id)}
          dropTarget={isDropTarget('overlay', overlay.id)}
          className="!rounded-md !p-1.5"
        />
      )
    }
    if (kind === 'pixelate') {
      return (
        <LayerRow
          key={row.id}
          icon={Grid3x3}
          title={row.name}
          subtitle="Pixelate (visual)"
          visible={row.visible}
          locked={row.locked}
          className="!rounded-md !p-1.5"
        />
      )
    }
    if (kind === 'redaction') {
      return (
        <LayerRow
          key={row.id}
          icon={Shield}
          title={row.name}
          subtitle="Secure redact"
          visible={row.visible}
          locked={row.locked}
          className="!rounded-md !p-1.5"
        />
      )
    }
    return (
      <LayerRow
        key={row.id}
        icon={Layers3}
        title={row.name}
        subtitle={row.subtitle}
        visible={row.visible}
        locked={row.locked}
        className="!rounded-md !p-1.5"
      />
    )
  }

  return (
    <aside
      aria-label="Layers"
      className="scrollbar flex h-full w-[200px] shrink-0 flex-col overflow-y-auto overscroll-contain border-l border-white/[.06] bg-panel"
    >
      <div className="flex h-11 shrink-0 items-center border-b border-white/[.06] px-3">
        <span className="text-[10px] font-semibold uppercase tracking-[.14em] text-zinc-500">
          Layers · {layerCount}{unified ? ' · V2' : ''}
        </span>
      </div>

      <div className="flex flex-col gap-1 p-2">
        {!layerCount && (
          <EmptyState icon={Layers3} className="mt-2 px-1">
            Use a selection tool to extract layers, or add an image
          </EmptyState>
        )}

        {unified ? (
          <>
            {unifiedRows.map((row) => renderUnifiedRow(row))}
            <LayerRow
              selected={artboardSelected}
              onClick={() => {
                selectArtboard()
                setSelectMode(false)
                setMaskEditing(false)
              }}
              icon={Frame}
              title="Artboard"
              subtitle={canvasLocked ? 'Locked' : 'Canvas size'}
              locked={canvasLocked}
              onToggleLock={toggleCanvasLock}
              className="!rounded-md !p-1.5"
            />
          </>
        ) : (
          <>
            {textFrontFirst.map((layer) => {
              const selected = selectedText === layer.id
              return (
                <LayerRow
                  key={layer.id}
                  layerKind="text"
                  layerId={layer.id}
                  selected={selected}
                  onClick={() => {
                    clearLayerSelection()
                    setSelectedOverlay(null)
                    setSelectedText(layer.id)
                    setPlaying(false)
                    setSelectMode(false)
                    setMaskEditing(false)
                    goToWorkspace('text')
                  }}
                  icon={Type}
                  title={layer.text || 'Empty text'}
                  subtitle="Text"
                  visible={layer.visible}
                  locked={layer.locked}
                  onToggleVisible={() => updateText('visible', !layer.visible)}
                  onToggleLock={() => toggleTextLock(layer.id)}
                  onRemove={() => removeText(layer.id)}
                  onDragStart={(e) => beginLayerDrag(e, 'text', layer.id)}
                  onDragEnd={endLayerDrag}
                  dragging={isDragging('text', layer.id)}
                  dropTarget={isDropTarget('text', layer.id)}
                  className="!rounded-md !p-1.5"
                />
              )
            })}

            {elementsFrontFirst.map((el) => {
              const selected = selectedElements.includes(el.id)
              const multi = selectedElements.length >= 2
              const role = selected && multi
                ? (el.id === selectedElement ? 'primary' : 'secondary')
                : null
              return (
                <LayerRow
                  key={el.id}
                  layerKind="element"
                  layerId={el.id}
                  selected={selected}
                  role={role}
                  onClick={(event) => {
                    selectLayer(el.id, event)
                    setSelectMode(false)
                  }}
                  thumb={(
                    <span className="grid h-7 w-7 shrink-0 place-items-center overflow-hidden rounded checker ring-1 ring-white/[.08]">
                      <img src={el.bitmap.toDataURL()} alt="" className="max-h-full max-w-full" />
                    </span>
                  )}
                  title={el.name}
                  subtitle={el.motion}
                  visible={el.visible}
                  locked={el.locked}
                  onToggleVisible={() => toggleElementVisible(el.id)}
                  onToggleLock={() => toggleElementLock(el.id)}
                  onRemove={() => removeElement(el.id)}
                  onDragStart={(e) => beginLayerDrag(e, 'element', el.id)}
                  onDragEnd={endLayerDrag}
                  dragging={isDragging('element', el.id)}
                  dropTarget={isDropTarget('element', el.id)}
                  className="!rounded-md !p-1.5"
                />
              )
            })}

            {overlaysFrontFirst.map((overlay) => {
              const selected = selectedOverlay === overlay.id
              return (
                <LayerRow
                  key={overlay.id}
                  layerKind="overlay"
                  layerId={overlay.id}
                  selected={selected}
                  onClick={() => {
                    selectOverlay(overlay.id)
                    setSelectMode(false)
                    setMaskEditing(false)
                  }}
                  thumb={(
                    <span className="grid h-7 w-7 shrink-0 place-items-center overflow-hidden rounded checker ring-1 ring-white/[.08]">
                      <img src={overlay.url} alt="" className="max-h-full max-w-full object-contain" />
                    </span>
                  )}
                  title={overlay.name}
                  subtitle="Image"
                  visible={overlay.visible}
                  onToggleVisible={() => toggleOverlayVisible(overlay.id)}
                  onRemove={() => removeOverlay(overlay.id)}
                  onDragStart={(e) => beginLayerDrag(e, 'overlay', overlay.id)}
                  onDragEnd={endLayerDrag}
                  dragging={isDragging('overlay', overlay.id)}
                  dropTarget={isDropTarget('overlay', overlay.id)}
                  className="!rounded-md !p-1.5"
                />
              )
            })}

            <LayerRow
              selected={baseImageSelected}
              onClick={() => {
                selectBaseImage()
                setSelectMode(false)
                setMaskEditing(false)
              }}
              icon={ImageIcon}
              title="Background"
              subtitle={imageLocked ? 'Locked' : 'Base image'}
              visible={imageVisible !== false}
              onToggleVisible={() => setImageVisible((v) => !v)}
              locked={imageLocked}
              onToggleLock={toggleImageLock}
              className="!rounded-md !p-1.5"
            />

            {enhancedLayer && (
              <LayerRow
                selected={enhancedSelected}
                onClick={() => {
                  selectEnhancedLayer()
                  setSelectMode(false)
                  setMaskEditing(false)
                  goToWorkspace('scale')
                }}
                icon={Maximize2}
                title={enhancedLayer.name || 'Enhanced'}
                subtitle={`${enhancedLayer.width}×${enhancedLayer.height} · under base`}
                visible={enhancedLayer.visible !== false}
                onToggleVisible={() => updateEnhancedLayer({ visible: enhancedLayer.visible === false })}
                onRemove={removeEnhancedLayer}
                className="!rounded-md !p-1.5"
              />
            )}

            <LayerRow
              selected={artboardSelected}
              onClick={() => {
                selectArtboard()
                setSelectMode(false)
                setMaskEditing(false)
              }}
              icon={Frame}
              title="Artboard"
              subtitle={canvasLocked ? 'Locked' : 'Canvas size'}
              locked={canvasLocked}
              onToggleLock={toggleCanvasLock}
              className="!rounded-md !p-1.5"
            />
          </>
        )}

        {selectedElements.length >= 2 && (
          <p className="mt-2 px-1 text-[9px] font-semibold uppercase tracking-wider text-acid/80">
            {selectedElements.length} selected · click to set primary · parallax in properties
          </p>
        )}
      </div>
    </aside>
  )
}

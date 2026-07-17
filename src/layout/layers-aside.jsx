import { useRef, useState } from 'react'
import { ImageIcon, Layers3, Type } from 'lucide-react'
import { EmptyState, LayerRow } from '../components/ui'
import { useStudio } from '../context/studio-provider'
import { cn } from '../lib/cn'

/**
 * Third sidebar — Photoshop-style layers (front at top · drag z-index · show / lock / arrange / remove).
 */
export function LayersAside() {
  const {
    elements, selectedElements, selectedElement, selectLayer, selectBaseImage,
    baseImageSelected, imageLocked, toggleImageLock,
    toggleElementLock, toggleElementVisible, removeElement, moveElement, reorderElement,
    overlays, selectedOverlay, selectOverlay, toggleOverlayVisible, removeOverlay, moveOverlay, reorderOverlay,
    textLayers, selectedText, setSelectedText, setPlaying, removeText, moveText, reorderText, toggleTextLock, updateText,
    goToWorkspace,
    layerInsertAt, setLayerInsertAt,
    setSelectMode, setMaskEditing,
  } = useStudio()

  const dragRef = useRef(null)
  const [dragState, setDragState] = useState(null) // { kind, id, overId }

  const layerCount = elements.length + overlays.length + textLayers.length
  // Front of stack at top of list (array end → first).
  const elementsFrontFirst = [...elements].reverse()
  const overlaysFrontFirst = [...overlays].reverse()
  const textFrontFirst = [...textLayers].reverse()

  const beginLayerDrag = (event, kind, id) => {
    event.preventDefault()
    event.stopPropagation()
    dragRef.current = { kind, id, moved: false }
    setDragState({ kind, id, overId: id })
    setSelectMode(false)
    setPlaying(false)
  }

  const moveLayerDrag = (event, kind, overId) => {
    const drag = dragRef.current
    if (!drag || drag.kind !== kind || drag.id === overId) return
    drag.moved = true
    if (kind === 'element') reorderElement(drag.id, overId)
    if (kind === 'overlay') reorderOverlay(drag.id, overId)
    if (kind === 'text') reorderText(drag.id, overId)
    setDragState({ kind, id: drag.id, overId })
  }

  const endLayerDrag = () => {
    if (!dragRef.current) return
    dragRef.current = null
    setDragState(null)
  }

  const isDragging = (kind, id) => dragState?.kind === kind && dragState?.id === id
  const isDropTarget = (kind, id) => (
    dragState?.kind === kind && dragState?.overId === id && dragState?.id !== id
  )

  return (
    <aside
      aria-label="Layers"
      className="scrollbar flex h-full w-[200px] shrink-0 flex-col overflow-y-auto overscroll-contain border-l border-white/[.06] bg-panel"
    >
      <div className="flex h-11 shrink-0 items-center border-b border-white/[.06] px-3">
        <span className="text-[10px] font-semibold uppercase tracking-[.14em] text-zinc-500">
          Layers · {layerCount}
        </span>
      </div>

      <div className="flex flex-col gap-1 p-2">
        <div className="mb-1 grid grid-cols-2 gap-1 rounded-md border border-white/[.06] bg-surface p-0.5">
          <button
            type="button"
            title="New layers appear in front of the selection"
            onClick={() => setLayerInsertAt('front')}
            className={cn(
              'rounded px-1.5 py-1 text-[9px] font-semibold uppercase tracking-wider transition',
              layerInsertAt === 'front'
                ? 'bg-acid/15 text-acid'
                : 'text-zinc-500 hover:text-zinc-300',
            )}
          >
            Add front
          </button>
          <button
            type="button"
            title="New layers appear behind the selection"
            onClick={() => setLayerInsertAt('back')}
            className={cn(
              'rounded px-1.5 py-1 text-[9px] font-semibold uppercase tracking-wider transition',
              layerInsertAt === 'back'
                ? 'bg-acid/15 text-acid'
                : 'text-zinc-500 hover:text-zinc-300',
            )}
          >
            Add back
          </button>
        </div>

        <p className="mb-1 px-0.5 text-[9px] text-zinc-600">
          Drag grip to change z-index · front / back buttons below each layer
        </p>

        {!elements.length && !overlays.length && !textLayers.length && (
          <EmptyState icon={Layers3} className="mt-2 px-1">
            Use a selection tool to extract layers, or add an image overlay
          </EmptyState>
        )}

        {textFrontFirst.map((layer) => {
          const index = textLayers.findIndex((item) => item.id === layer.id)
          const selected = selectedText === layer.id
          return (
            <LayerRow
              key={layer.id}
              selected={selected}
              onClick={() => {
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
              onMoveFront={() => moveText(layer.id, 'front')}
              onMoveUp={() => moveText(layer.id, 1)}
              onMoveDown={() => moveText(layer.id, -1)}
              onMoveBack={() => moveText(layer.id, 'back')}
              canMoveFront={index < textLayers.length - 1}
              canMoveUp={index < textLayers.length - 1}
              canMoveDown={index > 0}
              canMoveBack={index > 0}
              onDragStart={(e) => beginLayerDrag(e, 'text', layer.id)}
              onDragMove={(e) => moveLayerDrag(e, 'text', layer.id)}
              onDragEnd={endLayerDrag}
              dragging={isDragging('text', layer.id)}
              dropTarget={isDropTarget('text', layer.id)}
              className="!rounded-md !p-1.5"
            />
          )
        })}

        {elementsFrontFirst.map((el) => {
          const index = elements.findIndex((item) => item.id === el.id)
          const selected = selectedElements.includes(el.id)
          const multi = selectedElements.length >= 2
          const role = selected && multi
            ? (el.id === selectedElement ? 'primary' : 'secondary')
            : null
          return (
            <LayerRow
              key={el.id}
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
              onMoveFront={() => moveElement(el.id, 'front')}
              onMoveUp={() => moveElement(el.id, 1)}
              onMoveDown={() => moveElement(el.id, -1)}
              onMoveBack={() => moveElement(el.id, 'back')}
              canMoveFront={index < elements.length - 1}
              canMoveUp={index < elements.length - 1}
              canMoveDown={index > 0}
              canMoveBack={index > 0}
              onDragStart={(e) => beginLayerDrag(e, 'element', el.id)}
              onDragMove={(e) => moveLayerDrag(e, 'element', el.id)}
              onDragEnd={endLayerDrag}
              dragging={isDragging('element', el.id)}
              dropTarget={isDropTarget('element', el.id)}
              className="!rounded-md !p-1.5"
            />
          )
        })}

        {overlaysFrontFirst.map((overlay) => {
          const index = overlays.findIndex((item) => item.id === overlay.id)
          const selected = selectedOverlay === overlay.id
          return (
            <LayerRow
              key={overlay.id}
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
              onMoveFront={() => moveOverlay(overlay.id, 'front')}
              onMoveUp={() => moveOverlay(overlay.id, 1)}
              onMoveDown={() => moveOverlay(overlay.id, -1)}
              onMoveBack={() => moveOverlay(overlay.id, 'back')}
              canMoveFront={index < overlays.length - 1}
              canMoveUp={index < overlays.length - 1}
              canMoveDown={index > 0}
              canMoveBack={index > 0}
              onDragStart={(e) => beginLayerDrag(e, 'overlay', overlay.id)}
              onDragMove={(e) => moveLayerDrag(e, 'overlay', overlay.id)}
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
          title="Base image"
          subtitle={imageLocked ? 'Locked' : 'Background'}
          visible
          locked={imageLocked}
          onToggleLock={toggleImageLock}
          className="!rounded-md !p-1.5"
        />

        {selectedElements.length >= 2 && (
          <p className="mt-2 px-1 text-[9px] font-semibold uppercase tracking-wider text-acid/80">
            {selectedElements.length} selected · click to set primary · parallax in properties
          </p>
        )}
      </div>
    </aside>
  )
}

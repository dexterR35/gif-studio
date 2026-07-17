import { ImageIcon, Layers3 } from 'lucide-react'
import { EmptyState, LayerRow } from '../components/ui'
import { useStudio } from '../context/studio-provider'
import { cn } from '../lib/cn'

/**
 * Third sidebar — Photoshop-style layers (front at top · show / lock / arrange / remove).
 */
export function LayersAside() {
  const {
    elements, selectedElements, selectedElement, selectLayer, selectBaseImage,
    baseImageSelected, imageLocked, toggleImageLock,
    toggleElementLock, toggleElementVisible, removeElement, moveElement,
    overlays, selectedOverlay, selectOverlay, toggleOverlayVisible, removeOverlay, moveOverlay,
    layerInsertAt, setLayerInsertAt,
    setSelectMode, setMaskEditing,
  } = useStudio()

  const layerCount = elements.length + overlays.length
  // Front of stack at top of list (array end → first).
  const elementsFrontFirst = [...elements].reverse()
  const overlaysFrontFirst = [...overlays].reverse()

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

        {!elements.length && !overlays.length && (
          <EmptyState icon={Layers3} className="mt-2 px-1">
            Use a selection tool to extract layers, or add an image overlay
          </EmptyState>
        )}

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

import { ImageIcon, Layers3 } from 'lucide-react'
import { EmptyState, LayerRow } from '../components/ui'
import { useStudio } from '../context/studio-provider'

/**
 * Third sidebar — Photoshop-style layers (show / lock / remove).
 */
export function LayersAside() {
  const {
    elements, selectedElements, selectLayer, selectBaseImage,
    baseImageSelected, imageLocked, toggleImageLock,
    toggleElementLock, toggleElementVisible, removeElement,
    setSelectMode, setMaskEditing,
  } = useStudio()

  return (
    <aside
      aria-label="Layers"
      className="scrollbar flex h-full w-[200px] shrink-0 flex-col overflow-y-auto overscroll-contain border-l border-white/[.06] bg-panel"
    >
      <div className="flex h-11 shrink-0 items-center border-b border-white/[.06] px-3">
        <span className="text-[10px] font-semibold uppercase tracking-[.14em] text-zinc-500">
          Layers · {elements.length}
        </span>
      </div>

      <div className="flex flex-col gap-1 p-2">
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

        {!elements.length && (
          <EmptyState icon={Layers3} className="mt-2 px-1">
            Use a selection tool to extract layers
          </EmptyState>
        )}

        {elements.map((el) => (
          <LayerRow
            key={el.id}
            selected={selectedElements.includes(el.id)}
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
            className="!rounded-md !p-1.5"
          />
        ))}

        {selectedElements.length >= 2 && (
          <p className="mt-2 px-1 text-[9px] font-semibold uppercase tracking-wider text-acid/80">
            {selectedElements.length} selected · parallax in properties
          </p>
        )}
      </div>
    </aside>
  )
}

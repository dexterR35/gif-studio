import { Layers3 } from 'lucide-react'
import { EmptyState, LayerRow, Section, Slider, StatusBadge } from '../components/ui'
import { useStudio } from '../context/studio-provider'

export default function ElementsPage() {
  const {
    elements, selectedElements, selectLayer,
    apiAvailable, apiInfo, selectMode, selectionTool, extractTolerance, setExtractTolerance,
    toggleElementLock, toggleElementVisible, setSelectMode,
  } = useStudio()

  return (
    <>
      <Section
        title={`Layers · ${elements.length}`}
        info="Photoshop-style layers. Use the tool rail to extract. Ctrl/Cmd+click to multi-select for parallax (Motion)."
      >
        {!elements.length && (
          <EmptyState icon={Layers3}>
            No layers yet — pick a selection tool from the rail
          </EmptyState>
        )}
        <div className="space-y-1.5">
          {elements.map((el) => (
            <LayerRow
              key={el.id}
              selected={selectedElements.includes(el.id)}
              onClick={(event) => {
                selectLayer(el.id, event)
                setSelectMode(false)
              }}
              thumb={(
                <span className="grid h-8 w-8 shrink-0 place-items-center overflow-hidden rounded-md checker ring-1 ring-white/[.08]">
                  <img src={el.bitmap.toDataURL()} alt="" className="max-h-full max-w-full" />
                </span>
              )}
              title={el.name}
              subtitle={`${el.locked ? 'Locked · ' : ''}${el.motion} · ${el.speed}×`}
              visible={el.visible}
              locked={el.locked}
              onToggleVisible={() => toggleElementVisible(el.id)}
              onToggleLock={() => toggleElementLock(el.id)}
            />
          ))}
        </div>
        {selectedElements.length >= 2 && (
          <p className="mt-3 text-[10px] font-semibold text-acid/80">
            {selectedElements.length} selected — parallax options in the right panel
          </p>
        )}
      </Section>

      {selectMode && (
        <Section title="Selection options" info="Edge tolerance for Rectangle / smart separation.">
          <StatusBadge className="mb-3" tone={apiAvailable ? 'success' : 'warning'}>
            {apiAvailable
              ? apiInfo?.ai
                ? 'AI + OpenCV connected'
                : 'OpenCV smart selection connected'
              : 'Edge selector · start Python API'}
          </StatusBadge>
          <p className="mb-3 text-[11px] text-zinc-500">
            <span className="font-medium text-zinc-300">{selectionTool}</span>
            {' '}active — draw on the canvas to extract.
          </p>
          <Slider
            label="Edge tolerance"
            info="Raise when background remains. Lower if object parts disappear."
            min={5}
            max={120}
            value={extractTolerance}
            onChange={setExtractTolerance}
          />
        </Section>
      )}
    </>
  )
}

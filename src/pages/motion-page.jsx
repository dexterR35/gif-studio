import { Cpu, ImageIcon, Layers3 } from 'lucide-react'
import { EmptyState, Field, FormGrid, Hint, LayerRow, Section, SelectField, Slider } from '../components/ui'
import { BASE_MOTIONS, PRESETS } from '../lib/presets'
import { useStudio } from '../context/studio-provider'
import { cn } from '../lib/cn'

export default function MotionPage() {
  const {
    settings, update, applyPreset,
    elements, selectedElements, selectLayer, selectBaseImage,
    baseImageSelected, imageLocked, toggleElementLock, toggleElementVisible,
    setSelectMode, parallax,
  } = useStudio()

  const animationActive = (settings.motion || 'None') !== 'None'
  const multiSelected = selectedElements.length >= 2

  return (
    <>
      <Section title="Motion" info="Presets stay fully editable. Tune every value below.">
        <div className="gs-chip-row">
          <SelectField
            className="min-w-[7.5rem] flex-1"
            icon={Cpu}
            value={settings.preset}
            onChange={applyPreset}
          >
            {Object.keys(PRESETS).map((p) => <option key={p}>{p}</option>)}
          </SelectField>
          <SelectField
            className="min-w-[7.5rem] flex-1"
            value={settings.easing}
            onChange={(v) => update('easing', v)}
          >
            {['Linear', 'Ease in', 'Ease out', 'Ease in-out', 'Smoothstep'].map((x) => (
              <option key={x}>{x}</option>
            ))}
          </SelectField>
        </div>
        <FormGrid className="mt-2">
          <Field label="Duration" value={settings.duration} onChange={(v) => update('duration', v)} min={.1} max={20} step={.1} suffix="s" />
          <Field label="Frame rate" value={settings.fps} onChange={(v) => update('fps', v)} min={1} max={60} suffix="fps" />
        </FormGrid>
      </Section>

      <Section title="Animation" info="Loop animation for the base image itself.">
        <SelectField
          label=""
          value={settings.motion || 'None'}
          onChange={(v) => update('motion', v)}
        >
          {BASE_MOTIONS.map((m) => <option key={m}>{m}</option>)}
        </SelectField>
        <div className={cn('mt-2', !animationActive && 'pointer-events-none opacity-40')}>
          <Slider
            className="border-t border-white/[.05] py-2"
            label="Amount"
            suffix="%"
            min={0}
            max={40}
            value={settings.amplitude}
            onChange={(v) => update('amplitude', v)}
          />
          <Slider
            className="border-t border-white/[.05] py-2"
            label="Speed"
            suffix="×"
            min={0.1}
            max={8}
            step={0.1}
            value={settings.speed ?? 1}
            onChange={(v) => update('speed', v)}
          />
        </div>
      </Section>

      <Section
        title="Layers"
        info="Click to select. Ctrl/Cmd+click to multi-select. Select 2+ layers to open parallax in the inspector."
      >
        <LayerRow
          selected={baseImageSelected}
          onClick={() => selectBaseImage()}
          icon={ImageIcon}
          title="Base image"
          subtitle={imageLocked ? 'Locked' : 'Background'}
          visible
          locked={imageLocked}
        />

        <div className="mt-1.5 space-y-1.5">
          {!elements.length && (
            <EmptyState icon={Layers3}>
              Extract layers from the Elements tool rail
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
                <span className="grid h-8 w-8 shrink-0 place-items-center overflow-hidden rounded-md checker ring-1 ring-white/[.08]">
                  <img src={el.bitmap.toDataURL()} alt="" className="max-h-full max-w-full" />
                </span>
              )}
              title={el.name}
              subtitle={`${el.locked ? 'Locked · ' : ''}${el.motion} · depth ${el.depth ?? 50}%`}
              visible={el.visible}
              locked={el.locked}
              onToggleVisible={() => toggleElementVisible(el.id)}
              onToggleLock={() => toggleElementLock(el.id)}
            />
          ))}
        </div>

        {elements.length > 0 && !multiSelected && (
          <Hint className="mt-3">
            Multi-select 2+ layers (Ctrl/Cmd+click) to edit parallax in the right panel.
          </Hint>
        )}
        {multiSelected && (
          <p className="mt-3 text-[10px] font-semibold text-acid/80">
            {selectedElements.length} layers selected
            {parallax.enabled ? ' · parallax on' : ' · open inspector for parallax'}
          </p>
        )}
      </Section>
    </>
  )
}

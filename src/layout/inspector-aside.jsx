import { useState } from 'react'
import { Lock, Move, Unlock } from 'lucide-react'
import {
  Button,
  Field,
  FormGrid,
  Hint,
  RotateControls,
  Section,
  SelectField,
  Slider,
  Switch,
  ToggleGroup,
} from '../components/ui'
import { useStudio } from '../context/studio-provider'
import { cn } from '../lib/cn'
import { SecondaryAside } from './secondary-aside'

const POSITION_AXES = {
  X: { startKey: 'xStart', endKey: 'xEnd', min: -100, max: 100, suffix: '%', label: 'X position' },
  Y: { startKey: 'yStart', endKey: 'yEnd', min: -100, max: 100, suffix: '%', label: 'Y position' },
  Rotate: { startKey: 'rotateStart', endKey: 'rotateEnd', min: -180, max: 180, suffix: '°', label: 'Rotation' },
}

function BaseTransformPanel() {
  const {
    settings, setSettings, imageLocked, toggleImageLock,
    baseImageSelected, selectBaseImage, setBaseImageSelected,
  } = useStudio()
  const [positionAxis, setPositionAxis] = useState('X')
  const axis = POSITION_AXES[positionAxis]

  const setBoth = (startKey, endKey, value) => {
    setSettings((current) => ({ ...current, [startKey]: value, [endKey]: value }))
  }

  return (
    <>
      <Section title="Base image" info="Select and lock the background layer." open>
        <div className="gs-chip-row stretch">
          <button
            type="button"
            onClick={() => {
              if (baseImageSelected) setBaseImageSelected(false)
              else selectBaseImage()
            }}
            className={cn('gs-chip focus-ring', baseImageSelected && 'is-active')}
          >
            <Move className="h-3 w-3" />
            Select
          </button>
          <button
            type="button"
            onClick={toggleImageLock}
            className={cn('gs-chip focus-ring', imageLocked && 'is-active')}
          >
            {imageLocked ? <Lock className="h-3 w-3" /> : <Unlock className="h-3 w-3" />}
            {imageLocked ? 'Unlock' : 'Lock'}
          </button>
        </div>
      </Section>

      <Section title="Transform" info="One control per property. Pick X, Y, or Rotate from the dropdown." open>
        <div className={imageLocked ? 'pointer-events-none opacity-40' : ''}>
          <Slider
            className="border-t border-white/[.05] py-2"
            label="Scale"
            suffix="%"
            min={5}
            max={300}
            value={settings.scaleStart}
            onChange={(v) => setBoth('scaleStart', 'scaleEnd', v)}
          />
          <div className="border-t border-white/[.05] py-2">
            <SelectField label="Position" value={positionAxis} onChange={setPositionAxis}>
              <option value="X">X</option>
              <option value="Y">Y</option>
              <option value="Rotate">Rotate</option>
            </SelectField>
            <Slider
              className="mt-2"
              label={axis.label}
              suffix={axis.suffix}
              min={axis.min}
              max={axis.max}
              value={settings[axis.startKey]}
              onChange={(v) => setBoth(axis.startKey, axis.endKey, v)}
            />
          </div>
          <Slider
            className="border-t border-white/[.05] py-2"
            label="Opacity"
            suffix="%"
            min={0}
            max={100}
            value={settings.opacityStart}
            onChange={(v) => setBoth('opacityStart', 'opacityEnd', v)}
          />
        </div>
      </Section>
    </>
  )
}

function LayerMaskPanel() {
  const {
    maskEditing, setMaskEditing, maskBrush, setMaskBrush,
    resetElementMask, invertElementMask, featherElementMask,
    setPlaying, setSelectMode,
  } = useStudio()

  return (
    <Section title="Mask" info="Non-destructive mask — original pixels can be revealed again." open>
      <Switch
        label="Paint mask on canvas"
        checked={maskEditing}
        onChange={(v) => {
          setMaskEditing(v)
          setPlaying(false)
          setSelectMode(false)
        }}
      />
      <ToggleGroup
        className="mt-4"
        value={maskBrush.mode}
        onChange={(mode) => setMaskBrush((current) => ({ ...current, mode }))}
        options={[
          { value: 'Hide', label: 'Hide' },
          { value: 'Reveal', label: 'Reveal' },
        ]}
      />
      <div className="mt-3 grid grid-cols-2 gap-2">
        <Field label="Size" value={maskBrush.size} onChange={(v) => setMaskBrush((current) => ({ ...current, size: v }))} min={2} max={500} suffix="px" />
        <Field label="Hardness" value={maskBrush.hardness} onChange={(v) => setMaskBrush((current) => ({ ...current, hardness: v }))} min={0} max={100} suffix="%" />
        <Field label="Opacity" value={maskBrush.opacity} onChange={(v) => setMaskBrush((current) => ({ ...current, opacity: v }))} min={1} max={100} suffix="%" />
        <Field label="Feather" value={maskBrush.feather} onChange={(v) => setMaskBrush((current) => ({ ...current, feather: v }))} min={0} max={80} suffix="px" />
      </div>
      <FormGrid gap={2} className="mt-3">
        <Button className="text-[10px]" onClick={() => resetElementMask('Rectangle')}>Rect</Button>
        <Button className="text-[10px]" onClick={() => resetElementMask('Ellipse')}>Ellipse</Button>
        <Button className="text-[10px]" onClick={invertElementMask}>Invert</Button>
        <Button className="text-[10px]" onClick={featherElementMask}>Feather</Button>
      </FormGrid>
    </Section>
  )
}

function ElementTransformPanel({ el }) {
  const { updateElement, toggleElementLock, removeElement } = useStudio()

  return (
    <>
      <Section title="Layer" info="Transform the active layer. Drag handles on the stage too." open>
        <div className="mb-3">
          <Button full className="text-[10px]" onClick={() => toggleElementLock(el.id)}>
            {el.locked ? <Unlock className="h-3.5 w-3.5" /> : <Lock className="h-3.5 w-3.5" />}
            {el.locked ? 'Unlock layer' : 'Lock layer'}
          </Button>
        </div>
        <div className={`space-y-1 ${el.locked ? 'pointer-events-none opacity-40' : ''}`}>
          <Slider label="X position" value={Math.round(el.x * 1000) / 10} onChange={(v) => updateElement('x', v / 100)} min={-100} max={200} step={0.1} />
          <Slider label="Y position" value={Math.round(el.y * 1000) / 10} onChange={(v) => updateElement('y', v / 100)} min={-100} max={200} step={0.1} />
          <Slider label="Box width" value={Math.round(el.w * 1000) / 10} onChange={(v) => updateElement('w', v / 100)} min={1} max={300} step={0.1} />
          <Slider label="Box height" value={Math.round(el.h * 1000) / 10} onChange={(v) => updateElement('h', v / 100)} min={1} max={300} step={0.1} />
          <Slider label="Scale X" value={el.scaleX} onChange={(v) => updateElement('scaleX', v)} min={1} max={500} />
          <Slider label="Scale Y" value={el.scaleY} onChange={(v) => updateElement('scaleY', v)} min={1} max={500} />
          <Slider label="Rotation" value={el.rotation} onChange={(v) => updateElement('rotation', v)} min={-360} max={360} />
          <Slider label="Opacity" value={el.opacity} onChange={(v) => updateElement('opacity', v)} min={0} max={100} />
        </div>
        <RotateControls
          className={`mt-3 ${el.locked ? 'pointer-events-none opacity-40' : ''}`}
          value={el.rotation}
          onChange={(v) => updateElement('rotation', v)}
        />
        <div className={`mt-3 grid grid-cols-2 gap-3 ${el.locked ? 'pointer-events-none opacity-40' : ''}`}>
          <Switch label="Flip H" checked={el.flipX} onChange={(v) => updateElement('flipX', v)} />
          <Switch label="Flip V" checked={el.flipY} onChange={(v) => updateElement('flipY', v)} />
        </div>
      </Section>

      <Section title="Motion" open>
        <div className={el.locked ? 'pointer-events-none opacity-40' : ''}>
          <SelectField label="Animation" value={el.motion} onChange={(v) => updateElement('motion', v)}>
            {['Float', 'Drift', 'Bounce', 'Pulse', 'Spin', 'Wobble'].map((x) => (
              <option key={x}>{x}</option>
            ))}
          </SelectField>
          <Slider
            className="mt-3 border-t border-white/[.05] py-2"
            label="Amount"
            suffix="%"
            min={0}
            max={40}
            value={el.amplitude}
            onChange={(v) => updateElement('amplitude', v)}
          />
          <Slider
            className="border-t border-white/[.05] py-2"
            label="Speed"
            suffix="×"
            min={0.1}
            max={8}
            step={0.1}
            value={el.speed}
            onChange={(v) => updateElement('speed', v)}
          />
          <Slider
            className="border-t border-white/[.05] py-2"
            label="Parallax depth"
            suffix="%"
            min={0}
            max={100}
            value={el.depth ?? 50}
            onChange={(v) => updateElement('depth', v)}
          />
          <div className="mt-1 flex justify-between text-[9px] font-semibold uppercase tracking-wider text-zinc-700">
            <span>Far</span>
            <span>Near</span>
          </div>
          <div className="mt-4">
            <Switch label="Show layer" checked={el.visible} onChange={(v) => updateElement('visible', v)} />
          </div>
        </div>
        <Button
          variant="danger"
          full
          className="mt-4"
          disabled={el.locked}
          onClick={() => removeElement(el.id)}
        >
          {el.locked ? 'Unlock to remove' : 'Remove layer'}
        </Button>
      </Section>

      <LayerMaskPanel />
    </>
  )
}

function ParallaxPanel({ layers }) {
  const { parallax, setParallax, updateElementById, goToWorkspace } = useStudio()

  return (
    <>
      <Section title="Selection" open>
        <p className="text-[11px] leading-relaxed text-zinc-400">
          {layers.length} layers selected. Group parallax needs two or more layers.
        </p>
        <ul className="mt-2 space-y-1">
          {layers.map((el) => (
            <li key={el.id} className="truncate text-[10px] text-zinc-500">· {el.name}</li>
          ))}
        </ul>
      </Section>

      <Section title="Parallax scene" info="Far layers travel less, near layers more. Seamless for GIF export." open>
        <Switch
          label="Enable group parallax"
          checked={parallax.enabled}
          onChange={(v) => {
            setParallax((current) => ({ ...current, enabled: v }))
            if (v) goToWorkspace('motion')
          }}
        />
        <div className={`mt-3 transition ${parallax.enabled ? '' : 'pointer-events-none opacity-40'}`}>
          <SelectField
            label="Travel path"
            value={parallax.direction}
            onChange={(v) => setParallax((current) => ({ ...current, direction: v }))}
          >
            {['Horizontal', 'Vertical', 'Diagonal', 'Orbit'].map((x) => (
              <option key={x}>{x}</option>
            ))}
          </SelectField>
          <Slider
            className="mt-2 border-t border-white/[.05] py-2"
            label="Strength"
            suffix="%"
            min={0}
            max={40}
            value={parallax.strength}
            onChange={(v) => setParallax((current) => ({ ...current, strength: v }))}
          />
          <Slider
            className="border-t border-white/[.05] py-2"
            label="Speed"
            suffix="×"
            min={0.1}
            max={8}
            step={0.1}
            value={parallax.speed}
            onChange={(v) => setParallax((current) => ({ ...current, speed: v }))}
          />
        </div>
        <Hint className="mt-3">Depth per layer controls how far each moves in the group.</Hint>
      </Section>

      <Section title="Layer depths" open>
        {layers.map((el) => (
          <Slider
            key={el.id}
            className="border-t border-white/[.05] py-2"
            label={el.name}
            suffix="%"
            min={0}
            max={100}
            value={el.depth ?? 50}
            onChange={(v) => updateElementById(el.id, 'depth', v)}
          />
        ))}
        <div className="mt-1 flex justify-between text-[9px] font-semibold uppercase tracking-wider text-zinc-700">
          <span>Far</span>
          <span>Near</span>
        </div>
      </Section>
    </>
  )
}

/** Selection-driven inspector — base, single layer (+ mask), or multi-layer parallax. */
export function InspectorAside() {
  const {
    baseImageSelected,
    selectedElements,
    elements,
    clearLayerSelection,
    setSelectedText,
  } = useStudio()

  const selectedLayers = elements.filter((el) => selectedElements.includes(el.id))
  const multi = selectedLayers.length >= 2
  const single = selectedLayers.length === 1 ? selectedLayers[0] : null

  const open = baseImageSelected || selectedLayers.length > 0
  const title = multi
    ? `${selectedLayers.length} layers`
    : single
      ? single.name || 'Layer'
      : baseImageSelected
        ? 'Base image'
        : 'Inspector'

  const close = () => {
    clearLayerSelection()
    setSelectedText(null)
  }

  return (
    <SecondaryAside open={open} title={title} onClose={close}>
      {multi ? (
        <ParallaxPanel layers={selectedLayers} />
      ) : single ? (
        <ElementTransformPanel el={single} />
      ) : baseImageSelected ? (
        <BaseTransformPanel />
      ) : null}
    </SecondaryAside>
  )
}

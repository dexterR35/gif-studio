import { useState } from 'react'
import {
  AlignCenter,
  AlignLeft,
  AlignRight,
  ArrowDown,
  ArrowUp,
  ChevronsDown,
  ChevronsUp,
  Lock,
  Move,
  Unlock,
  Upload,
} from 'lucide-react'
import {
  Button,
  CanvasSizeControls,
  ColorField,
  Field,
  FormGrid,
  Hint,
  RotateControls,
  Section,
  SelectField,
  Slider,
  Switch,
  StatusBadge,
  Textarea,
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
    settings, setSettings, update, imageLocked, toggleImageLock,
    baseImageSelected, selectBaseImage, setBaseImageSelected,
    source, setCanvasWidth, setCanvasHeight, memory,
  } = useStudio()
  const [positionAxis, setPositionAxis] = useState('X')
  const axis = POSITION_AXES[positionAxis]

  const setBoth = (startKey, endKey, value) => {
    setSettings((current) => ({ ...current, [startKey]: value, [endKey]: value }))
  }

  return (
    <>
      <Section title="Base image" info="Select the background on the canvas or layers panel." open>
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

      <Section title="Canvas" info="Resize the output canvas. Smaller canvas = less render memory." open>
        <CanvasSizeControls
          width={settings.width}
          height={settings.height}
          fit={settings.fit}
          sourceWidth={source.width}
          sourceHeight={source.height}
          memoryBytes={memory}
          onWidthChange={setCanvasWidth}
          onHeightChange={setCanvasHeight}
          onFitChange={(v) => update('fit', v)}
        />
      </Section>

      <Section title="Transform" open>
        <div className={imageLocked ? 'pointer-events-none opacity-40' : ''}>
          <Slider className="gs-row" label="Scale" suffix="%" min={5} max={300} value={settings.scaleStart} onChange={(v) => setBoth('scaleStart', 'scaleEnd', v)} />
          <div className="gs-row">
            <SelectField label="Position" value={positionAxis} onChange={setPositionAxis}>
              <option value="X">X</option>
              <option value="Y">Y</option>
              <option value="Rotate">Rotate</option>
            </SelectField>
            <Slider className="mt-2" label={axis.label} suffix={axis.suffix} min={axis.min} max={axis.max} value={settings[axis.startKey]} onChange={(v) => setBoth(axis.startKey, axis.endKey, v)} />
          </div>
          <Slider className="gs-row" label="Opacity" suffix="%" min={0} max={100} value={settings.opacityStart} onChange={(v) => setBoth('opacityStart', 'opacityEnd', v)} />
        </div>
      </Section>
    </>
  )
}

function MaskPaintPanel() {
  const {
    maskBrush, setMaskBrush, resetElementMask, invertElementMask, featherElementMask,
    selectedElement, elements,
  } = useStudio()
  const el = elements.find((item) => item.id === selectedElement)

  return (
    <Section title="Mask paint" info="Hide or reveal pixels on the selected layer." open>
      {el && (
        <p className="mb-3 truncate text-[11px] text-zinc-500">
          Layer: <span className="font-medium text-zinc-300">{el.name}</span>
        </p>
      )}
      <ToggleGroup
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

function CensorPanel() {
  const { censor, setCensor } = useStudio()

  return (
    <Section title="Censor / pixelate" info="Drag on the canvas to set the region." open>
      <Switch
        label="Show censor"
        checked={censor.enabled}
        onChange={(v) => setCensor((s) => ({ ...s, enabled: v }))}
      />
      <Slider
        className="mt-2 gs-row"
        label="Pixel block size"
        suffix="px"
        min={2}
        max={100}
        value={censor.pixelSize}
        onChange={(v) => setCensor((s) => ({ ...s, pixelSize: v }))}
      />
      <Hint className="mt-3">Drag a box on the stage to place or move the pixelate region.</Hint>
    </Section>
  )
}

function SelectionOptionsPanel() {
  const {
    selectionTool, extractTolerance, setExtractTolerance,
    apiAvailable, apiInfo,
  } = useStudio()

  return (
    <Section title="Selection" info="Draw on the canvas to extract a new layer." open>
      <StatusBadge className="mb-3" tone={apiAvailable ? 'success' : 'warning'}>
        {apiAvailable
          ? apiInfo?.ai ? 'AI + OpenCV connected' : 'OpenCV connected'
          : 'Edge selector · start Python API'}
      </StatusBadge>
      <p className="mb-3 text-[11px] text-zinc-500">
        <span className="font-medium text-zinc-300">{selectionTool}</span> active
      </p>
      <Slider
        label="Edge tolerance"
        min={5}
        max={120}
        value={extractTolerance}
        onChange={setExtractTolerance}
      />
    </Section>
  )
}

function ElementTransformPanel({ el }) {
  const { updateElement, moveElement, elements } = useStudio()
  const index = elements.findIndex((item) => item.id === el.id)
  const canForward = index >= 0 && index < elements.length - 1
  const canBackward = index > 0

  return (
    <>
      <Section title="Transform" info="Drag handles on the stage to move, scale, and rotate." open>
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

      <Section title="Arrange" info="Stack order within extracted layers. Front draws on top." open>
        <FormGrid gap={2}>
          <Button disabled={!canForward} onClick={() => moveElement(el.id, 'front')}>
            <ChevronsUp className="h-3.5 w-3.5" />To front
          </Button>
          <Button disabled={!canForward} onClick={() => moveElement(el.id, 1)}>
            <ArrowUp className="h-3.5 w-3.5" />Forward
          </Button>
          <Button disabled={!canBackward} onClick={() => moveElement(el.id, -1)}>
            <ArrowDown className="h-3.5 w-3.5" />Backward
          </Button>
          <Button disabled={!canBackward} onClick={() => moveElement(el.id, 'back')}>
            <ChevronsDown className="h-3.5 w-3.5" />To back
          </Button>
        </FormGrid>
      </Section>

      <Section title="Motion" open>
        <div className={el.locked ? 'pointer-events-none opacity-40' : ''}>
          <SelectField label="Animation" value={el.motion} onChange={(v) => updateElement('motion', v)}>
            {['Float', 'Drift', 'Bounce', 'Pulse', 'Spin', 'Wobble'].map((x) => (
              <option key={x}>{x}</option>
            ))}
          </SelectField>
          <Slider className="mt-3 gs-row" label="Amount" suffix="%" min={0} max={40} value={el.amplitude} onChange={(v) => updateElement('amplitude', v)} />
          <Slider className="gs-row" label="Speed" suffix="×" min={0.1} max={8} step={0.1} value={el.speed} onChange={(v) => updateElement('speed', v)} />
          <Slider className="gs-row" label="Parallax depth" suffix="%" min={0} max={100} value={el.depth ?? 50} onChange={(v) => updateElement('depth', v)} />
          <div className="mt-1 flex justify-between text-[9px] font-semibold uppercase tracking-wider text-zinc-700">
            <span>Far</span>
            <span>Near</span>
          </div>
        </div>
      </Section>
    </>
  )
}

function ParallaxPanel({ layers }) {
  const { parallax, setParallax, updateElementById } = useStudio()

  return (
    <>
      <Section title="Parallax scene" info="Far layers travel less, near layers more." open>
        <p className="mb-3 text-[11px] text-zinc-500">{layers.length} layers selected</p>
        <Switch
          label="Enable group parallax"
          checked={parallax.enabled}
          onChange={(v) => setParallax((current) => ({ ...current, enabled: v }))}
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
          <Slider className="mt-2 gs-row" label="Strength" suffix="%" min={0} max={40} value={parallax.strength} onChange={(v) => setParallax((current) => ({ ...current, strength: v }))} />
          <Slider className="gs-row" label="Speed" suffix="×" min={0.1} max={8} step={0.1} value={parallax.speed} onChange={(v) => setParallax((current) => ({ ...current, speed: v }))} />
        </div>
        <Hint className="mt-3">Set depth per layer below.</Hint>
      </Section>

      <Section title="Layer depths" open>
        {layers.map((el) => (
          <Slider
            key={el.id}
            className="gs-row"
            label={el.name}
            suffix="%"
            min={0}
            max={100}
            value={el.depth ?? 50}
            onChange={(v) => updateElementById(el.id, 'depth', v)}
          />
        ))}
      </Section>
    </>
  )
}

function OverlayTransformPanel({ overlay }) {
  const { updateOverlay, removeOverlay, moveOverlay, overlays } = useStudio()
  const index = overlays.findIndex((item) => item.id === overlay.id)
  const canForward = index >= 0 && index < overlays.length - 1
  const canBackward = index > 0

  return (
    <>
      <Section title="Transform" info="Position, size, and appearance of this image overlay." open>
        <div className="space-y-1">
          <Slider label="X position" value={overlay.x} onChange={(v) => updateOverlay('x', v)} min={-100} max={200} />
          <Slider label="Y position" value={overlay.y} onChange={(v) => updateOverlay('y', v)} min={-100} max={200} />
          <Slider label="Size" value={overlay.width} onChange={(v) => updateOverlay('width', v)} min={1} max={300} />
          <Slider label="Scale X" value={overlay.scaleX || 100} onChange={(v) => updateOverlay('scaleX', v)} min={1} max={500} />
          <Slider label="Scale Y" value={overlay.scaleY || 100} onChange={(v) => updateOverlay('scaleY', v)} min={1} max={500} />
          <Slider label="Rotation" value={overlay.rotation} onChange={(v) => updateOverlay('rotation', v)} min={-360} max={360} />
          <Slider label="Opacity" value={overlay.opacity} onChange={(v) => updateOverlay('opacity', v)} min={0} max={100} />
        </div>
        <RotateControls
          className="mt-3"
          value={overlay.rotation}
          onChange={(v) => updateOverlay('rotation', v)}
        />
        <div className="mt-3 grid grid-cols-2 gap-3">
          <Switch label="Flip H" checked={overlay.flipX} onChange={(v) => updateOverlay('flipX', v)} />
          <Switch label="Flip V" checked={overlay.flipY} onChange={(v) => updateOverlay('flipY', v)} />
        </div>
      </Section>

      <Section title="Arrange" info="Stack order within image overlays. Front draws on top." open>
        <FormGrid gap={2}>
          <Button disabled={!canForward} onClick={() => moveOverlay(overlay.id, 'front')}>
            <ChevronsUp className="h-3.5 w-3.5" />To front
          </Button>
          <Button disabled={!canForward} onClick={() => moveOverlay(overlay.id, 1)}>
            <ArrowUp className="h-3.5 w-3.5" />Forward
          </Button>
          <Button disabled={!canBackward} onClick={() => moveOverlay(overlay.id, -1)}>
            <ArrowDown className="h-3.5 w-3.5" />Backward
          </Button>
          <Button disabled={!canBackward} onClick={() => moveOverlay(overlay.id, 'back')}>
            <ChevronsDown className="h-3.5 w-3.5" />To back
          </Button>
        </FormGrid>
      </Section>

      <Section title="Layer" open>
        <Switch
          label="Show overlay"
          checked={overlay.visible}
          onChange={(v) => updateOverlay('visible', v)}
        />
        <Button
          variant="danger"
          full
          className="mt-3 text-[10px]"
          onClick={() => removeOverlay(overlay.id)}
        >
          Remove overlay
        </Button>
      </Section>
    </>
  )
}

function TextPropertiesPanel({ layer }) {
  const {
    updateText, fontOptions, fontFileRef, uploadFont,
  } = useStudio()

  return (
    <>
      <Section title="Content & font" open>
        <Textarea value={layer.text} onChange={(e) => updateText('text', e.target.value)} className="h-20" placeholder="Type your text…" />
        <div className="mt-3">
          <SelectField label="Font family" value={layer.font} onChange={(v) => updateText('font', v)}>
            {fontOptions.map((font) => <option key={font} value={font}>{font}</option>)}
          </SelectField>
        </div>
        <Button full className="mt-2" onClick={() => fontFileRef.current?.click()}>
          <Upload className="h-3.5 w-3.5" />Upload local font
        </Button>
        <input ref={fontFileRef} type="file" accept=".ttf,.otf,.woff,.woff2" className="hidden" onChange={(e) => uploadFont(e.target.files[0])} />
        <div className="mt-3 grid grid-cols-2 gap-2">
          <Field label="Size" value={layer.size} onChange={(v) => updateText('size', v)} min={4} max={1000} suffix="px" />
          <SelectField label="Weight" value={layer.weight} onChange={(v) => updateText('weight', Number(v))}>
            {[100, 200, 300, 400, 500, 600, 700, 800, 900].map((x) => <option key={x} value={x}>{x}</option>)}
          </SelectField>
        </div>
        <div className="mt-3"><Switch label="Italic" checked={layer.italic} onChange={(v) => updateText('italic', v)} /></div>
        <div className="mt-3 grid grid-cols-2 gap-2">
          <SelectField label="Case" value={layer.casing} onChange={(v) => updateText('casing', v)}>
            {['As typed', 'UPPERCASE', 'lowercase'].map((x) => <option key={x}>{x}</option>)}
          </SelectField>
          <SelectField label="Decoration" value={layer.decoration} onChange={(v) => updateText('decoration', v)}>
            {['None', 'Underline', 'Strikethrough'].map((x) => <option key={x}>{x}</option>)}
          </SelectField>
        </div>
        <ToggleGroup
          className="mt-3"
          value={layer.align}
          onChange={(align) => updateText('align', align)}
          options={[
            { value: 'left', icon: AlignLeft },
            { value: 'center', icon: AlignCenter },
            { value: 'right', icon: AlignRight },
          ]}
        />
        <div className="mt-3 grid grid-cols-2 gap-2">
          <Field label="Tracking" value={layer.letterSpacing} onChange={(v) => updateText('letterSpacing', v)} min={-20} max={100} suffix="px" />
          <Field label="Line height" value={layer.lineHeight} onChange={(v) => updateText('lineHeight', v)} min={0.5} max={4} step={0.1} suffix="×" />
        </div>
      </Section>

      <Section title="Fill & outline" open>
        <ColorField label="Text color" value={layer.color} onChange={(v) => updateText('color', v)} />
        <ColorField className="mt-3" label="Outline color" value={layer.strokeColor} onChange={(v) => updateText('strokeColor', v)} />
        <div className="mt-3 grid grid-cols-2 gap-2">
          <Field label="Outline" value={layer.strokeWidth} onChange={(v) => updateText('strokeWidth', v)} min={0} max={30} suffix="px" />
          <Field label="Opacity" value={layer.opacity} onChange={(v) => updateText('opacity', v)} min={0} max={100} suffix="%" />
        </div>
        <div className="mt-3">
          <SelectField label="Blend mode" value={layer.blendMode} onChange={(v) => updateText('blendMode', v)}>
            {[['source-over', 'Normal'], ['multiply', 'Multiply'], ['screen', 'Screen'], ['overlay', 'Overlay'], ['darken', 'Darken'], ['lighten', 'Lighten'], ['difference', 'Difference']].map(([value, label]) => (
              <option key={value} value={value}>{label}</option>
            ))}
          </SelectField>
        </div>
      </Section>

      <Section title="Shadow" open>
        <ColorField label="Shadow color" value={layer.shadowColor} onChange={(v) => updateText('shadowColor', v)} showHex={false} />
        <div className="mt-3 grid grid-cols-2 gap-2">
          <Field label="Blur" value={layer.shadowBlur} onChange={(v) => updateText('shadowBlur', v)} min={0} max={100} suffix="px" />
          <Field label="X offset" value={layer.shadowX} onChange={(v) => updateText('shadowX', v)} min={-100} max={100} suffix="px" />
          <Field label="Y offset" value={layer.shadowY} onChange={(v) => updateText('shadowY', v)} min={-100} max={100} suffix="px" />
        </div>
      </Section>
    </>
  )
}

/** Properties inspector (2nd bar) — transform, text, mask paint, selection, parallax. */
export function InspectorAside() {
  const {
    baseImageSelected,
    selectedElements,
    elements,
    overlays,
    selectedOverlay,
    setSelectedOverlay,
    clearLayerSelection,
    textLayers,
    selectedText,
    setSelectedText,
    maskEditing,
    setMaskEditing,
    selectMode,
    setSelectMode,
    cancelSelection,
    censorSelecting,
    setCensorSelecting,
  } = useStudio()

  const selectedLayers = elements.filter((el) => selectedElements.includes(el.id))
  const multi = selectedLayers.length >= 2
  const single = selectedLayers.length === 1 ? selectedLayers[0] : null
  const overlay = overlays.find((item) => item.id === selectedOverlay) || null
  const textLayer = textLayers.find((item) => item.id === selectedText) || null

  const open = Boolean(textLayer) || baseImageSelected || selectedLayers.length > 0 || Boolean(overlay) || maskEditing || selectMode || censorSelecting

  let title = 'Properties'
  if (censorSelecting) title = 'Censor'
  else if (maskEditing) title = 'Mask'
  else if (selectMode) title = 'Selection'
  else if (textLayer) title = textLayer.name || 'Text'
  else if (multi) title = `${selectedLayers.length} layers`
  else if (single) title = single.name || 'Layer'
  else if (overlay) title = overlay.name || 'Overlay'
  else if (baseImageSelected) title = 'Base image'

  const close = () => {
    clearLayerSelection()
    setSelectedOverlay(null)
    setSelectedText(null)
    setMaskEditing(false)
    setCensorSelecting(false)
    if (selectMode) {
      cancelSelection()
      setSelectMode(false)
    }
  }

  let body = null
  if (censorSelecting) body = <CensorPanel />
  else if (maskEditing) body = <MaskPaintPanel />
  else if (selectMode) body = <SelectionOptionsPanel />
  else if (textLayer) body = <TextPropertiesPanel layer={textLayer} />
  else if (multi) body = <ParallaxPanel layers={selectedLayers} />
  else if (single) body = <ElementTransformPanel el={single} />
  else if (overlay) body = <OverlayTransformPanel overlay={overlay} />
  else if (baseImageSelected) body = <BaseTransformPanel />

  return (
    <SecondaryAside open={open} title={title} onClose={close} width={textLayer ? 260 : 228}>
      {body}
    </SecondaryAside>
  )
}

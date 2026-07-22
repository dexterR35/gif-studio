import {
  AlignCenter,
  AlignLeft,
  AlignRight,
  Crosshair,
  Lock,
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
  RangeEnds,
  Section,
  SelectField,
  Slider,
  Switch,
  StatusBadge,
  Textarea,
  ToggleGroup,
} from '../components/ui'
import { JointAnimPanel } from '../components/studio/joint-anim-panel'
import { useStudio } from '../context/studio-provider'
import { FIT_MODES, LAYER_MOTION_OPTIONS } from '../lib/catalogs'
import { cn } from '../lib/cn'
import { SecondaryAside } from './secondary-aside'

function TransformFields({
  rotation,
  opacity,
  onRotation,
  onOpacity,
  anchorX,
  anchorY,
  onAnchor,
  onResetAnchor,
  disabled = false,
  rotationMin = -360,
  rotationMax = 360,
}) {
  const ax = anchorX ?? 50
  const ay = anchorY ?? 50
  const centered = ax === 50 && ay === 50

  return (
    <Section
      title="Transform"
      info="Rotation, scale, and flip pivot around the anchor point. Drag handles on the stage or the crosshair on the preview."
      open
    >
      <div className={disabled ? 'pointer-events-none opacity-40' : undefined}>
        <Slider
          className="gs-row"
          label="Rotation"
          suffix="°"
          min={rotationMin}
          max={rotationMax}
          value={rotation}
          onChange={onRotation}
        />
        <Slider
          className="gs-row"
          label="Opacity"
          suffix="%"
          min={0}
          max={100}
          value={opacity}
          onChange={onOpacity}
        />
        <Slider
          className="mt-2 gs-row"
          label="Anchor X"
          suffix="%"
          min={0}
          max={100}
          step={0.1}
          value={ax}
          onChange={(v) => onAnchor('anchorX', v)}
        />
        <Slider
          className="gs-row"
          label="Anchor Y"
          suffix="%"
          min={0}
          max={100}
          step={0.1}
          value={ay}
          onChange={(v) => onAnchor('anchorY', v)}
        />
        <Button
          variant="soft"
          full
          className="mt-2 text-[10px]"
          disabled={centered}
          onClick={onResetAnchor}
        >
          <Crosshair className="h-3.5 w-3.5" />
          Reset anchor to center
        </Button>
      </div>
    </Section>
  )
}

function ArtboardPanel() {
  const {
    settings, update, source, setCanvasWidth, setCanvasHeight, useSourceSize,
    canvasLocked, toggleCanvasLock,
  } = useStudio()

  return (
    <>
      <Section title="Artboard" info="Output board size. Separate from the base-image background layer. Not on the timeline." open>
        <div className="gs-chip-row stretch mb-3">
          <button
            type="button"
            onClick={toggleCanvasLock}
            className={cn('gs-chip focus-ring', canvasLocked && 'is-active')}
          >
            {canvasLocked ? <Lock className="h-3 w-3" /> : <Unlock className="h-3 w-3" />}
            {canvasLocked ? 'Unlock' : 'Lock'}
          </button>
        </div>
        <CanvasSizeControls
          width={settings.width}
          height={settings.height}
          sourceWidth={source?.width || 0}
          sourceHeight={source?.height || 0}
          onWidthChange={setCanvasWidth}
          onHeightChange={setCanvasHeight}
          onMatchSource={useSourceSize}
          locked={canvasLocked}
          showFit={false}
        />
      </Section>
    </>
  )
}

function BaseTransformPanel() {
  const {
    settings, setSettings, update, imageLocked, resetMotionAnchor,
  } = useStudio()

  const setBoth = (startKey, endKey, value) => {
    setSettings((current) => ({ ...current, [startKey]: value, [endKey]: value }))
  }

  return (
    <>
      <Section title="Background" info="First uploaded image — sits on the artboard like a Photoshop background layer." open>
        <div className={imageLocked ? 'pointer-events-none opacity-40' : undefined}>
          <SelectField
            label="Image fit"
            info="How this background sits on the artboard."
            value={settings.fit}
            onChange={(v) => update('fit', v)}
          >
            {FIT_MODES.map((mode) => (
              <option key={mode}>{mode}</option>
            ))}
          </SelectField>
        </div>
      </Section>

      <TransformFields
        rotation={settings.rotateStart}
        opacity={settings.opacityStart}
        onRotation={(v) => setBoth('rotateStart', 'rotateEnd', v)}
        onOpacity={(v) => setBoth('opacityStart', 'opacityEnd', v)}
        anchorX={settings.anchorX}
        anchorY={settings.anchorY}
        onAnchor={(key, value) => update(key, value)}
        onResetAnchor={resetMotionAnchor}
        disabled={imageLocked}
        rotationMin={-180}
        rotationMax={180}
      />
    </>
  )
}

function MaskPaintPanel() {
  const {
    maskBrush, setMaskBrush, resetElementMask, invertElementMask, featherElementMask,
    trimElementTransparentBounds, selectedElement, elements,
  } = useStudio()
  const el = elements.find((item) => item.id === selectedElement)
  const erasing = maskBrush.mode === 'Hide'

  return (
    <Section
      title={erasing ? 'Erase path' : 'Mask paint'}
      info={erasing
        ? 'Brush away wrong cutout pixels (hair, hand, box edges). After each stroke the layer box shrinks to what’s left.'
        : 'Reveal / restore pixels on the selected layer mask.'}
      open
    >
      {el && (
        <p className="mb-3 truncate text-[11px] text-zinc-500">
          Layer: <span className="font-medium text-zinc-300">{el.name}</span>
        </p>
      )}
      <ToggleGroup
        value={maskBrush.mode}
        onChange={(mode) => setMaskBrush((current) => ({ ...current, mode }))}
        options={[
          { value: 'Hide', label: 'Erase' },
          { value: 'Reveal', label: 'Reveal' },
        ]}
      />
      <FormGrid className="mt-3" gap={2}>
        <Field label="Size" value={maskBrush.size} onChange={(v) => setMaskBrush((current) => ({ ...current, size: v }))} min={2} max={500} suffix="px" />
        <Field label="Hardness" value={maskBrush.hardness} onChange={(v) => setMaskBrush((current) => ({ ...current, hardness: v }))} min={0} max={100} suffix="%" />
        <Field label="Opacity" value={maskBrush.opacity} onChange={(v) => setMaskBrush((current) => ({ ...current, opacity: v }))} min={1} max={100} suffix="%" />
        <Field label="Feather" value={maskBrush.feather} onChange={(v) => setMaskBrush((current) => ({ ...current, feather: v }))} min={0} max={80} suffix="px" />
      </FormGrid>
      <FormGrid gap={2} className="mt-3">
        <Button className="text-[10px]" onClick={() => resetElementMask('Rectangle')}>Rect</Button>
        <Button className="text-[10px]" onClick={() => resetElementMask('Ellipse')}>Ellipse</Button>
        <Button className="text-[10px]" onClick={invertElementMask}>Invert</Button>
        <Button className="text-[10px]" onClick={featherElementMask}>Feather</Button>
      </FormGrid>
      {erasing && selectedElement && (
        <Button
          full
          className="mt-2 text-[10px]"
          onClick={() => trimElementTransparentBounds(selectedElement)}
        >
          Tighten box now
        </Button>
      )}
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
  const { updateElement, resetMotionAnchor, activeTab } = useStudio()
  const showMotion = activeTab === 'motion' || activeTab === 'ai'

  return (
    <>
      <TransformFields
        rotation={el.rotation}
        opacity={el.opacity}
        onRotation={(v) => updateElement('rotation', v)}
        onOpacity={(v) => updateElement('opacity', v)}
        anchorX={el.anchorX}
        anchorY={el.anchorY}
        onAnchor={(key, value) => updateElement(key, value)}
        onResetAnchor={resetMotionAnchor}
        disabled={el.locked}
      />

      {showMotion && (
        <Section title="Motion" open>
          <div className={el.locked ? 'pointer-events-none opacity-40' : ''}>
            <SelectField label="Animation" value={el.motion} onChange={(v) => updateElement('motion', v)}>
              {LAYER_MOTION_OPTIONS.map((x) => (
                <option key={x}>{x}</option>
              ))}
            </SelectField>
            <Slider className="mt-3 gs-row" label="Amount" suffix="%" min={0} max={40} value={el.amplitude} onChange={(v) => updateElement('amplitude', v)} />
            <Slider className="gs-row" label="Speed" suffix="×" min={0.1} max={8} step={0.1} value={el.speed} onChange={(v) => updateElement('speed', v)} />
            <Slider className="gs-row" label="Parallax depth" suffix="%" min={0} max={100} value={el.depth ?? 50} onChange={(v) => updateElement('depth', v)} />
            <RangeEnds className="mt-1" left="Far" right="Near" />
          </div>
        </Section>
      )}
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
  const { updateOverlay, resetMotionAnchor } = useStudio()

  return (
    <TransformFields
      rotation={overlay.rotation}
      opacity={overlay.opacity}
      onRotation={(v) => updateOverlay('rotation', v)}
      onOpacity={(v) => updateOverlay('opacity', v)}
      anchorX={overlay.anchorX}
      anchorY={overlay.anchorY}
      onAnchor={(key, value) => updateOverlay(key, value)}
      onResetAnchor={resetMotionAnchor}
    />
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
        <FormGrid className="mt-3" gap={2}>
          <Field label="Size" value={layer.size} onChange={(v) => updateText('size', v)} min={4} max={1000} suffix="px" />
          <SelectField label="Weight" value={layer.weight} onChange={(v) => updateText('weight', Number(v))}>
            {[100, 200, 300, 400, 500, 600, 700, 800, 900].map((x) => <option key={x} value={x}>{x}</option>)}
          </SelectField>
        </FormGrid>
        <div className="mt-3"><Switch label="Italic" checked={layer.italic} onChange={(v) => updateText('italic', v)} /></div>
        <FormGrid className="mt-3" gap={2}>
          <SelectField label="Case" value={layer.casing} onChange={(v) => updateText('casing', v)}>
            {['As typed', 'UPPERCASE', 'lowercase'].map((x) => <option key={x}>{x}</option>)}
          </SelectField>
          <SelectField label="Decoration" value={layer.decoration} onChange={(v) => updateText('decoration', v)}>
            {['None', 'Underline', 'Strikethrough'].map((x) => <option key={x}>{x}</option>)}
          </SelectField>
        </FormGrid>
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
        <FormGrid className="mt-3" gap={2}>
          <Field label="Tracking" value={layer.letterSpacing} onChange={(v) => updateText('letterSpacing', v)} min={-20} max={100} suffix="px" />
          <Field label="Line height" value={layer.lineHeight} onChange={(v) => updateText('lineHeight', v)} min={0.5} max={4} step={0.1} suffix="×" />
        </FormGrid>
      </Section>

      <Section title="Fill & outline" open>
        <ColorField label="Text color" value={layer.color} onChange={(v) => updateText('color', v)} />
        <ColorField className="mt-3" label="Outline color" value={layer.strokeColor} onChange={(v) => updateText('strokeColor', v)} />
        <FormGrid className="mt-3" gap={2}>
          <Field label="Outline" value={layer.strokeWidth} onChange={(v) => updateText('strokeWidth', v)} min={0} max={30} suffix="px" />
          <Field label="Opacity" value={layer.opacity} onChange={(v) => updateText('opacity', v)} min={0} max={100} suffix="%" />
        </FormGrid>
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
        <FormGrid className="mt-3" gap={2}>
          <Field label="Blur" value={layer.shadowBlur} onChange={(v) => updateText('shadowBlur', v)} min={0} max={100} suffix="px" />
          <Field label="X offset" value={layer.shadowX} onChange={(v) => updateText('shadowX', v)} min={-100} max={100} suffix="px" />
          <Field label="Y offset" value={layer.shadowY} onChange={(v) => updateText('shadowY', v)} min={-100} max={100} suffix="px" />
        </FormGrid>
      </Section>
    </>
  )
}

/** Properties inspector (2nd bar) — settings for the active selection / workspace.
 *  Effects processing lives here; Background / Transform stay for Motion / AI / Text. */
export function InspectorAside({ floating = false }) {
  const {
    activeTab,
    artboardSelected,
    setArtboardSelected,
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
    maskBrush,
    selectMode,
    setSelectMode,
    cancelSelection,
    censorSelecting,
    setCensorSelecting,
    poseRig, setPoseRig,
  } = useStudio()

  const selectedLayers = elements.filter((el) => selectedElements.includes(el.id))
  const multi = selectedLayers.length >= 2
  const single = selectedLayers.length === 1 ? selectedLayers[0] : null
  const overlay = overlays.find((item) => item.id === selectedOverlay) || null
  const textLayer = textLayers.find((item) => item.id === selectedText) || null
  const jointsOpen = Boolean(poseRig.panelOpen && poseRig.joints?.length)

  const open = Boolean(
    maskEditing || selectMode || censorSelecting || jointsOpen || artboardSelected
    || textLayer
    || baseImageSelected || selectedLayers.length > 0 || Boolean(overlay),
  )

  let title = 'Properties'
  if (censorSelecting) title = 'Censor'
  else if (maskEditing) title = maskBrush?.mode === 'Hide' ? 'Erase' : 'Mask'
  else if (selectMode) title = 'Selection'
  else if (jointsOpen) title = 'Joint animation'
  else if (artboardSelected) title = 'Artboard'
  else if (textLayer) title = textLayer.name || 'Text'
  else if (multi) title = `${selectedLayers.length} layers`
  else if (single) title = single.name || 'Layer'
  else if (overlay) title = overlay.name || 'Image'
  else if (baseImageSelected) title = 'Background'

  const close = () => {
    clearLayerSelection()
    setArtboardSelected(false)
    setSelectedOverlay(null)
    setSelectedText(null)
    setMaskEditing(false)
    setCensorSelecting(false)
    setPoseRig((current) => ({ ...current, panelOpen: false }))
    if (selectMode) {
      cancelSelection()
      setSelectMode(false)
    }
  }

  let body = null
  if (censorSelecting) body = <CensorPanel />
  else if (maskEditing) body = <MaskPaintPanel />
  else if (selectMode) body = <SelectionOptionsPanel />
  else if (jointsOpen) body = <JointAnimPanel />
  else if (artboardSelected) body = <ArtboardPanel />
  else if (textLayer) body = <TextPropertiesPanel layer={textLayer} />
  else if (multi) body = <ParallaxPanel layers={selectedLayers} />
  else if (single) body = <ElementTransformPanel el={single} />
  else if (overlay) body = <OverlayTransformPanel overlay={overlay} />
  else if (baseImageSelected) body = <BaseTransformPanel />

  return (
    <SecondaryAside
      open={open}
      title={title}
      onClose={close}
      width={jointsOpen ? 280 : textLayer ? 260 : 228}
      floating={floating}
    >
      {body}
    </SecondaryAside>
  )
}

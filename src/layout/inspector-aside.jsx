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
  Section,
  SelectField,
  Slider,
  Switch,
  StatusBadge,
  Textarea,
  ToggleGroup,
} from '../components/ui'
import { useStudio } from '../context/studio-provider'
import { FIT_MODES } from '../lib/catalogs'
import { cn } from '../lib/cn'
import { KONVA_FILTER_TYPES, createFilterEntry } from '../engine/konva-filters'
import { SecondaryAside } from './secondary-aside'

function TransformFields({
  rotation,
  opacity,
  onRotation,
  onOpacity,
  posX,
  posY,
  onPosX,
  onPosY,
  scaleX,
  scaleY,
  onScaleX,
  onScaleY,
  scaleLinked = false,
  posMin = 0,
  posMax = 100,
  posStep = 0.1,
  posSuffix = '%',
  scaleMin = 1,
  scaleMax = 400,
  anchorX,
  anchorY,
  onAnchor,
  onResetAnchor,
  disabled = false,
  rotationMin = -360,
  rotationMax = 360,
  showAnchor = true,
}) {
  const ax = anchorX ?? 50
  const ay = anchorY ?? 50
  const centered = ax === 50 && ay === 50
  const showPos = typeof onPosX === 'function' && typeof onPosY === 'function'
  const showScale = typeof onScaleX === 'function'

  return (
    <Section
      title="Transform"
      info="Position, scale, and rotation match the Konva Transformer on the stage."
      open
    >
      <div className={disabled ? 'pointer-events-none opacity-40' : undefined}>
        {showPos && (
          <>
            <Slider
              className="gs-row"
              label="Position X"
              suffix={posSuffix}
              min={posMin}
              max={posMax}
              step={posStep}
              value={posX ?? 0}
              onChange={onPosX}
            />
            <Slider
              className="gs-row"
              label="Position Y"
              suffix={posSuffix}
              min={posMin}
              max={posMax}
              step={posStep}
              value={posY ?? 0}
              onChange={onPosY}
            />
          </>
        )}
        {showScale && (
          <>
            <Slider
              className="gs-row"
              label={scaleLinked || onScaleY == null ? 'Scale' : 'Scale X'}
              suffix="%"
              min={scaleMin}
              max={scaleMax}
              value={scaleX ?? 100}
              onChange={(v) => {
                onScaleX(v)
                if (scaleLinked && onScaleY) onScaleY(v)
              }}
            />
            {!scaleLinked && onScaleY && (
              <Slider
                className="gs-row"
                label="Scale Y"
                suffix="%"
                min={scaleMin}
                max={scaleMax}
                value={scaleY ?? 100}
                onChange={onScaleY}
              />
            )}
          </>
        )}
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
        {showAnchor && (
          <>
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
          </>
        )}
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
      <Section title="Artboard" info="Output board size, separate from the base-image background layer." open>
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
    settings, setSettings, update, imageLocked, resetTransformAnchor,
  } = useStudio()

  const filters = settings.imageFilters || []

  const addFilter = (type) => {
    const entry = createFilterEntry(type)
    if (!entry) return
    setSettings((s) => ({ ...s, imageFilters: [...(s.imageFilters || []), entry] }))
  }

  const updateFilter = (index, patch) => {
    setSettings((s) => ({
      ...s,
      imageFilters: (s.imageFilters || []).map((f, i) => (i === index ? { ...f, ...patch } : f)),
    }))
  }

  const removeFilter = (index) => {
    setSettings((s) => ({
      ...s,
      imageFilters: (s.imageFilters || []).filter((_, i) => i !== index),
    }))
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
        rotation={settings.rotation}
        opacity={settings.opacity}
        onRotation={(v) => update('rotation', v)}
        onOpacity={(v) => update('opacity', v)}
        posX={settings.x}
        posY={settings.y}
        onPosX={(v) => update('x', v)}
        onPosY={(v) => update('y', v)}
        scaleX={settings.scale}
        onScaleX={(v) => update('scale', v)}
        scaleLinked
        posMin={-100}
        posMax={100}
        anchorX={settings.anchorX}
        anchorY={settings.anchorY}
        onAnchor={(key, value) => update(key, value)}
        onResetAnchor={resetTransformAnchor}
        disabled={imageLocked}
        rotationMin={-180}
        rotationMax={180}
      />

      <Section
        title="Konva Filters"
        info="Official Konva.Filters — cache() + filters() on the base image. No custom liquify."
        open
      >
        <SelectField
          label="Add filter"
          value=""
          onChange={(v) => { if (v) addFilter(v) }}
        >
          <option value="">Choose…</option>
          {KONVA_FILTER_TYPES.map((f) => (
            <option key={f.type} value={f.type}>{f.label}</option>
          ))}
        </SelectField>
        {filters.length === 0 && (
          <p className="mt-2 text-[10px] text-zinc-600">No filters. Add Blur, Contrast, Grayscale, etc.</p>
        )}
        {filters.map((f, index) => {
          const meta = KONVA_FILTER_TYPES.find((x) => x.type === f.type)
          return (
            <div key={`${f.type}-${index}`} className="mt-3 rounded-lg border border-white/[.06] p-2">
              <div className="mb-1 flex items-center justify-between gap-2">
                <span className="text-[11px] font-semibold text-zinc-300">{meta?.label || f.type}</span>
                <Button size="sm" variant="soft" onClick={() => removeFilter(index)}>Remove</Button>
              </div>
              {meta?.attr && (
                <Slider
                  className="gs-row"
                  label={meta.attr}
                  min={meta.min}
                  max={meta.max}
                  step={meta.step}
                  value={f[meta.attr] ?? meta.default}
                  onChange={(v) => updateFilter(index, { [meta.attr]: v })}
                />
              )}
            </div>
          )
        })}
      </Section>
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
  const { updateElement, resetTransformAnchor } = useStudio()

  return (
    <>
      <TransformFields
        rotation={el.rotation}
        opacity={el.opacity}
        onRotation={(v) => updateElement('rotation', v)}
        onOpacity={(v) => updateElement('opacity', v)}
        posX={(el.x ?? 0) * 100}
        posY={(el.y ?? 0) * 100}
        onPosX={(v) => updateElement('x', v / 100)}
        onPosY={(v) => updateElement('y', v / 100)}
        scaleX={el.scaleX ?? 100}
        scaleY={el.scaleY ?? 100}
        onScaleX={(v) => updateElement('scaleX', v)}
        onScaleY={(v) => updateElement('scaleY', v)}
        anchorX={el.anchorX}
        anchorY={el.anchorY}
        onAnchor={(key, value) => updateElement(key, value)}
        onResetAnchor={resetTransformAnchor}
        disabled={el.locked}
      />
    </>
  )
}

function MultipleSelectionPanel({ count }) {
  return (
    <Section title="Multiple selection" open>
      <Hint>{count} layers selected. Choose one primary layer to edit its transform.</Hint>
    </Section>
  )
}

function OverlayTransformPanel({ overlay }) {
  const { updateOverlay, resetTransformAnchor } = useStudio()

  return (
    <TransformFields
      rotation={overlay.rotation}
      opacity={overlay.opacity}
      onRotation={(v) => updateOverlay('rotation', v)}
      onOpacity={(v) => updateOverlay('opacity', v)}
      posX={overlay.x}
      posY={overlay.y}
      onPosX={(v) => updateOverlay('x', v)}
      onPosY={(v) => updateOverlay('y', v)}
      scaleX={overlay.scaleX ?? overlay.scale ?? 100}
      scaleY={overlay.scaleY ?? overlay.scale ?? 100}
      onScaleX={(v) => updateOverlay('scaleX', v)}
      onScaleY={(v) => updateOverlay('scaleY', v)}
      posMin={0}
      posMax={100}
      anchorX={overlay.anchorX}
      anchorY={overlay.anchorY}
      onAnchor={(key, value) => updateOverlay(key, value)}
      onResetAnchor={resetTransformAnchor}
    />
  )
}

function TextPropertiesPanel({ layer }) {
  const {
    updateText, fontOptions, fontFileRef, uploadFont,
  } = useStudio()

  return (
    <>
      <TransformFields
        rotation={layer.rotation || 0}
        opacity={layer.opacity ?? 100}
        onRotation={(v) => updateText('rotation', v)}
        onOpacity={(v) => updateText('opacity', v)}
        posX={layer.x}
        posY={layer.y}
        onPosX={(v) => updateText('x', v)}
        onPosY={(v) => updateText('y', v)}
        scaleX={layer.scaleX ?? 100}
        scaleY={layer.scaleY ?? 100}
        onScaleX={(v) => updateText('scaleX', v)}
        onScaleY={(v) => updateText('scaleY', v)}
        posMin={0}
        posMax={100}
        showAnchor={false}
        disabled={layer.locked}
      />

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

/** Properties inspector for the active selection or workspace. */
export function InspectorAside({ floating = false }) {
  const {
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
  } = useStudio()

  const selectedLayers = elements.filter((el) => selectedElements.includes(el.id))
  const multi = selectedLayers.length >= 2
  const single = selectedLayers.length === 1 ? selectedLayers[0] : null
  const overlay = overlays.find((item) => item.id === selectedOverlay) || null
  const textLayer = textLayers.find((item) => item.id === selectedText) || null

  const open = Boolean(
    maskEditing || selectMode || artboardSelected
    || textLayer
    || baseImageSelected || selectedLayers.length > 0 || Boolean(overlay),
  )

  let title = 'Properties'
  if (maskEditing) title = maskBrush?.mode === 'Hide' ? 'Erase' : 'Mask'
  else if (selectMode) title = 'Selection'
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
    if (selectMode) {
      cancelSelection()
      setSelectMode(false)
    }
  }

  let body = null
  if (maskEditing) body = <MaskPaintPanel />
  else if (selectMode) body = <SelectionOptionsPanel />
  else if (artboardSelected) body = <ArtboardPanel />
  else if (textLayer) body = <TextPropertiesPanel layer={textLayer} />
  else if (multi) body = <MultipleSelectionPanel count={selectedLayers.length} />
  else if (single) body = <ElementTransformPanel el={single} />
  else if (overlay) body = <OverlayTransformPanel overlay={overlay} />
  else if (baseImageSelected) body = <BaseTransformPanel />

  return (
    <SecondaryAside
      open={open}
      title={title}
      onClose={close}
      width={textLayer ? 260 : 228}
      floating={floating}
    >
      {body}
    </SecondaryAside>
  )
}

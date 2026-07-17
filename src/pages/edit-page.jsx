import {
  Button,
  ColorField,
  Field,
  FormGrid,
  Hint,
  RotateControls,
  Section,
  SelectField,
  Slider,
  Switch,
} from '../components/ui'
import { EFFECT_DEFAULTS } from '../lib/presets'
import { useStudio } from '../context/studio-provider'
import { cn } from '../lib/cn'

export default function EditPage() {
  const {
    settings, update,
    effectTarget, setEffectTarget, elements, selectedElement, setElements,
    overlays, selectedOverlay, setOverlays,
    updateElement, updateOverlay, imageEdits, setImageEdits, activeEffects, updateEffect, setGifEffects,
    saveCurrentPng,
  } = useStudio()

  const isEntire = effectTarget === 'Entire GIF'
  const isElement = effectTarget === 'Selected element' && selectedElement
  const isOverlay = effectTarget === 'Selected overlay' && selectedOverlay

  const targetHint = isElement
    ? elements.find((item) => item.id === selectedElement)?.name || 'No element selected'
    : isOverlay
      ? overlays.find((item) => item.id === selectedOverlay)?.name || 'No overlay selected'
      : 'complete GIF output'

  const resetAdvanced = () => {
    if (isElement) {
      setElements((current) => current.map((element) => (
        element.id === selectedElement
          ? { ...element, effects: { ...EFFECT_DEFAULTS } }
          : element
      )))
    } else if (isOverlay) {
      setOverlays((current) => current.map((overlay) => (
        overlay.id === selectedOverlay
          ? { ...overlay, effects: { ...EFFECT_DEFAULTS } }
          : overlay
      )))
    } else {
      setGifEffects({ ...EFFECT_DEFAULTS })
    }
  }

  const selectedEl = isElement ? elements.find((item) => item.id === selectedElement) : null
  const selectedOv = isOverlay ? overlays.find((item) => item.id === selectedOverlay) : null

  return (
    <>
      <Section title="Edit target" info="All options below apply only to this target." open>
        <SelectField label="Apply edit controls to" value={effectTarget} onChange={setEffectTarget}>
          <option>Entire GIF</option>
          <option disabled={!selectedElement}>Selected element</option>
          <option disabled={!selectedOverlay}>Selected overlay</option>
        </SelectField>
        <Hint tone="info" className="mt-3 rounded-lg px-3 py-2">
          Editing <b className="text-zinc-300">{targetHint}</b>
        </Hint>
      </Section>

      {selectedEl && (
        <Section title="Layer geometry" open>
          <div className="grid grid-cols-2 gap-3">
            <Field label="X" value={Math.round(selectedEl.x * 1000) / 10} onChange={(v) => updateElement('x', v / 100)} min={-100} max={200} suffix="%" />
            <Field label="Y" value={Math.round(selectedEl.y * 1000) / 10} onChange={(v) => updateElement('y', v / 100)} min={-100} max={200} suffix="%" />
            <Field label="Width" value={Math.round(selectedEl.w * 1000) / 10} onChange={(v) => updateElement('w', v / 100)} min={1} max={300} suffix="%" />
            <Field label="Height" value={Math.round(selectedEl.h * 1000) / 10} onChange={(v) => updateElement('h', v / 100)} min={1} max={300} suffix="%" />
            <Field label="Rotation" value={selectedEl.rotation} onChange={(v) => updateElement('rotation', v)} min={-360} max={360} suffix="°" />
            <Field label="Opacity" value={selectedEl.opacity} onChange={(v) => updateElement('opacity', v)} min={0} max={100} suffix="%" />
          </div>
          <div className="mt-3 grid grid-cols-2 gap-3">
            <Switch label="Flip horizontal" checked={selectedEl.flipX} onChange={(v) => updateElement('flipX', v)} />
            <Switch label="Flip vertical" checked={selectedEl.flipY} onChange={(v) => updateElement('flipY', v)} />
          </div>
        </Section>
      )}

      {selectedOv && (
        <Section title="Overlay geometry" open>
          <div className="grid grid-cols-2 gap-3">
            <Field label="X" value={selectedOv.x} onChange={(v) => updateOverlay('x', v)} min={-100} max={200} suffix="%" />
            <Field label="Y" value={selectedOv.y} onChange={(v) => updateOverlay('y', v)} min={-100} max={200} suffix="%" />
            <Field label="Size" value={selectedOv.width} onChange={(v) => updateOverlay('width', v)} min={1} max={300} suffix="%" />
            <Field label="Rotation" value={selectedOv.rotation} onChange={(v) => updateOverlay('rotation', v)} min={-360} max={360} suffix="°" />
            <Field label="Scale X" value={selectedOv.scaleX || 100} onChange={(v) => updateOverlay('scaleX', v)} min={1} max={500} suffix="%" />
            <Field label="Scale Y" value={selectedOv.scaleY || 100} onChange={(v) => updateOverlay('scaleY', v)} min={1} max={500} suffix="%" />
            <Field label="Opacity" value={selectedOv.opacity} onChange={(v) => updateOverlay('opacity', v)} min={0} max={100} suffix="%" />
          </div>
          <RotateControls className="mt-3" value={selectedOv.rotation} onChange={(v) => updateOverlay('rotation', v)} />
          <div className="mt-3 grid grid-cols-2 gap-3">
            <Switch label="Flip horizontal" checked={selectedOv.flipX} onChange={(v) => updateOverlay('flipX', v)} />
            <Switch label="Flip vertical" checked={selectedOv.flipY} onChange={(v) => updateOverlay('flipY', v)} />
          </div>
        </Section>
      )}

      {isEntire && (
        <Section title="Base image quick adjustments" open={false}>
          <Slider className="gs-row" label="Brightness" suffix="%" min={0} max={300} value={imageEdits.brightness} onChange={(v) => setImageEdits((s) => ({ ...s, brightness: v }))} />
          <Slider className="gs-row" label="Contrast" suffix="%" min={0} max={300} value={imageEdits.contrast} onChange={(v) => setImageEdits((s) => ({ ...s, contrast: v }))} />
          <Slider className="gs-row" label="Saturation" suffix="%" min={0} max={300} value={imageEdits.saturation} onChange={(v) => setImageEdits((s) => ({ ...s, saturation: v }))} />
          <Slider className="gs-row" label="Hue" suffix="°" min={-180} max={180} value={imageEdits.hue} onChange={(v) => setImageEdits((s) => ({ ...s, hue: v }))} />
          <Slider className="gs-row" label="Blur" suffix="px" min={0} max={50} value={imageEdits.blur} onChange={(v) => setImageEdits((s) => ({ ...s, blur: v }))} />
          <Slider className="gs-row" label="Grayscale" suffix="%" min={0} max={100} value={imageEdits.grayscale} onChange={(v) => setImageEdits((s) => ({ ...s, grayscale: v }))} />
          <Slider className="gs-row" label="Sepia" suffix="%" min={0} max={100} value={imageEdits.sepia} onChange={(v) => setImageEdits((s) => ({ ...s, sepia: v }))} />
          <Button
            full
            className="mt-3 text-[10px]"
            onClick={() => setImageEdits((s) => ({
              ...s,
              brightness: 100,
              contrast: 100,
              saturation: 100,
              blur: 0,
              hue: 0,
              grayscale: 0,
              sepia: 0,
            }))}
          >
            Reset effects
          </Button>
        </Section>
      )}

      <Section title="Color & tone" open={false}>
        <Slider className="gs-row" label="Hue" suffix="°" min={-180} max={180} value={activeEffects.hue} onChange={(v) => updateEffect('hue', v)} />
        <Slider className="gs-row" label="Saturation" suffix="%" min={0} max={300} value={activeEffects.saturation} onChange={(v) => updateEffect('saturation', v)} />
        <Slider className="gs-row" label="Lightness" suffix="%" min={0} max={200} value={activeEffects.lightness} onChange={(v) => updateEffect('lightness', v)} />
        <Slider className="gs-row" label="Brightness" min={-100} max={100} value={activeEffects.brightness} onChange={(v) => updateEffect('brightness', v)} />
        <Slider className="gs-row" label="Contrast" min={-100} max={200} value={activeEffects.contrast} onChange={(v) => updateEffect('contrast', v)} />
        <div className="mt-2">
          <SelectField label="Color preset" value={activeEffects.preset} onChange={(v) => updateEffect('preset', v)}>
            {['None', 'Grayscale', 'Sepia', 'Monochrome', 'Gotham', 'Lomo', 'Nashville', 'Toaster', 'Vignette', 'Polaroid'].map((x) => (
              <option key={x}>{x}</option>
            ))}
          </SelectField>
        </div>
        <Slider className="mt-2 gs-row" label="Negative / invert" suffix="%" min={0} max={100} value={activeEffects.invert} onChange={(v) => updateEffect('invert', v)} />
        <Slider className="gs-row" label="Tint amount" suffix="%" min={0} max={100} value={activeEffects.tint} onChange={(v) => updateEffect('tint', v)} />
        <ColorField
          className="mt-3 text-[10px]"
          label="Tint color"
          value={activeEffects.tintColor}
          onChange={(v) => updateEffect('tintColor', v)}
          showHex={false}
        />
      </Section>

      <Section title="Color to transparency" open={false}>
        <Switch
          label="Replace selected color"
          checked={activeEffects.transparentEnabled}
          onChange={(v) => updateEffect('transparentEnabled', v)}
        />
        <div className="mt-3 gs-chip-row">
          <button
            type="button"
            onClick={() => updateEffect('transparentColor', '#ffffff')}
            className={cn('gs-chip flex-1', activeEffects.transparentColor === '#ffffff' && 'is-active')}
          >
            White
          </button>
          <button
            type="button"
            onClick={() => updateEffect('transparentColor', '#000000')}
            className={cn('gs-chip flex-1', activeEffects.transparentColor === '#000000' && 'is-active')}
          >
            Black
          </button>
          <input
            type="color"
            value={activeEffects.transparentColor}
            onChange={(e) => updateEffect('transparentColor', e.target.value)}
            className="h-7 w-full min-w-[2.5rem] flex-1 bg-transparent"
          />
        </div>
        <div className="mt-3 grid grid-cols-2 gap-3">
          <Field label="Fuzz" value={activeEffects.fuzz} onChange={(v) => updateEffect('fuzz', v)} min={0} max={100} suffix="%" />
          <Field label="Edge cleanup" value={activeEffects.edgeCleanup} onChange={(v) => updateEffect('edgeCleanup', v)} min={0} max={20} suffix="px" />
        </div>
        {isEntire && (
          <ColorField
            className="mt-3 text-[10px]"
            label="GIF background"
            value={settings.background}
            onChange={(v) => update('background', v)}
            showHex={false}
          />
        )}
      </Section>

      <Section title="Blur, sharpen & artistic" open={false}>
        <Slider className="gs-row" label="Gaussian blur" suffix="px" min={0} max={30} value={activeEffects.blur} onChange={(v) => updateEffect('blur', v)} />
        <Slider className="gs-row" label="Sharpen" suffix="%" min={0} max={100} value={activeEffects.sharpen} onChange={(v) => updateEffect('sharpen', v)} />
        <Slider className="gs-row" label="Oil paint" min={0} max={100} value={activeEffects.oilPaint} onChange={(v) => updateEffect('oilPaint', v)} />
        <Slider className="gs-row" label="Emboss" min={0} max={100} value={activeEffects.emboss} onChange={(v) => updateEffect('emboss', v)} />
        <Slider className="gs-row" label="Posterize" min={0} max={100} value={activeEffects.posterize} onChange={(v) => updateEffect('posterize', v)} />
        <Slider className="gs-row" label="Solarize" min={0} max={100} value={activeEffects.solarize} onChange={(v) => updateEffect('solarize', v)} />
        <Slider className="gs-row" label="Noise" min={0} max={100} value={activeEffects.noise} onChange={(v) => updateEffect('noise', v)} />
      </Section>

      <Section title="Dithering & distortion" open={false}>
        <SelectField label="Dithering" value={activeEffects.dither} onChange={(v) => updateEffect('dither', v)}>
          {['None', 'Ordered', 'Error diffusion'].map((x) => <option key={x}>{x}</option>)}
        </SelectField>
        <div className="mt-3">
          <SelectField label="Distortion" value={activeEffects.distortion} onChange={(v) => updateEffect('distortion', v)}>
            {['None', 'Swirl', 'Implode', 'Wave'].map((x) => <option key={x}>{x}</option>)}
          </SelectField>
        </div>
      </Section>

      <Section title="Decorative frame" open={false}>
        <SelectField label="Frame style" value={activeEffects.frame} onChange={(v) => updateEffect('frame', v)}>
          {['None', 'Camera', 'Fuzzy', 'Rounded corners', 'Solid border'].map((x) => (
            <option key={x}>{x}</option>
          ))}
        </SelectField>
        <ColorField
          className="mt-3 text-[10px]"
          label="Frame color"
          value={activeEffects.frameColor}
          onChange={(v) => updateEffect('frameColor', v)}
          showHex={false}
        />
        <Slider
          className="mt-2 gs-row"
          label="Frame width"
          suffix="px"
          min={1}
          max={200}
          value={activeEffects.frameWidth}
          onChange={(v) => updateEffect('frameWidth', v)}
        />
        <Slider
          className="gs-row"
          label="Corner radius"
          suffix="px"
          min={0}
          max={500}
          value={activeEffects.rounded}
          onChange={(v) => updateEffect('rounded', v)}
        />
        <Slider
          className="gs-row"
          label="Distortion amount"
          suffix="%"
          min={0}
          max={100}
          value={activeEffects.distortionAmount}
          onChange={(v) => updateEffect('distortionAmount', v)}
        />
        <Button full className="mt-3 text-[10px]" onClick={resetAdvanced}>
          Reset advanced effects
        </Button>
      </Section>

      <Section title="Save">
        <FormGrid gap={2}>
          <Button variant="solid" className="text-[10px] font-bold" onClick={() => saveCurrentPng(false)}>Save PNG</Button>
          <Button variant="accent" className="text-[10px] font-bold" onClick={() => saveCurrentPng(true)}>8-bit PNG</Button>
        </FormGrid>
        <p className="mt-2 text-[9px] leading-relaxed text-zinc-600">
          PNG saving uses oxipng O4 when installed, otherwise lossless Pillow compression. The 8-bit option reduces output to 256 colors.
        </p>
      </Section>
    </>
  )
}

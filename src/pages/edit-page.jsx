import {
  Button,
  ColorField,
  ColorSwatchRow,
  Field,
  FormGrid,
  Section,
  SelectField,
  Slider,
  StatusBadge,
  Switch,
} from '../components/ui'
import { EFFECT_DEFAULTS } from '../lib/presets'
import { COLOR_FILTER_PRESETS, DISTORTION_TYPES } from '../lib/catalogs'
import { useStudio } from '../context/studio-provider'

export default function EditPage() {
  const {
    settings, update,
    imageEdits, setImageEdits,
    activeEffects, updateEffect, effectTarget, setEffectTarget,
    selectedElement, selectedOverlay, baseImageSelected, elements, overlays,
    saveCurrentPng,
  } = useStudio()

  const selectedEl = elements.find((el) => el.id === selectedElement) || null
  const selectedOv = overlays.find((ov) => ov.id === selectedOverlay) || null

  const targetLabel = effectTarget === 'Selected element' && selectedEl
    ? selectedEl.name
    : effectTarget === 'Selected overlay' && selectedOv
      ? selectedOv.name
      : baseImageSelected || effectTarget === 'Entire GIF'
        ? 'Background / full output'
        : 'Background / full output'

  const patchEffect = (key, value) => updateEffect(key, value)

  const resetAdvanced = () => {
    if (effectTarget === 'Selected element' && selectedElement) {
      Object.entries(EFFECT_DEFAULTS).forEach(([key, value]) => updateEffect(key, value))
      return
    }
    if (effectTarget === 'Selected overlay' && selectedOverlay) {
      Object.entries(EFFECT_DEFAULTS).forEach(([key, value]) => updateEffect(key, value))
      return
    }
    Object.entries(EFFECT_DEFAULTS).forEach(([key, value]) => updateEffect(key, value))
  }

  const showBaseQuick = effectTarget === 'Entire GIF' || baseImageSelected

  return (
    <>
      <Section title="Effects" info="Color and image processing only — not motion or AI. Select a layer on the right, or choose Apply to below.">
        <StatusBadge className="mb-2" tone="neutral">
          Editing · {targetLabel}
        </StatusBadge>
        <SelectField
          label="Apply to"
          value={effectTarget}
          onChange={setEffectTarget}
        >
          <option value="Entire GIF">Background / full output</option>
          <option value="Selected element" disabled={!selectedElement}>Selected layer</option>
          <option value="Selected overlay" disabled={!selectedOverlay}>Selected image</option>
        </SelectField>
      </Section>

      {showBaseQuick && (
        <Section title="Background quick adjustments" open={false}>
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
            Reset quick adjustments
          </Button>
        </Section>
      )}

      <Section title="Color & tone" open>
        <Slider className="gs-row" label="Hue" suffix="°" min={-180} max={180} value={activeEffects.hue} onChange={(v) => patchEffect('hue', v)} />
        <Slider className="gs-row" label="Saturation" suffix="%" min={0} max={300} value={activeEffects.saturation} onChange={(v) => patchEffect('saturation', v)} />
        <Slider className="gs-row" label="Lightness" suffix="%" min={0} max={200} value={activeEffects.lightness} onChange={(v) => patchEffect('lightness', v)} />
        <Slider className="gs-row" label="Brightness" min={-100} max={100} value={activeEffects.brightness} onChange={(v) => patchEffect('brightness', v)} />
        <Slider className="gs-row" label="Contrast" min={-100} max={200} value={activeEffects.contrast} onChange={(v) => patchEffect('contrast', v)} />
        <div className="mt-2">
          <SelectField label="Color preset" value={activeEffects.preset} onChange={(v) => patchEffect('preset', v)}>
            {COLOR_FILTER_PRESETS.map((x) => (
              <option key={x}>{x}</option>
            ))}
          </SelectField>
        </div>
        <Slider className="mt-2 gs-row" label="Negative / invert" suffix="%" min={0} max={100} value={activeEffects.invert} onChange={(v) => patchEffect('invert', v)} />
        <Slider className="gs-row" label="Tint amount" suffix="%" min={0} max={100} value={activeEffects.tint} onChange={(v) => patchEffect('tint', v)} />
        <ColorField
          className="mt-3 text-[10px]"
          label="Tint color"
          value={activeEffects.tintColor}
          onChange={(v) => patchEffect('tintColor', v)}
          showHex={false}
        />
      </Section>

      <Section title="Color to transparency" open={false}>
        <Switch
          label="Replace selected color"
          checked={activeEffects.transparentEnabled}
          onChange={(v) => patchEffect('transparentEnabled', v)}
        />
        <ColorSwatchRow
          className="mt-3"
          value={activeEffects.transparentColor}
          onChange={(v) => patchEffect('transparentColor', v)}
          presets={[['White', '#ffffff'], ['Black', '#000000']]}
        />
        <FormGrid className="mt-3" gap={3}>
          <Field label="Fuzz" value={activeEffects.fuzz} onChange={(v) => patchEffect('fuzz', v)} min={0} max={100} suffix="%" />
          <Field label="Edge cleanup" value={activeEffects.edgeCleanup} onChange={(v) => patchEffect('edgeCleanup', v)} min={0} max={20} suffix="px" />
        </FormGrid>
        {effectTarget === 'Entire GIF' && (
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
        <Slider className="gs-row" label="Gaussian blur" suffix="px" min={0} max={30} value={activeEffects.blur} onChange={(v) => patchEffect('blur', v)} />
        <Slider className="gs-row" label="Sharpen" suffix="%" min={0} max={100} value={activeEffects.sharpen} onChange={(v) => patchEffect('sharpen', v)} />
        <Slider className="gs-row" label="Oil paint" min={0} max={100} value={activeEffects.oilPaint} onChange={(v) => patchEffect('oilPaint', v)} />
        <Slider className="gs-row" label="Emboss" min={0} max={100} value={activeEffects.emboss} onChange={(v) => patchEffect('emboss', v)} />
        <Slider className="gs-row" label="Posterize" min={0} max={100} value={activeEffects.posterize} onChange={(v) => patchEffect('posterize', v)} />
        <Slider className="gs-row" label="Solarize" min={0} max={100} value={activeEffects.solarize} onChange={(v) => patchEffect('solarize', v)} />
        <Slider className="gs-row" label="Noise" min={0} max={100} value={activeEffects.noise} onChange={(v) => patchEffect('noise', v)} />
      </Section>

      <Section title="Dithering & distortion" open={false}>
        <SelectField label="Dithering" value={activeEffects.dither} onChange={(v) => patchEffect('dither', v)}>
          {['None', 'Ordered', 'Error diffusion'].map((x) => <option key={x}>{x}</option>)}
        </SelectField>
        <div className="mt-3">
          <SelectField label="Distortion" value={activeEffects.distortion} onChange={(v) => patchEffect('distortion', v)}>
            {DISTORTION_TYPES.map((x) => <option key={x}>{x}</option>)}
          </SelectField>
        </div>
        {activeEffects.distortion !== 'None' && activeEffects.distortion !== 'Wave' && activeEffects.distortion !== 'Swirl' && activeEffects.distortion !== 'Implode' && (
          <>
            <Slider className="mt-3 gs-row" label="Center X" suffix="%" min={0} max={100} step={0.5} value={activeEffects.distortX ?? 50} onChange={(v) => patchEffect('distortX', v)} />
            <Slider className="gs-row" label="Center Y" suffix="%" min={0} max={100} step={0.5} value={activeEffects.distortY ?? 50} onChange={(v) => patchEffect('distortY', v)} />
            <Slider className="mt-2 gs-row" label="Brush radius" suffix="%" min={5} max={100} value={activeEffects.distortRadius ?? 50} onChange={(v) => patchEffect('distortRadius', v)} />
            {activeEffects.distortion === 'Push' && (
              <Slider className="gs-row" label="Push angle" suffix="°" min={0} max={360} value={activeEffects.distortAngle ?? 0} onChange={(v) => patchEffect('distortAngle', v)} />
            )}
          </>
        )}
        <Slider
          className="mt-2 gs-row"
          label="Distortion amount"
          suffix="%"
          min={0}
          max={100}
          value={activeEffects.distortionAmount}
          onChange={(v) => patchEffect('distortionAmount', v)}
        />
      </Section>

      <Section title="Decorative frame" open={false}>
        <SelectField label="Frame style" value={activeEffects.frame} onChange={(v) => patchEffect('frame', v)}>
          {['None', 'Camera', 'Fuzzy', 'Rounded corners', 'Solid border'].map((x) => (
            <option key={x}>{x}</option>
          ))}
        </SelectField>
        <ColorField
          className="mt-3 text-[10px]"
          label="Frame color"
          value={activeEffects.frameColor}
          onChange={(v) => patchEffect('frameColor', v)}
          showHex={false}
        />
        <Slider
          className="mt-2 gs-row"
          label="Frame width"
          suffix="px"
          min={1}
          max={200}
          value={activeEffects.frameWidth}
          onChange={(v) => patchEffect('frameWidth', v)}
        />
        <Slider
          className="gs-row"
          label="Corner radius"
          suffix="px"
          min={0}
          max={500}
          value={activeEffects.rounded}
          onChange={(v) => patchEffect('rounded', v)}
        />
        <Button full className="mt-3 text-[10px]" onClick={resetAdvanced}>
          Reset processing effects
        </Button>
      </Section>

      <Section title="Save">
        <FormGrid gap={2}>
          <Button variant="solid" className="text-[10px] font-bold" onClick={() => saveCurrentPng(false)}>Save PNG</Button>
          <Button variant="accent" className="text-[10px] font-bold" onClick={() => saveCurrentPng(true)}>8-bit PNG</Button>
        </FormGrid>
      </Section>
    </>
  )
}

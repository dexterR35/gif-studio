import {
  Button,
  ColorField,
  ColorSwatchRow,
  Field,
  FormGrid,
  Section,
  SelectField,
  Slider,
  Switch,
} from '../components/ui'
import { EFFECT_DEFAULTS } from '../lib/presets'
import { COLOR_FILTER_PRESETS, DISTORTION_TYPES } from '../lib/catalogs'
import { useStudio } from '../context/studio-provider'
import { AiToolsPanel } from '../components/studio/ai-tools-panel'

export default function EditPage() {
  const {
    settings, update,
    imageEdits, setImageEdits, gifEffects, setGifEffects,
    saveCurrentPng,
  } = useStudio()

  const patchEffect = (key, value) => {
    setGifEffects((current) => ({ ...current, [key]: value }))
  }

  const resetAdvanced = () => {
    setGifEffects({ ...EFFECT_DEFAULTS })
  }

  return (
    <>
      <AiToolsPanel />

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

      <Section title="Color & tone" open={false}>
        <Slider className="gs-row" label="Hue" suffix="°" min={-180} max={180} value={gifEffects.hue} onChange={(v) => patchEffect('hue', v)} />
        <Slider className="gs-row" label="Saturation" suffix="%" min={0} max={300} value={gifEffects.saturation} onChange={(v) => patchEffect('saturation', v)} />
        <Slider className="gs-row" label="Lightness" suffix="%" min={0} max={200} value={gifEffects.lightness} onChange={(v) => patchEffect('lightness', v)} />
        <Slider className="gs-row" label="Brightness" min={-100} max={100} value={gifEffects.brightness} onChange={(v) => patchEffect('brightness', v)} />
        <Slider className="gs-row" label="Contrast" min={-100} max={200} value={gifEffects.contrast} onChange={(v) => patchEffect('contrast', v)} />
        <div className="mt-2">
          <SelectField label="Color preset" value={gifEffects.preset} onChange={(v) => patchEffect('preset', v)}>
            {COLOR_FILTER_PRESETS.map((x) => (
              <option key={x}>{x}</option>
            ))}
          </SelectField>
        </div>
        <Slider className="mt-2 gs-row" label="Negative / invert" suffix="%" min={0} max={100} value={gifEffects.invert} onChange={(v) => patchEffect('invert', v)} />
        <Slider className="gs-row" label="Tint amount" suffix="%" min={0} max={100} value={gifEffects.tint} onChange={(v) => patchEffect('tint', v)} />
        <ColorField
          className="mt-3 text-[10px]"
          label="Tint color"
          value={gifEffects.tintColor}
          onChange={(v) => patchEffect('tintColor', v)}
          showHex={false}
        />
      </Section>

      <Section title="Color to transparency" open={false}>
        <Switch
          label="Replace selected color"
          checked={gifEffects.transparentEnabled}
          onChange={(v) => patchEffect('transparentEnabled', v)}
        />
        <ColorSwatchRow
          className="mt-3"
          value={gifEffects.transparentColor}
          onChange={(v) => patchEffect('transparentColor', v)}
          presets={[['White', '#ffffff'], ['Black', '#000000']]}
        />
        <FormGrid className="mt-3" gap={3}>
          <Field label="Fuzz" value={gifEffects.fuzz} onChange={(v) => patchEffect('fuzz', v)} min={0} max={100} suffix="%" />
          <Field label="Edge cleanup" value={gifEffects.edgeCleanup} onChange={(v) => patchEffect('edgeCleanup', v)} min={0} max={20} suffix="px" />
        </FormGrid>
        <ColorField
          className="mt-3 text-[10px]"
          label="GIF background"
          value={settings.background}
          onChange={(v) => update('background', v)}
          showHex={false}
        />
      </Section>

      <Section title="Blur, sharpen & artistic" open={false}>
        <Slider className="gs-row" label="Gaussian blur" suffix="px" min={0} max={30} value={gifEffects.blur} onChange={(v) => patchEffect('blur', v)} />
        <Slider className="gs-row" label="Sharpen" suffix="%" min={0} max={100} value={gifEffects.sharpen} onChange={(v) => patchEffect('sharpen', v)} />
        <Slider className="gs-row" label="Oil paint" min={0} max={100} value={gifEffects.oilPaint} onChange={(v) => patchEffect('oilPaint', v)} />
        <Slider className="gs-row" label="Emboss" min={0} max={100} value={gifEffects.emboss} onChange={(v) => patchEffect('emboss', v)} />
        <Slider className="gs-row" label="Posterize" min={0} max={100} value={gifEffects.posterize} onChange={(v) => patchEffect('posterize', v)} />
        <Slider className="gs-row" label="Solarize" min={0} max={100} value={gifEffects.solarize} onChange={(v) => patchEffect('solarize', v)} />
        <Slider className="gs-row" label="Noise" min={0} max={100} value={gifEffects.noise} onChange={(v) => patchEffect('noise', v)} />
      </Section>

      <Section title="Dithering & distortion" open={false}>
        <SelectField label="Dithering" value={gifEffects.dither} onChange={(v) => patchEffect('dither', v)}>
          {['None', 'Ordered', 'Error diffusion'].map((x) => <option key={x}>{x}</option>)}
        </SelectField>
        <div className="mt-3">
          <SelectField label="Distortion" value={gifEffects.distortion} onChange={(v) => patchEffect('distortion', v)}>
            {DISTORTION_TYPES.map((x) => <option key={x}>{x}</option>)}
          </SelectField>
        </div>
        {gifEffects.distortion !== 'None' && gifEffects.distortion !== 'Wave' && gifEffects.distortion !== 'Swirl' && gifEffects.distortion !== 'Implode' && (
          <>
            <Slider className="mt-3 gs-row" label="Center X" suffix="%" min={0} max={100} step={0.5} value={gifEffects.distortX ?? 50} onChange={(v) => patchEffect('distortX', v)} />
            <Slider className="gs-row" label="Center Y" suffix="%" min={0} max={100} step={0.5} value={gifEffects.distortY ?? 50} onChange={(v) => patchEffect('distortY', v)} />
            <Slider className="mt-2 gs-row" label="Brush radius" suffix="%" min={5} max={100} value={gifEffects.distortRadius ?? 50} onChange={(v) => patchEffect('distortRadius', v)} />
            {gifEffects.distortion === 'Push' && (
              <Slider className="gs-row" label="Push angle" suffix="°" min={0} max={360} value={gifEffects.distortAngle ?? 0} onChange={(v) => patchEffect('distortAngle', v)} />
            )}
          </>
        )}
        <Slider
          className="mt-2 gs-row"
          label="Distortion amount"
          suffix="%"
          min={0}
          max={100}
          value={gifEffects.distortionAmount}
          onChange={(v) => patchEffect('distortionAmount', v)}
        />
      </Section>

      <Section title="Decorative frame" open={false}>
        <SelectField label="Frame style" value={gifEffects.frame} onChange={(v) => patchEffect('frame', v)}>
          {['None', 'Camera', 'Fuzzy', 'Rounded corners', 'Solid border'].map((x) => (
            <option key={x}>{x}</option>
          ))}
        </SelectField>
        <ColorField
          className="mt-3 text-[10px]"
          label="Frame color"
          value={gifEffects.frameColor}
          onChange={(v) => patchEffect('frameColor', v)}
          showHex={false}
        />
        <Slider
          className="mt-2 gs-row"
          label="Frame width"
          suffix="px"
          min={1}
          max={200}
          value={gifEffects.frameWidth}
          onChange={(v) => patchEffect('frameWidth', v)}
        />
        <Slider
          className="gs-row"
          label="Corner radius"
          suffix="px"
          min={0}
          max={500}
          value={gifEffects.rounded}
          onChange={(v) => patchEffect('rounded', v)}
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

import { Cpu, Crosshair, ImagePlus } from 'lucide-react'
import { Button, Field, FormGrid, Hint, Section, SelectField, Slider } from '../components/ui'
import { PRESETS } from '../lib/presets'
import { BASE_MOTION_ID } from '../lib/motion-effects'
import { useStudio } from '../context/studio-provider'

export default function MotionPage() {
  const {
    settings, update, applyPreset, setAmplitude, setSpeed, overlayFileRef, addOverlay, resetMotionAnchor,
    baseImageSelected, selectedElements, elements, selectedOverlay, overlays,
    updateElement, updateOverlay,
    setSelectedMotionEffect,
  } = useStudio()

  const selectedEl = selectedElements.length === 1
    ? elements.find((el) => el.id === selectedElements[0])
    : null
  const selectedOv = overlays.find((ov) => ov.id === selectedOverlay) || null

  const anchorTarget = baseImageSelected
    ? 'image'
    : selectedOv
      ? 'overlay'
      : selectedEl
        ? 'element'
        : null

  const anchorX = anchorTarget === 'image'
    ? (settings.anchorX ?? 50)
    : anchorTarget === 'overlay'
      ? (selectedOv.anchorX ?? 50)
      : anchorTarget === 'element'
        ? (selectedEl.anchorX ?? 50)
        : 50
  const anchorY = anchorTarget === 'image'
    ? (settings.anchorY ?? 50)
    : anchorTarget === 'overlay'
      ? (selectedOv.anchorY ?? 50)
      : anchorTarget === 'element'
        ? (selectedEl.anchorY ?? 50)
        : 50
  const anchorCentered = anchorX === 50 && anchorY === 50

  const setAnchor = (key, value) => {
    if (anchorTarget === 'image') update(key, value)
    else if (anchorTarget === 'overlay') updateOverlay(key, value)
    else if (anchorTarget === 'element') updateElement(key, value)
  }

  const onPresetChange = (name) => {
    applyPreset(name)
    setSelectedMotionEffect(BASE_MOTION_ID)
  }

  return (
    <>
      <Section
        title="Motion"
        info="Basic looping animation for the GIF. Timed liquify / zoom clips live on the Timeline tab — the M lane there stays locked and mirrors these controls."
      >
        <div className="gs-chip-row">
          <SelectField
            className="min-w-[7.5rem] flex-1"
            icon={Cpu}
            value={settings.preset}
            onChange={onPresetChange}
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

        <Hint className="mt-3">
          Content layers appear as locked tracks on the Timeline. Per-layer animation is in the inspector when a layer is selected.
        </Hint>

        <Slider
          className="mt-2 gs-row"
          label="Duration"
          suffix="s"
          min={0.1}
          max={20}
          step={0.1}
          value={settings.duration}
          onChange={(v) => update('duration', v)}
        />
        <Slider
          className="gs-row"
          label="Frame rate"
          suffix="fps"
          min={1}
          max={60}
          value={settings.fps}
          onChange={(v) => update('fps', v)}
        />

        <Slider
          className="mt-2 gs-row"
          label="Amount"
          suffix="%"
          min={0}
          max={40}
          value={settings.amplitude}
          onChange={setAmplitude}
        />
        <Slider
          className="gs-row"
          label="Speed"
          suffix="×"
          min={0.1}
          max={8}
          step={0.1}
          value={settings.speed ?? 1}
          onChange={setSpeed}
        />
      </Section>

      {anchorTarget && (
        <Section
          title="Anchor point"
          info={
            anchorTarget === 'image'
              ? 'Shown when the base image is selected. Drag the crosshair on the preview.'
              : 'Shown when this layer is selected. Drag the crosshair on the preview.'
          }
        >
          <FormGrid>
            <Field label="X" value={anchorX} onChange={(v) => setAnchor('anchorX', v)} min={0} max={100} step={0.1} suffix="%" />
            <Field label="Y" value={anchorY} onChange={(v) => setAnchor('anchorY', v)} min={0} max={100} step={0.1} suffix="%" />
          </FormGrid>
          <Button
            variant="soft"
            size="lg"
            full
            className="mt-2"
            disabled={anchorCentered}
            onClick={resetMotionAnchor}
          >
            <Crosshair className="h-4 w-4" />
            Reset to center
          </Button>
        </Section>
      )}

      <Section title="Image overlays" info="Added as layers — they also show as locked tracks on the Timeline.">
        <Button variant="soft" size="lg" full onClick={() => overlayFileRef.current?.click()}>
          <ImagePlus className="h-4 w-4" />
          Add image
        </Button>
        <input
          ref={overlayFileRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={(e) => {
            addOverlay(e.target.files[0])
            e.target.value = ''
          }}
        />
      </Section>
    </>
  )
}

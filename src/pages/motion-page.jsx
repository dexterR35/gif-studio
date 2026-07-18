import { Cpu, ImagePlus } from 'lucide-react'
import { Button, Section, SelectField, Slider } from '../components/ui'
import { PRESETS } from '../lib/presets'
import { EASING_OPTIONS } from '../lib/catalogs'
import { BASE_MOTION_ID } from '../lib/motion-effects'
import { useStudio } from '../context/studio-provider'

export default function MotionPage() {
  const {
    settings, update, applyPreset, setAmplitude, setSpeed, overlayFileRef, addOverlay,
    setSelectedMotionEffect,
  } = useStudio()

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
            {EASING_OPTIONS.map((x) => (
              <option key={x}>{x}</option>
            ))}
          </SelectField>
        </div>

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

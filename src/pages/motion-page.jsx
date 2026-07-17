import { Cpu } from 'lucide-react'
import { Field, FormGrid, Section, SelectField, Slider } from '../components/ui'
import { BASE_MOTIONS, PRESETS } from '../lib/presets'
import { useStudio } from '../context/studio-provider'
import { cn } from '../lib/cn'

export default function MotionPage() {
  const { settings, update, applyPreset } = useStudio()

  const animationActive = (settings.motion || 'None') !== 'None'

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
    </>
  )
}

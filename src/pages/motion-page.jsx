import { Cpu, Crosshair, ImagePlus, Lock, Trash2 } from 'lucide-react'
import { Button, DualRange, Field, FormGrid, Section, SelectField, Slider } from '../components/ui'
import { PRESETS } from '../lib/presets'
import {
  ANIMATE_MODES,
  BASE_MOTION_ID,
  MOTION_EFFECT_COLORS,
  MOTION_EFFECT_TYPES,
  MAX_MOTION_EFFECTS,
  defaultAnimateForType,
  getBaseMotionClip,
  isBaseMotionClip,
} from '../lib/motion-effects'
import { useStudio } from '../context/studio-provider'
import { cn } from '../lib/cn'

export default function MotionPage() {
  const {
    settings, update, applyPreset, setAmplitude, setSpeed, overlayFileRef, addOverlay, resetMotionAnchor,
    baseImageSelected, selectedElements, elements, selectedOverlay, overlays,
    updateElement, updateOverlay,
    selectedMotionEffect, setSelectedMotionEffect,
    updateMotionEffect, removeMotionEffect,
  } = useStudio()

  const clips = settings.motionEffects || []
  const baseClip = getBaseMotionClip(settings)
  const duration = Math.max(0.1, settings.duration || 1)
  const baseSelected = isBaseMotionClip(selectedMotionEffect)
  const selected = !baseSelected
    ? (clips.find((clip) => clip.id === selectedMotionEffect) || null)
    : null

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
        info="Base motion is locked on the timeline (lane M). Change it with the Motion dropdown. Extra liquify / zoom clips go on V1–V3 below."
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

        {/* Locked base motion layer — mirrors dropdown; not editable here beyond preset */}
        <button
          type="button"
          onClick={() => setSelectedMotionEffect(BASE_MOTION_ID)}
          className={cn(
            'mt-3 flex w-full items-center gap-2 rounded-lg border px-2.5 py-2 text-left text-[11px] transition',
            baseSelected
              ? 'border-acid/40 bg-acid/10 text-zinc-100'
              : 'border-white/[.06] bg-white/[.02] text-zinc-400 hover:border-white/10 hover:text-zinc-200',
          )}
        >
          <span
            className="h-2 w-2 shrink-0 rounded-full"
            style={{ background: MOTION_EFFECT_COLORS.Base }}
          />
          <span className="w-6 shrink-0 font-mono text-[9px] text-zinc-600">M</span>
          <span className="min-w-0 flex-1 truncate font-semibold">{baseClip.type}</span>
          <Lock className="h-3 w-3 shrink-0 text-zinc-600" />
          <span className="font-mono text-[10px] text-zinc-500">
            0s → {duration.toFixed(1)}s
          </span>
        </button>

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

      {selected && (
        <Section
          title="Timeline effect"
          info={`Edit the selected V-lane clip (max ${MAX_MOTION_EFFECTS}). Add clips from the timeline under play.`}
          open
        >
          <div className="mb-2 flex items-center justify-between gap-2">
            <SelectField
              className="min-w-0 flex-1"
              value={selected.type}
              onChange={(v) => updateMotionEffect(selected.id, { type: v })}
            >
              {MOTION_EFFECT_TYPES.map((type) => (
                <option key={type}>{type}</option>
              ))}
            </SelectField>
            <Button
              variant="soft"
              size="sm"
              onClick={() => removeMotionEffect(selected.id)}
            >
              <Trash2 className="h-3.5 w-3.5" />
            </Button>
          </div>

          <p className="mb-2 font-mono text-[10px] text-zinc-500">
            V{(selected.track ?? 0) + 1} · {selected.in.toFixed(1)}s → {selected.out.toFixed(1)}s
          </p>

          <DualRange
            label="In / Out"
            info="When this effect is active (seconds)."
            start={selected.in}
            end={selected.out}
            min={0}
            max={duration}
            step={0.1}
            suffix="s"
            onStart={(v) => updateMotionEffect(selected.id, { in: Math.min(v, selected.out - 0.05) })}
            onEnd={(v) => updateMotionEffect(selected.id, { out: Math.max(v, selected.in + 0.05) })}
          />

          <div className="mt-2">
            <SelectField
              label="Animate"
              info="Continuous motion from In → Out across the GIF timeline (not only fade)."
              value={selected.animate || defaultAnimateForType(selected.type)}
              onChange={(v) => updateMotionEffect(selected.id, { animate: v })}
            >
              {ANIMATE_MODES.map((mode) => (
                <option key={mode}>{mode}</option>
              ))}
            </SelectField>
          </div>
          <Slider
            className="gs-row"
            label="Cycles"
            info="How many times the animation repeats between In and Out."
            suffix="×"
            min={0.5}
            max={8}
            step={0.5}
            value={selected.cycles ?? 1}
            onChange={(v) => updateMotionEffect(selected.id, { cycles: v })}
          />

          <Slider
            className="gs-row"
            label="Peak amount"
            suffix="%"
            min={0}
            max={100}
            value={selected.amount}
            onChange={(v) => updateMotionEffect(selected.id, { amount: v })}
          />
          <Slider
            className="gs-row"
            label="Fade in"
            suffix="%"
            info="Portion of the clip used to ramp strength up."
            min={0}
            max={50}
            value={selected.fadeIn}
            onChange={(v) => updateMotionEffect(selected.id, { fadeIn: v })}
          />
          <Slider
            className="gs-row"
            label="Fade out"
            suffix="%"
            info="Portion of the clip used to ramp strength down."
            min={0}
            max={50}
            value={selected.fadeOut}
            onChange={(v) => updateMotionEffect(selected.id, { fadeOut: v })}
          />

          {selected.type !== 'Zoom' && (
            <>
              <Slider
                className="mt-2 gs-row"
                label="Center X"
                suffix="%"
                info="Base center — path modes (Left → Right, Orbit, Random) animate from here."
                min={0}
                max={100}
                step={0.5}
                value={selected.x}
                onChange={(v) => updateMotionEffect(selected.id, { x: v })}
              />
              <Slider
                className="gs-row"
                label="Center Y"
                suffix="%"
                min={0}
                max={100}
                step={0.5}
                value={selected.y}
                onChange={(v) => updateMotionEffect(selected.id, { y: v })}
              />
              {selected.type !== 'Swirl' && selected.type !== 'Wave' && (
                <Slider
                  className="gs-row"
                  label="Brush radius"
                  suffix="%"
                  min={5}
                  max={100}
                  value={selected.radius}
                  onChange={(v) => updateMotionEffect(selected.id, { radius: v })}
                />
              )}
            </>
          )}

          {(selected.type === 'Push' || selected.animate === 'Spin') && (
            <Slider
              className="gs-row"
              label="Push / spin angle"
              suffix="°"
              min={0}
              max={360}
              value={selected.angle ?? 0}
              onChange={(v) => updateMotionEffect(selected.id, { angle: v })}
            />
          )}
        </Section>
      )}

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

      <Section title="Image overlays" info="Added as layers — click on the canvas or layers list to select.">
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

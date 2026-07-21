import { Lock, Trash2 } from 'lucide-react'
import { Button, DualRange, Hint, Section, SelectField, Slider } from '../components/ui'
import { TimelineAddChips } from '../components/studio/timeline-add-chips'
import {
  ANIMATE_MODES,
  BASE_MOTION_ID,
  MOTION_EFFECT_COLORS,
  MOTION_EFFECT_TYPES,
  MAX_MOTION_EFFECTS,
  defaultAnimateForType,
  getBaseMotionClip,
  isBaseMotionClip,
  isLayerTrackId,
  layerTrackId,
  parseLayerTrackId,
} from '../lib/motion-effects'
import { MAX_TEXT_LAYERS } from '../lib/presets'
import { useStudio } from '../context/studio-provider'
import { useStudioStore } from '../store/studio-store'
import { KeyframeTimeline, createKeyframe } from '../timeline/keyframe-timeline'
import { cn } from '../lib/cn'

function LockedTrackRow({ color, lane, title }) {
  return (
    <div className="flex items-center gap-2 rounded-lg border border-white/[.06] bg-white/[.02] px-2.5 py-2 text-[11px] text-zinc-300">
      <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: color }} />
      {lane && <span className="w-6 shrink-0 font-mono text-[9px] text-zinc-600">{lane}</span>}
      <span className="min-w-0 flex-1 truncate font-semibold">{title}</span>
      <Lock className="h-3 w-3 shrink-0 text-zinc-600" />
    </div>
  )
}

export default function TimelinePage() {
  const {
    settings,
    elements, overlays, textLayers,
    selectedMotionEffect, setSelectedMotionEffect,
    addMotionEffect, updateMotionEffect, removeMotionEffect,
    addTextLayer, updateTextById, removeText, setSelectedText,
    goToWorkspace, progress, setProgress, setPlaying, draw, actualDuration,
  } = useStudio()

  const keyframes = useStudioStore((s) => s.editor.keyframes)
  const setKeyframes = useStudioStore((s) => s.setKeyframes)
  const selectedKeyframe = useStudioStore((s) => s.editor._selectedKeyframeId)
  const patchProject = useStudioStore((s) => s.patchProject)

  const clips = settings.motionEffects || []
  const baseClip = getBaseMotionClip(settings)
  const duration = Math.max(0.1, settings.duration || 1)
  const baseSelected = isBaseMotionClip(selectedMotionEffect)
  const layerRef = parseLayerTrackId(selectedMotionEffect)
  const selectedTextLayer = layerRef?.kind === 'text'
    ? (textLayers.find((item) => item.id === layerRef.id) || null)
    : null
  const lockedLayerRef = layerRef && layerRef.kind !== 'text' ? layerRef : null
  const selected = !baseSelected && !layerRef
    ? (clips.find((clip) => clip.id === selectedMotionEffect) || null)
    : null

  const lockedLayerInfo = (() => {
    if (!lockedLayerRef) return null
    if (lockedLayerRef.kind === 'element') {
      const el = elements.find((item) => item.id === lockedLayerRef.id)
      return el ? { kind: 'Element', name: el.name, motion: el.motion || 'Float', amount: el.amplitude ?? 0 } : null
    }
    if (lockedLayerRef.kind === 'overlay') {
      const ov = overlays.find((item) => item.id === lockedLayerRef.id)
      return ov ? { kind: 'Overlay', name: ov.name, motion: 'Static', amount: 0 } : null
    }
    return null
  })()

  const addClip = (type) => {
    const id = addMotionEffect(type)
    if (id != null) setSelectedMotionEffect(id)
  }

  const addText = () => {
    const id = addTextLayer({ stay: true })
    if (id != null) setSelectedMotionEffect(layerTrackId('text', id))
  }

  return (
    <>
      <Section
        title="Keyframes"
        info="Property keyframes for opacity, scale, and position. Double-click a track to add."
        open
      >
        <KeyframeTimeline
          duration={settings.duration}
          keyframes={keyframes || []}
          playhead={(progress || 0) * Math.max(0.1, settings.duration || 1)}
          selectedId={selectedKeyframe || null}
          onSelect={(id) => patchProject({ _selectedKeyframeId: id })}
          onChange={setKeyframes}
          onScrub={(t) => {
            setPlaying(false)
            setProgress(t, { force: true })
            draw(t)
          }}
          onAdd={(track, time) => {
            const defaults = { opacity: 100, scale: 100, x: 0, y: 0 }
            setKeyframes([
              ...(keyframes || []),
              createKeyframe({
                time,
                prop: track.prop,
                value: defaults[track.prop] ?? 100,
              }),
            ])
          }}
        />
        <p className="mt-2 text-[10px] text-zinc-600">
          Duration {Number(actualDuration || settings.duration).toFixed(2)}s ·{' '}
          {Math.max(2, Math.round((settings.duration || 1) * (settings.fps || 24)))} frames @ {settings.fps} fps
        </p>
      </Section>

      <Section
        title="Timeline"
        info="Timed effects and text tracks live here. Base motion and image layers stay locked mirrors from Motion."
        open
      >
        <TimelineAddChips
          textCount={textLayers.length}
          effectCount={clips.length}
          onAddText={addText}
          onAddEffect={addClip}
        />
        <p className="mt-2 font-mono text-[10px] text-zinc-500">
          {textLayers.length}/{MAX_TEXT_LAYERS} text · {clips.length}/{MAX_MOTION_EFFECTS} effects
        </p>
      </Section>

      {baseSelected && (
        <Section title="Base motion" open>
          <LockedTrackRow color={MOTION_EFFECT_COLORS.Base} lane="M" title={baseClip.type} />
          <Hint className="mt-3">
            Locked lane updated from the Motion tab (preset, amount, speed, duration). Image transform settings are unavailable while editing the timeline.
          </Hint>
          <Button variant="soft" size="lg" full className="mt-3" onClick={() => goToWorkspace('motion')}>
            Edit basic animation
          </Button>
        </Section>
      )}

      {selectedTextLayer && (
        <Section title="Text track" info="Drag or trim on the timeline. Style and animation details stay on the Text tab." open>
          <div className="mb-2 flex items-center justify-between gap-2">
            <div className="min-w-0 flex-1 truncate text-[11px] font-semibold text-zinc-200">
              {selectedTextLayer.text || 'Empty text'}
            </div>
            <Button
              variant="soft"
              size="sm"
              onClick={() => {
                removeText(selectedTextLayer.id)
                setSelectedMotionEffect(null)
              }}
            >
              <Trash2 className="h-3.5 w-3.5" />
            </Button>
          </div>

          <p className="mb-2 font-mono text-[10px] text-zinc-500">
            {(selectedTextLayer.in ?? 0).toFixed(1)}s → {(selectedTextLayer.out ?? duration).toFixed(1)}s
          </p>

          <DualRange
            label="In / Out"
            info="When this text is visible on the GIF."
            start={selectedTextLayer.in ?? 0}
            end={selectedTextLayer.out ?? duration}
            min={0}
            max={duration}
            step={0.1}
            suffix="s"
            onStart={(v) => updateTextById(selectedTextLayer.id, {
              in: Math.min(v, (selectedTextLayer.out ?? duration) - 0.05),
            })}
            onEnd={(v) => updateTextById(selectedTextLayer.id, {
              out: Math.max(v, (selectedTextLayer.in ?? 0) + 0.05),
            })}
          />

          <p className="mt-3 text-[11px] text-zinc-500">
            Loop: <b className="text-zinc-300">{selectedTextLayer.motion || 'None'}</b>
            {' · '}
            Entrance: <b className="text-zinc-300">{selectedTextLayer.entrance || 'None'}</b>
          </p>

          <Button
            variant="soft"
            size="lg"
            full
            className="mt-3"
            onClick={() => {
              setSelectedText(selectedTextLayer.id)
              goToWorkspace('text')
            }}
          >
            Edit text style
          </Button>
        </Section>
      )}

      {lockedLayerInfo && (
        <Section title="Layer track" open>
          <LockedTrackRow color="#94a3b8" title={`${lockedLayerInfo.name} · ${lockedLayerInfo.kind}`} />
          <p className="mt-2 text-[11px] text-zinc-500">
            Motion: <b className="text-zinc-300">{lockedLayerInfo.motion}</b>
            {lockedLayerInfo.kind === 'Element' && (
              <> · amount <b className="text-zinc-300">{lockedLayerInfo.amount}%</b></>
            )}
          </p>
          <Hint className="mt-3">
            Image / element tracks stay locked on the timeline. Open Motion to change their basic animation.
          </Hint>
          <Button
            variant="soft"
            size="lg"
            full
            className="mt-3"
            onClick={() => {
              setSelectedMotionEffect(null)
              goToWorkspace('motion')
            }}
          >
            Open Motion
          </Button>
        </Section>
      )}

      {selected && (
        <Section
          title="Timeline effect"
          info={`Edit the selected V-lane clip (max ${MAX_MOTION_EFFECTS}).`}
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

      {!selected && !baseSelected && !selectedTextLayer && !isLayerTrackId(selectedMotionEffect) && (
        <Section title="Selection" open>
          <Hint>
            Select a text track or V-lane clip on the timeline to edit it. Base motion (M) and image layers are locked.
          </Hint>
          <button
            type="button"
            onClick={() => setSelectedMotionEffect(BASE_MOTION_ID)}
            className={cn(
              'mt-3 flex w-full items-center gap-2 rounded-lg border px-2.5 py-2 text-left text-[11px] transition',
              'border-white/[.06] bg-white/[.02] text-zinc-400 hover:border-white/10 hover:text-zinc-200',
            )}
          >
            <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: MOTION_EFFECT_COLORS.Base }} />
            <span className="w-6 shrink-0 font-mono text-[9px] text-zinc-600">M</span>
            <span className="min-w-0 flex-1 truncate font-semibold">{baseClip.type}</span>
            <Lock className="h-3 w-3 shrink-0 text-zinc-600" />
          </button>
        </Section>
      )}
    </>
  )
}

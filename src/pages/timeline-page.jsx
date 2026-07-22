import { Lock, Trash2 } from 'lucide-react'
import { Button, DualRange, Hint, Section } from '../components/ui'
import { TimelineAddChips } from '../components/studio/timeline-add-chips'
import {
  BASE_MOTION_ID,
  BASE_MOTION_COLOR,
  getBaseMotionClip,
  isBaseMotionClip,
  isLayerTrackId,
  layerTrackId,
  parseLayerTrackId,
} from '../lib/timeline-ids'
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
    addTextLayer, updateTextById, removeText, setSelectedText,
    goToWorkspace, progress, setProgress, setPlaying, draw, actualDuration,
  } = useStudio()

  const keyframes = useStudioStore((s) => s.editor.keyframes)
  const setKeyframes = useStudioStore((s) => s.setKeyframes)
  const selectedKeyframe = useStudioStore((s) => s.editor._selectedKeyframeId)
  const patchProject = useStudioStore((s) => s.patchProject)

  const baseClip = getBaseMotionClip(settings)
  const duration = Math.max(0.1, settings.duration || 1)
  const baseSelected = isBaseMotionClip(selectedMotionEffect)
  const layerRef = parseLayerTrackId(selectedMotionEffect)
  const selectedTextLayer = layerRef?.kind === 'text'
    ? (textLayers.find((item) => item.id === layerRef.id) || null)
    : null
  const lockedLayerRef = layerRef && layerRef.kind !== 'text' ? layerRef : null

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
        info="Text tracks live here. Base motion mirrors the Motion tab (Konva Tweens / Animations)."
        open
      >
        <TimelineAddChips
          textCount={textLayers.length}
          onAddText={addText}
        />
        <p className="mt-2 font-mono text-[10px] text-zinc-500">
          {textLayers.length}/{MAX_TEXT_LAYERS} text
        </p>
      </Section>

      {baseSelected && (
        <Section title="Base motion" open>
          <LockedTrackRow color={BASE_MOTION_COLOR} lane="M" title={baseClip.type} />
          <Hint className="mt-3">
            Locked lane updated from the Motion tab (preset, amount, speed, duration).
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

      {!baseSelected && !selectedTextLayer && !isLayerTrackId(selectedMotionEffect) && (
        <Section title="Selection" open>
          <Hint>
            Select a text track on the timeline to edit it. Base motion (M) and image layers are locked.
          </Hint>
          <button
            type="button"
            onClick={() => setSelectedMotionEffect(BASE_MOTION_ID)}
            className={cn(
              'mt-3 flex w-full items-center gap-2 rounded-lg border px-2.5 py-2 text-left text-[11px] transition',
              'border-white/[.06] bg-white/[.02] text-zinc-400 hover:border-white/10 hover:text-zinc-200',
            )}
          >
            <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: BASE_MOTION_COLOR }} />
            <span className="w-6 shrink-0 font-mono text-[9px] text-zinc-600">M</span>
            <span className="min-w-0 flex-1 truncate font-semibold">{baseClip.type}</span>
            <Lock className="h-3 w-3 shrink-0 text-zinc-600" />
          </button>
        </Section>
      )}
    </>
  )
}

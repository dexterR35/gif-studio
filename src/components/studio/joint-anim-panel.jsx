/**
 * Joint animation settings — range keys + timeline for start → end motion.
 */
import { useMemo, useState } from 'react'
import { Crosshair } from 'lucide-react'
import {
  Button, RangeEnds, Section, SelectField, Slider,
} from '../ui'
import { KeyframeTimeline } from '../../timeline/keyframe-timeline'
import { useStudio } from '../../context/studio-provider'
import {
  POSE_KEY_JOINTS, emptyJointKey, sampleJointKey,
} from '../../lib/pose'

function labelJoint(name) {
  return (name || '').replace(/_/g, ' ')
}

const OFFSET_MIN = -20
const OFFSET_MAX = 20

function toPct(n) {
  return Math.round((Number(n) || 0) * 1000) / 10
}

function fromPct(n) {
  return (Number(n) || 0) / 100
}

export function JointAnimPanel() {
  const {
    poseRig, setPoseRig, progress, setProgress, setPlaying, draw,
    settings, actualDuration, elements,
  } = useStudio()

  const [activeKey, setActiveKey] = useState('start') // start | end

  const joints = (poseRig.joints || []).filter((j) => (j.score ?? 1) >= 0.25)
  const keyNames = POSE_KEY_JOINTS.filter((name) => joints.some((j) => j.name === name))
  const selected = poseRig.selectedJoint && keyNames.includes(poseRig.selectedJoint)
    ? poseRig.selectedJoint
    : (keyNames[0] || null)

  const key = (selected && poseRig.jointKeys?.[selected]) || emptyJointKey()
  const at = sampleJointKey(key, progress)
  const clipSec = actualDuration || settings.duration || 1
  const timeSec = progress * clipSec

  const bodyLayer = elements.find((el) => el.name === 'Body' || el.poseJoints?.length) || null

  const selectJoint = (name) => {
    setPoseRig((current) => ({
      ...current,
      selectedJoint: name,
      panelOpen: true,
      jointKeys: {
        ...current.jointKeys,
        [name]: current.jointKeys?.[name] || emptyJointKey(),
      },
    }))
  }

  const patchKey = (patch) => {
    if (!selected) return
    setPoseRig((current) => ({
      ...current,
      keysVersion: (current.keysVersion || 0) + 1,
      jointKeys: {
        ...current.jointKeys,
        [selected]: { ...(current.jointKeys?.[selected] || emptyJointKey()), ...patch },
      },
    }))
  }

  const scrub = (t) => {
    setPlaying(false)
    setProgress(t, { force: true })
    draw(t)
  }

  const goKey = (which) => {
    setActiveKey(which)
    scrub(which === 'start' ? 0 : 1)
  }

  const setStartFromCurrent = () => {
    setActiveKey('start')
    patchKey({ startDx: at.dx, startDy: at.dy })
  }

  const setEndFromCurrent = () => {
    setActiveKey('end')
    patchKey({ endDx: at.dx, endDy: at.dy })
  }

  const resetJoint = () => {
    if (!selected) return
    setPoseRig((current) => {
      const next = { ...current.jointKeys }
      delete next[selected]
      return { ...current, jointKeys: next, keysVersion: (current.keysVersion || 0) + 1 }
    })
  }

  const timelineKeyframes = useMemo(() => {
    if (!selected) return []
    return [
      { id: `${selected}-start-x`, time: 0, prop: 'x', value: toPct(key.startDx), target: 'start' },
      { id: `${selected}-end-x`, time: clipSec, prop: 'x', value: toPct(key.endDx), target: 'end' },
      { id: `${selected}-start-y`, time: 0, prop: 'y', value: toPct(key.startDy), target: 'start' },
      { id: `${selected}-end-y`, time: clipSec, prop: 'y', value: toPct(key.endDy), target: 'end' },
    ]
  }, [selected, key.startDx, key.startDy, key.endDx, key.endDy, clipSec])

  const selectedKfId = selected
    ? `${selected}-${activeKey}-x`
    : null

  if (!joints.length) {
    return (
      <Section title="Joints" info="Detect joints on the AI tab first." open>
        <p className="text-[11px] text-zinc-500">No joints yet.</p>
      </Section>
    )
  }

  return (
    <>
      <Section
        title="Joint animation"
        info="Range keys move the selected joint from start → end across the clip. Mesh warp bakes into the GIF; skeleton dots stay preview-only."
        open
      >
        {bodyLayer && (
          <p className="mb-2 truncate text-[11px] text-zinc-500">
            Layer · <span className="font-medium text-zinc-300">{bodyLayer.name}</span>
          </p>
        )}

        <SelectField
          label="Joint"
          value={selected || ''}
          onChange={selectJoint}
        >
          {keyNames.map((name) => (
            <option key={name} value={name}>{labelJoint(name)}</option>
          ))}
        </SelectField>

        <div className="mt-3">
          <KeyframeTimeline
            duration={clipSec}
            playhead={timeSec}
            keyframes={timelineKeyframes}
            selectedId={selectedKfId}
            tracks={[
              { id: 'x', label: 'Offset X', prop: 'x', color: '#d8ff3e' },
              { id: 'y', label: 'Offset Y', prop: 'y', color: '#60a5fa' },
            ]}
            onScrub={scrub}
            onSelect={(id) => {
              if (id?.includes('-start-')) {
                setActiveKey('start')
                scrub(0)
              } else if (id?.includes('-end-')) {
                setActiveKey('end')
                scrub(1)
              }
            }}
            hint={`Diamonds = start (0s) and end (${clipSec.toFixed(1)}s). Click a key then drag the ranges.`}
            onChange={() => {
              /* Joint model is fixed start@0 / end@duration — values edit via ranges below. */
            }}
            onAdd={() => {
              /* Two keys only — start and end. */
            }}
          />
        </div>

        <div className="mt-3 flex gap-2">
          <Button
            className={`flex-1 text-[10px] ${activeKey === 'start' ? 'ring-1 ring-acid/50' : ''}`}
            onClick={() => goKey('start')}
          >
            Start · 0s
          </Button>
          <Button
            className={`flex-1 text-[10px] ${activeKey === 'end' ? 'ring-1 ring-acid/50' : ''}`}
            onClick={() => goKey('end')}
          >
            End · {clipSec.toFixed(1)}s
          </Button>
        </div>

        <p className="mt-3 text-[10px] font-semibold uppercase tracking-[.12em] text-zinc-500">
          {activeKey === 'start' ? 'Start key · t = 0' : `End key · t = ${clipSec.toFixed(1)}s`}
        </p>

        {activeKey === 'start' ? (
          <>
            <Slider
              className="mt-2 gs-row"
              label="X"
              suffix="%"
              min={OFFSET_MIN}
              max={OFFSET_MAX}
              step={0.1}
              value={toPct(key.startDx)}
              onChange={(v) => patchKey({ startDx: fromPct(v) })}
            />
            <Slider
              className="gs-row"
              label="Y"
              suffix="%"
              min={OFFSET_MIN}
              max={OFFSET_MAX}
              step={0.1}
              value={toPct(key.startDy)}
              onChange={(v) => patchKey({ startDy: fromPct(v) })}
            />
          </>
        ) : (
          <>
            <Slider
              className="mt-2 gs-row"
              label="X"
              suffix="%"
              min={OFFSET_MIN}
              max={OFFSET_MAX}
              step={0.1}
              value={toPct(key.endDx)}
              onChange={(v) => patchKey({ endDx: fromPct(v) })}
            />
            <Slider
              className="gs-row"
              label="Y"
              suffix="%"
              min={OFFSET_MIN}
              max={OFFSET_MAX}
              step={0.1}
              value={toPct(key.endDy)}
              onChange={(v) => patchKey({ endDy: fromPct(v) })}
            />
          </>
        )}
        <RangeEnds className="mt-1" left={`${OFFSET_MIN}%`} right={`${OFFSET_MAX}%`} />

        <div className="mt-3 grid grid-cols-2 gap-2">
          <Button className="text-[10px]" onClick={setStartFromCurrent}>
            <Crosshair className="h-3 w-3" /> Key start here
          </Button>
          <Button className="text-[10px]" onClick={setEndFromCurrent}>
            <Crosshair className="h-3 w-3" /> Key end here
          </Button>
        </div>

        <Button variant="soft" full className="mt-2 text-[10px]" onClick={resetJoint}>
          Reset this joint
        </Button>

        <p className="mt-3 font-mono text-[9px] text-zinc-600">
          Now {timeSec.toFixed(2)}s · offset {toPct(at.dx).toFixed(1)}% / {toPct(at.dy).toFixed(1)}%
        </p>
      </Section>
    </>
  )
}

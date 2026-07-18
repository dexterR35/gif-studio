/**
 * Joint animation settings — key start/end offsets over the clip length.
 */
import { Crosshair } from 'lucide-react'
import {
  Button, Field, FormGrid, RangeEnds, Section, SelectField, Slider,
} from '../ui'
import { useStudio } from '../../context/studio-provider'
import {
  POSE_KEY_JOINTS, emptyJointKey, sampleJointKey,
} from '../../lib/pose'

function labelJoint(name) {
  return (name || '').replace(/_/g, ' ')
}

export function JointAnimPanel() {
  const {
    poseRig, setPoseRig, progress, setProgress, setPlaying, draw,
    settings, actualDuration,
  } = useStudio()

  const joints = (poseRig.joints || []).filter((j) => (j.score ?? 1) >= 0.25)
  const keyNames = POSE_KEY_JOINTS.filter((name) => joints.some((j) => j.name === name))
  const selected = poseRig.selectedJoint && keyNames.includes(poseRig.selectedJoint)
    ? poseRig.selectedJoint
    : (keyNames[0] || null)

  const key = (selected && poseRig.jointKeys?.[selected]) || emptyJointKey()
  const at = sampleJointKey(key, progress)
  const clipSec = actualDuration || settings.duration || 1
  const timeSec = progress * clipSec

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

  const setStartFromCurrent = () => {
    patchKey({ startDx: at.dx, startDy: at.dy })
  }

  const setEndFromCurrent = () => {
    patchKey({ endDx: at.dx, endDy: at.dy })
  }

  const resetJoint = () => {
    if (!selected) return
    setPoseRig((current) => {
      const next = { ...current.jointKeys }
      delete next[selected]
      return { ...current, jointKeys: next }
    })
  }

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
        info="Pick a joint, set start and end offsets. Motion spans the full clip length (playhead below). Example: move a wrist from rest to a wave pose."
        open
      >
        <SelectField
          label="Joint"
          value={selected || ''}
          onChange={selectJoint}
        >
          {keyNames.map((name) => (
            <option key={name} value={name}>{labelJoint(name)}</option>
          ))}
        </SelectField>

        <Slider
          className="mt-3 gs-row"
          label="Clip playhead"
          suffix={`s / ${clipSec.toFixed(1)}s`}
          min={0}
          max={1}
          step={0.01}
          value={progress}
          onChange={scrub}
        />
        <RangeEnds className="mt-1" left={`Start 0.0s`} right={`End ${clipSec.toFixed(1)}s`} />

        <p className="mt-3 text-[10px] font-semibold uppercase tracking-[.12em] text-zinc-500">
          Start key · t = 0
        </p>
        <FormGrid className="mt-1" gap={2}>
          <Field
            label="X"
            value={Math.round((key.startDx ?? 0) * 1000) / 10}
            onChange={(v) => patchKey({ startDx: v / 100 })}
            min={-20}
            max={20}
            step={0.1}
            suffix="%"
          />
          <Field
            label="Y"
            value={Math.round((key.startDy ?? 0) * 1000) / 10}
            onChange={(v) => patchKey({ startDy: v / 100 })}
            min={-20}
            max={20}
            step={0.1}
            suffix="%"
          />
        </FormGrid>

        <p className="mt-3 text-[10px] font-semibold uppercase tracking-[.12em] text-zinc-500">
          End key · t = {clipSec.toFixed(1)}s
        </p>
        <FormGrid className="mt-1" gap={2}>
          <Field
            label="X"
            value={Math.round((key.endDx ?? 0) * 1000) / 10}
            onChange={(v) => patchKey({ endDx: v / 100 })}
            min={-20}
            max={20}
            step={0.1}
            suffix="%"
          />
          <Field
            label="Y"
            value={Math.round((key.endDy ?? 0) * 1000) / 10}
            onChange={(v) => patchKey({ endDy: v / 100 })}
            min={-20}
            max={20}
            step={0.1}
            suffix="%"
          />
        </FormGrid>

        <FormGrid className="mt-3" gap={2}>
          <Button className="text-[10px]" onClick={() => scrub(0)}>Go start</Button>
          <Button className="text-[10px]" onClick={() => scrub(1)}>Go end</Button>
          <Button className="text-[10px]" onClick={setStartFromCurrent}>
            <Crosshair className="h-3 w-3" /> Key start
          </Button>
          <Button className="text-[10px]" onClick={setEndFromCurrent}>
            <Crosshair className="h-3 w-3" /> Key end
          </Button>
        </FormGrid>

        <Button variant="soft" full className="mt-2 text-[10px]" onClick={resetJoint}>
          Reset this joint
        </Button>

        <p className="mt-3 font-mono text-[9px] text-zinc-600">
          Now {timeSec.toFixed(2)}s · offset {((at.dx || 0) * 100).toFixed(1)}% / {((at.dy || 0) * 100).toFixed(1)}%
        </p>
      </Section>
    </>
  )
}

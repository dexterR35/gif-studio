/**
 * AI sidebar — Motion AI only.
 * Select / soft matte / BG clean live on the Contextual Task Bar over the preview.
 * Upscale lives on the Scale workspace tab.
 */
import { useEffect, useMemo, useState } from 'react'
import {
  LoaderCircle, BetweenHorizonalEnd, PersonStanding, Bone, Mountain,
} from 'lucide-react'
import { Button, Section, SelectField, Switch } from '../ui'
import { useStudio } from '../../context/studio-provider'
import { useStudioStore } from '../../store/studio-store'

const DEPTH_FALLBACK = [
  { id: 'depth-anything-v2-small', label: 'Depth Anything V2 Small' },
]

const INTERP_FALLBACK = [
  { id: 'rife', label: 'RIFE' },
]

function optionLabel(m) {
  if (m.ready === false) {
    if (/\((missing|needs HF)/i.test(m.label)) return m.label
    return `${m.label} (missing)`
  }
  return m.label
}

function pickReady(options, currentId) {
  if (options.some((m) => m.id === currentId && m.ready !== false)) return currentId
  return options.find((m) => m.ready !== false)?.id || currentId
}

export function AiToolsPanel() {
  const {
    notifyError,
    runRifeInterpolate, runPoseDetect,
    runDepthForParallax,
    poseRig, setPoseRig,
    studioLocked,
  } = useStudio()
  const caps = useStudioStore((s) => s.capabilities)
  const [busy, setBusy] = useState('')
  const [depthModel, setDepthModel] = useState('depth-anything-v2-small')
  const [interpModel, setInterpModel] = useState('rife')

  const depthOptions = useMemo(
    () => (caps.models?.depth?.length ? caps.models.depth : DEPTH_FALLBACK),
    [caps.models],
  )
  const interpOptions = useMemo(
    () => (caps.models?.interpolate?.length ? caps.models.interpolate : INTERP_FALLBACK),
    [caps.models],
  )

  useEffect(() => { setDepthModel((id) => pickReady(depthOptions, id)) }, [depthOptions])

  const locked = Boolean(busy || studioLocked)

  const run = async (label, fn) => {
    setBusy(label)
    try {
      await fn()
    } catch (err) {
      notifyError(err?.message || `${label} failed`)
    } finally {
      setBusy('')
    }
  }

  const jointCount = poseRig.joints?.filter((j) => (j.score ?? 1) >= 0.25).length || 0

  return (
    <div className="space-y-1">
      <Section
        title="Motion AI"
        info="Depth parallax + frame interpolate. Select / matte / BG are on the preview task bar. Transforms stay on Motion."
        open
      >
        <div className="space-y-2">
          <SelectField label="Depth model" value={depthModel} onChange={setDepthModel}>
            {depthOptions.map((m) => (
              <option key={m.id} value={m.id} disabled={m.ready === false}>{optionLabel(m)}</option>
            ))}
          </SelectField>
          <Button
            variant="ghost"
            size="sm"
            full
            disabled={locked}
            onClick={() => run('Depth', () => runDepthForParallax({ model: depthModel }))}
          >
            {busy === 'Depth' ? <LoaderCircle className="h-3.5 w-3.5 animate-spin" /> : <Mountain className="h-3.5 w-3.5" />}
            Depth → parallax
          </Button>

          <SelectField label="Interpolate model" value={interpModel} onChange={setInterpModel}>
            {interpOptions.map((m) => (
              <option key={m.id} value={m.id} disabled={m.ready === false}>{optionLabel(m)}</option>
            ))}
          </SelectField>
          <Button
            variant="ghost"
            size="sm"
            full
            disabled={locked}
            onClick={() => run('RIFE', () => runRifeInterpolate({ factor: 2 }))}
          >
            {busy === 'RIFE' ? <LoaderCircle className="h-3.5 w-3.5 animate-spin" /> : <BetweenHorizonalEnd className="h-3.5 w-3.5" />}
            Interpolate (RIFE)
          </Button>

          <Switch
            label="Show joints in preview"
            checked={poseRig.visible}
            onChange={(v) => setPoseRig((current) => ({ ...current, visible: v }))}
            className="mb-1"
            disabled={locked || !poseRig.joints?.length}
          />
          <Button
            variant="accent"
            size="sm"
            full
            disabled={locked}
            onClick={() => run('Pose', () => runPoseDetect({
              joints: true,
              openPanel: true,
            }))}
          >
            {busy === 'Pose'
              ? <LoaderCircle className="h-3.5 w-3.5 animate-spin" />
              : <PersonStanding className="h-3.5 w-3.5" />}
            Detect body + joints
          </Button>
          {jointCount > 0 && (
            <Button
              variant="soft"
              size="sm"
              full
              disabled={locked}
              onClick={() => setPoseRig((current) => ({
                ...current,
                panelOpen: true,
                selectedJoint: current.selectedJoint || current.joints.find((j) => (j.score ?? 1) >= 0.25)?.name || null,
              }))}
            >
              <Bone className="h-3.5 w-3.5" />
              Open joint animation
            </Button>
          )}
        </div>
      </Section>
    </div>
  )
}

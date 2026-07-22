/**
 * AI sidebar — Pose (body / joints).
 * Select / soft matte / BG clean live on the Contextual Task Bar over the preview.
 * Upscale lives on the Scale workspace tab. Transforms stay on Motion.
 */
import { useState } from 'react'
import {
  LoaderCircle, PersonStanding, Bone,
} from 'lucide-react'
import { Button, Section, Switch } from '../ui'
import { useStudio } from '../../context/studio-provider'

export function AiToolsPanel() {
  const {
    notifyError,
    runPoseDetect,
    poseRig, setPoseRig,
    studioLocked,
  } = useStudio()
  const [busy, setBusy] = useState('')

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
        title="Pose"
        info="Body + joints for animation. Select / matte / BG are on the preview task bar. Transforms stay on Motion."
        open
      >
        <div className="space-y-2">
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

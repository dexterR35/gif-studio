/**
 * AI tools — SAM2, Grounding DINO, Body + joints, RealESRGAN, RIFE.
 */
import { useState } from 'react'
import {
  LoaderCircle, Sparkles, User, ScanSearch, Maximize2,
  BetweenHorizonalEnd, PersonStanding, Bone,
} from 'lucide-react'
import { Button, Section, Switch } from '../ui'
import { useStudio } from '../../context/studio-provider'
import { useStudioStore } from '../../store/studio-store'

export function AiToolsPanel() {
  const {
    canvasRef, image, setToast, loadFile,
    runSam2Segment, runHumanSegment, runTextDetect, runRifeInterpolate, runPoseDetect,
    poseRig, setPoseRig,
  } = useStudio()
  const caps = useStudioStore((s) => s.capabilities)
  const [prompt, setPrompt] = useState('')
  const [busy, setBusy] = useState('')
  const [cutoutBody, setCutoutBody] = useState(true)

  const requireCanvas = () => {
    if (!image || !canvasRef.current) {
      setToast('Open an image first')
      return null
    }
    return canvasRef.current
  }

  const run = async (label, fn) => {
    setBusy(label)
    try {
      await fn()
    } catch (err) {
      setToast(err?.message || `${label} failed`)
    } finally {
      setBusy('')
    }
  }

  const jointCount = poseRig.joints?.filter((j) => (j.score ?? 1) >= 0.25).length || 0

  return (
    <div className="space-y-1">
      <Section
        title="Detect"
        info={`${caps.api ? 'API online' : 'API offline'}${caps.rembg ? ' · rembg' : ''}${caps.opencv ? ' · OpenCV' : ''}. SAM2 / DINO / RealESRGAN / RIFE need packages and weights.`}
        open
      >
        <div className="space-y-2">
          <Button
            variant="ghost"
            size="sm"
            full
            disabled={Boolean(busy)}
            onClick={() => run('SAM2', () => runSam2Segment())}
          >
            {busy === 'SAM2' ? <LoaderCircle className="h-3.5 w-3.5 animate-spin" /> : <Sparkles className="h-3.5 w-3.5" />}
            SAM2 segment → layer
          </Button>

          <label className="block text-[10px] font-semibold uppercase tracking-[.12em] text-zinc-500">
            Text prompt
            <input
              className="gs-input mt-1.5 w-full normal-case tracking-normal"
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              placeholder="person, logo, product…"
            />
          </label>
          <Button
            variant="ghost"
            size="sm"
            full
            disabled={Boolean(busy) || !prompt.trim()}
            onClick={() => run('DINO', () => runTextDetect(prompt))}
          >
            {busy === 'DINO' ? <LoaderCircle className="h-3.5 w-3.5 animate-spin" /> : <ScanSearch className="h-3.5 w-3.5" />}
            Text-guided detect → layer
          </Button>

          <Button
            variant="ghost"
            size="sm"
            full
            disabled={Boolean(busy)}
            onClick={() => run('MediaPipe', () => runHumanSegment())}
          >
            {busy === 'MediaPipe' ? <LoaderCircle className="h-3.5 w-3.5 animate-spin" /> : <User className="h-3.5 w-3.5" />}
            Human segment → layer
          </Button>
        </div>
      </Section>

      <Section
        title="Body & joints"
        info="One MediaPipe pose pass: marks joints and optionally cuts out the body as a layer. Then animate joints in the settings sidebar (start → end over the clip)."
        open
      >
        <Switch
          label="Cut out body as layer"
          checked={cutoutBody}
          onChange={setCutoutBody}
          className="mb-2"
        />
        <Switch
          label="Show skeleton"
          checked={poseRig.visible}
          onChange={(v) => setPoseRig((current) => ({ ...current, visible: v }))}
          className="mb-2"
          disabled={!poseRig.joints?.length}
        />
        <Button
          variant="accent"
          size="sm"
          full
          disabled={Boolean(busy)}
          onClick={() => run('Pose', () => runPoseDetect({
            segment: cutoutBody,
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
            className="mt-2"
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
        {jointCount > 0 && (
          <p className="mt-2 font-mono text-[9px] text-zinc-500">
            {jointCount} joints · {poseRig.engine || 'pose'}
          </p>
        )}
      </Section>

      <Section title="Enhance" info="Upscale and frame interpolation." open={false}>
        <div className="space-y-2">
          <Button
            variant="ghost"
            size="sm"
            full
            disabled={Boolean(busy)}
            onClick={() => run('Upscale', async () => {
              const canvas = requireCanvas()
              if (!canvas) return
              const { upscaleWithRealESRGAN } = await import('../../ai/realesrgan')
              const result = await upscaleWithRealESRGAN({ imageCanvas: canvas, scale: 2 })
              if (!result.url && !result.blob) {
                throw new Error('Upscale returned no image')
              }
              const blob = result.blob || await (await fetch(result.url)).blob()
              await loadFile(new File([blob], 'upscaled.png', { type: 'image/png' }))
              if (result.url) URL.revokeObjectURL(result.url)
              setToast(`Upscale · ${result.engine || 'ok'}`)
            })}
          >
            {busy === 'Upscale' ? <LoaderCircle className="h-3.5 w-3.5 animate-spin" /> : <Maximize2 className="h-3.5 w-3.5" />}
            Upscale 2× (RealESRGAN)
          </Button>

          <Button
            variant="ghost"
            size="sm"
            full
            disabled={Boolean(busy)}
            onClick={() => run('RIFE', () => runRifeInterpolate({ factor: 2 }))}
          >
            {busy === 'RIFE' ? <LoaderCircle className="h-3.5 w-3.5 animate-spin" /> : <BetweenHorizonalEnd className="h-3.5 w-3.5" />}
            Interpolate (RIFE)
          </Button>
        </div>
      </Section>
    </div>
  )
}

/**
 * AI tools panel — SAM2, Grounding DINO, MediaPipe Pose, RealESRGAN, RIFE.
 * Heavy engines are dynamic-imported on click; results become real layers.
 */
import { useState } from 'react'
import {
  LoaderCircle, Sparkles, User, ScanSearch, Maximize2,
  BetweenHorizonalEnd, PersonStanding, Bone,
} from 'lucide-react'
import { Button, Hint, Section, Switch } from '../ui'
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
  const [driveFromJoints, setDriveFromJoints] = useState(true)

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
    <Section title="AI" info="SAM2 · Grounding DINO · Pose joints · RealESRGAN · RIFE" open>
      <Hint>
        Capabilities come from /api/health. SAM2 / Grounding DINO / RealESRGAN / RIFE require installed packages and weights — missing engines fail instead of substituting.
        {caps.api ? ' API online.' : ' API offline — browser-only paths.'}
        {caps.rembg ? ' rembg available.' : ''}
        {caps.opencv ? ' OpenCV.js ready.' : ''}
        {caps.pixi ? ' Pixi GPU preview on.' : ''}
      </Hint>

      <div className="mt-3 space-y-2">
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
          Text prompt (Grounding DINO)
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

        <div className="rounded-xl border border-white/[.07] bg-black/20 p-2.5">
          <p className="mb-2 flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-[.12em] text-zinc-400">
            <Bone className="h-3.5 w-3.5 text-acid" />
            Body + joints
          </p>
          <Switch
            label="Cut out body as layer"
            checked={cutoutBody}
            onChange={setCutoutBody}
            className="mb-2"
          />
          <Switch
            label="Drive smooth Pose sway from joints"
            checked={driveFromJoints}
            onChange={(v) => {
              setDriveFromJoints(v)
              setPoseRig((current) => ({ ...current, driveMotion: v }))
            }}
            className="mb-2"
          />
          <Switch
            label="Show joint skeleton"
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
              driveMotion: driveFromJoints,
            }))}
          >
            {busy === 'Pose'
              ? <LoaderCircle className="h-3.5 w-3.5 animate-spin" />
              : <PersonStanding className="h-3.5 w-3.5" />}
            Detect body + mark joints
          </Button>
          {jointCount > 0 && (
            <p className="mt-2 font-mono text-[9px] text-zinc-500">
              {jointCount} joints · {poseRig.engine || 'pose'}
              {poseRig.driveMotion ? ' · Pose sway on' : ''}
            </p>
          )}
        </div>

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
          Interpolate (RIFE) → timeline
        </Button>
      </div>
    </Section>
  )
}

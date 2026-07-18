/**
 * AI tools — local SAM2, Grounding DINO, Body + joints, RealESRGAN, RIFE.
 */
import { useEffect, useMemo, useState } from 'react'
import {
  LoaderCircle, Sparkles, User, ScanSearch, Maximize2,
  BetweenHorizonalEnd, PersonStanding, Bone,
} from 'lucide-react'
import { Button, Section, SelectField, Switch } from '../ui'
import { useStudio } from '../../context/studio-provider'
import { useStudioStore } from '../../store/studio-store'
import { UPSCALE_MODELS } from '../../ai/realesrgan'

const SAM2_FALLBACK = [
  { id: 'sam2.1_hiera_tiny', label: 'SAM2.1 Tiny' },
  { id: 'sam2.1_hiera_small', label: 'SAM2.1 Small' },
  { id: 'sam2.1_hiera_base_plus', label: 'SAM2.1 Base+' },
  { id: 'sam2.1_hiera_large', label: 'SAM2.1 Large' },
]

const DINO_FALLBACK = [
  { id: 'swint_ogc', label: 'GroundingDINO-T (Swin-T)' },
  { id: 'swinb_cogcoor', label: 'GroundingDINO-B (Swin-B)' },
]

const YOLO_FALLBACK = [
  { id: 'yolov8n', label: 'YOLOv8n (nano)' },
  { id: 'yolov8s', label: 'YOLOv8s (small)' },
  { id: 'yolov8m', label: 'YOLOv8m (medium)' },
  { id: 'yolo11n', label: 'YOLO11n (nano)' },
]

const DETECT_ENGINES = [
  { id: 'grounding_dino', label: 'Grounding DINO (open-vocab text)' },
  { id: 'yolo', label: 'YOLO / Ultralytics (COCO classes)' },
]

function optionLabel(m) {
  if (m.ready === false) return `${m.label} (missing)`
  return m.label
}

function deviceLabel(device) {
  if (!device?.device) return 'device unknown'
  const d = String(device.device)
  if (d.startsWith('cuda') && device.gpu_name) return `${d} · ${device.gpu_name}`
  if (d === 'mps') return 'mps (Apple)'
  if (d === 'cpu') return 'cpu'
  return d
}

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
  const [upscaleModel, setUpscaleModel] = useState('realesrgan')
  const [upscaleScale, setUpscaleScale] = useState(2)
  const [sam2Model, setSam2Model] = useState('sam2.1_hiera_tiny')
  const [dinoModel, setDinoModel] = useState('swint_ogc')
  const [yoloModel, setYoloModel] = useState('yolov8n')
  const [detectEngine, setDetectEngine] = useState('grounding_dino')

  const sam2Options = useMemo(
    () => (caps.models?.sam2?.length ? caps.models.sam2 : SAM2_FALLBACK),
    [caps.models],
  )
  const dinoOptions = useMemo(
    () => (caps.models?.grounding_dino?.length ? caps.models.grounding_dino : DINO_FALLBACK),
    [caps.models],
  )
  const yoloOptions = useMemo(
    () => (caps.models?.yolo?.length ? caps.models.yolo : YOLO_FALLBACK),
    [caps.models],
  )
  const upscaleOptions = useMemo(
    () => (caps.models?.upscale?.length ? caps.models.upscale : UPSCALE_MODELS),
    [caps.models],
  )

  useEffect(() => {
    const readySam = sam2Options.find((m) => m.ready !== false)
    if (readySam && !sam2Options.some((m) => m.id === sam2Model && m.ready !== false)) {
      setSam2Model(readySam.id)
    }
  }, [sam2Options, sam2Model])

  useEffect(() => {
    const readyDino = dinoOptions.find((m) => m.ready !== false)
    if (readyDino && !dinoOptions.some((m) => m.id === dinoModel && m.ready !== false)) {
      setDinoModel(readyDino.id)
    }
  }, [dinoOptions, dinoModel])

  useEffect(() => {
    const readyYolo = yoloOptions.find((m) => m.ready !== false)
    if (readyYolo && !yoloOptions.some((m) => m.id === yoloModel && m.ready !== false)) {
      setYoloModel(readyYolo.id)
    }
  }, [yoloOptions, yoloModel])

  useEffect(() => {
    const readyUp = upscaleOptions.find((m) => m.ready !== false && m.id !== 'bicubic')
      || upscaleOptions.find((m) => m.id === 'bicubic')
    if (readyUp && !upscaleOptions.some((m) => m.id === upscaleModel && m.ready !== false)) {
      setUpscaleModel(readyUp.id)
    }
  }, [upscaleOptions, upscaleModel])

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
  const device = deviceLabel(caps.device)

  return (
    <div className="space-y-1">
      <Section
        title="Detect"
        info={`Local weights · ${device}${caps.api ? ' · API online' : ' · API offline'}. HF Hub disabled unless GIF_STUDIO_ALLOW_HF=1.`}
        open
      >
        <div className="space-y-2">
          <SelectField
            label="SAM2 model"
            value={sam2Model}
            onChange={setSam2Model}
          >
            {sam2Options.map((m) => (
              <option key={m.id} value={m.id} disabled={m.ready === false}>
                {optionLabel(m)}
              </option>
            ))}
          </SelectField>
          <Button
            variant="ghost"
            size="sm"
            full
            disabled={Boolean(busy)}
            onClick={() => run('SAM2', () => runSam2Segment(null, { model: sam2Model }))}
          >
            {busy === 'SAM2' ? <LoaderCircle className="h-3.5 w-3.5 animate-spin" /> : <Sparkles className="h-3.5 w-3.5" />}
            SAM2 segment → layer
          </Button>
          <p className="text-[10px] leading-snug text-zinc-600">
            <span className="font-medium text-zinc-400">SAM 2</span>
            {' '}— pixel-accurate outlines (and video tracking). Best for interactive cutouts,
            rotoscoping, or following an object frame to frame. Does not understand text alone.
          </p>

          <SelectField
            label="Detect engine"
            value={detectEngine}
            onChange={setDetectEngine}
          >
            {DETECT_ENGINES.map((e) => (
              <option key={e.id} value={e.id}>{e.label}</option>
            ))}
          </SelectField>

          {detectEngine === 'grounding_dino' ? (
            <SelectField
              label="Grounding DINO model"
              value={dinoModel}
              onChange={setDinoModel}
            >
              {dinoOptions.map((m) => (
                <option key={m.id} value={m.id} disabled={m.ready === false}>
                  {optionLabel(m)}
                </option>
              ))}
            </SelectField>
          ) : (
            <SelectField
              label="YOLO model (local)"
              value={yoloModel}
              onChange={setYoloModel}
            >
              {yoloOptions.map((m) => (
                <option key={m.id} value={m.id} disabled={m.ready === false}>
                  {optionLabel(m)}
                </option>
              ))}
            </SelectField>
          )}

          <label className="block text-[10px] font-semibold uppercase tracking-[.12em] text-zinc-500">
            {detectEngine === 'yolo' ? 'Class filter (optional)' : 'Text prompt'}
            <input
              className="gs-input mt-1.5 w-full normal-case tracking-normal"
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              placeholder={detectEngine === 'yolo' ? 'person . dog . cup' : 'chair . person . dog .'}
            />
          </label>
          <Button
            variant="ghost"
            size="sm"
            full
            disabled={Boolean(busy) || (detectEngine === 'grounding_dino' && !prompt.trim())}
            onClick={() => run('Detect', () => runTextDetect(prompt, {
              engine: detectEngine,
              dinoModel,
              yoloModel,
              sam2Model,
            }))}
          >
            {busy === 'Detect' ? <LoaderCircle className="h-3.5 w-3.5 animate-spin" /> : <ScanSearch className="h-3.5 w-3.5" />}
            {detectEngine === 'yolo' ? 'YOLO detect → layer' : 'Text-guided detect → layer'}
          </Button>
          <p className="text-[10px] leading-snug text-zinc-600">
            {detectEngine === 'yolo' ? (
              <>
                <span className="font-medium text-zinc-400">Ultralytics YOLO</span>
                {' '}— local COCO-class detection (
                <a
                  className="text-zinc-400 underline decoration-white/15 hover:text-zinc-300"
                  href="https://github.com/ultralytics/ultralytics"
                  target="_blank"
                  rel="noreferrer"
                >
                  ultralytics
                </a>
                ). Fast for common classes; not open-vocab. SAM 2 still refines the box to a contour.
              </>
            ) : (
              <>
                <span className="font-medium text-zinc-400">Grounding DINO</span>
                {' '}— open-vocabulary text search. Then local SAM 2 refines the box into a mask contour.
                Separate categories with{' '}
                <span className="font-mono text-zinc-400">.</span>
              </>
            )}
          </p>

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
        info="Keep “Cut out body as layer” on. Detect body → drag joints: the photo mesh warps (image processing), not a 3D character. Pixi only shows the already-warped preview on play."
        open
      >
        <Switch
          label="Cut out body as layer"
          checked={cutoutBody}
          onChange={setCutoutBody}
          className="mb-2"
        />
        <Switch
          label="Show joints in preview"
          checked={poseRig.visible}
          onChange={(v) => setPoseRig((current) => ({ ...current, visible: v }))}
          className="mb-2"
          disabled={!poseRig.joints?.length}
        />
        {jointCount > 0 && (
          <p className="mb-2 text-[10px] text-zinc-500">
            Joints are overlay-only — hidden in GIF / PNG export.
          </p>
        )}
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

      <Section
        title="Enhance"
        info={`Local xinntao weights · ${device}. Bicubic always works.`}
        open={false}
      >
        <div className="space-y-2">
          <SelectField
            label="Upscale model"
            value={upscaleModel}
            onChange={setUpscaleModel}
          >
            {upscaleOptions.map((m) => (
              <option key={m.id} value={m.id} disabled={m.ready === false}>
                {optionLabel(m)}
              </option>
            ))}
          </SelectField>
          <SelectField
            label="Scale"
            value={String(upscaleScale)}
            onChange={(v) => setUpscaleScale(Number(v))}
          >
            {[2, 3, 4].map((s) => (
              <option key={s} value={s}>{s}×</option>
            ))}
          </SelectField>
          <Button
            variant="ghost"
            size="sm"
            full
            disabled={Boolean(busy)}
            onClick={() => run('Upscale', async () => {
              const canvas = requireCanvas()
              if (!canvas) return
              const { upscaleWithRealESRGAN } = await import('../../ai/realesrgan')
              const result = await upscaleWithRealESRGAN({
                imageCanvas: canvas,
                scale: upscaleScale,
                model: upscaleModel,
              })
              if (!result.url && !result.blob) {
                throw new Error('Upscale returned no image')
              }
              const blob = result.blob || await (await fetch(result.url)).blob()
              const tag = upscaleOptions.find((m) => m.id === upscaleModel)?.label || upscaleModel
              await loadFile(new File([blob], `upscaled-${upscaleModel}.png`, { type: 'image/png' }))
              if (result.url) URL.revokeObjectURL(result.url)
              setToast(`Upscale · ${tag} · ${result.engine || 'ok'} · ${device}`)
            })}
          >
            {busy === 'Upscale' ? <LoaderCircle className="h-3.5 w-3.5 animate-spin" /> : <Maximize2 className="h-3.5 w-3.5" />}
            Upscale {upscaleScale}×
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

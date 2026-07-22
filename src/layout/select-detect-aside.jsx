/**
 * Left sidebar — Select & detect (before the tools rail).
 * Opens when a source image is loaded; same panel chrome as Layers.
 */
import { useEffect, useMemo, useState } from 'react'
import { LoaderCircle, ScanSearch } from 'lucide-react'
import { Button, SelectField } from '../components/ui'
import { useStudio } from '../context/studio-provider'
import { useStudioStore } from '../store/studio-store'

const SAM2_FALLBACK = [
  { id: 'sam2.1_hiera_tiny', label: 'SAM2.1 Tiny' },
  { id: 'sam2.1_hiera_small', label: 'SAM2.1 Small' },
  { id: 'sam2.1_hiera_base_plus', label: 'SAM2.1 Base+' },
  { id: 'sam2.1_hiera_large', label: 'SAM2.1 Large' },
]

const SAM3_FALLBACK = [
  { id: 'sam3', label: 'SAM 3 (needs HF access)', ready: false },
  { id: 'sam3.1', label: 'SAM 3.1 (needs HF access)', ready: false },
]

const DINO_FALLBACK = [
  { id: 'swint_ogc', label: 'GroundingDINO-T (Swin-T)' },
  { id: 'swinb_cogcoor', label: 'GroundingDINO-B (Swin-B)' },
]

const DETECT_ENGINES_FALLBACK = [
  { id: 'sam3', label: 'SAM 3 (text → mask)', ready: false },
  { id: 'grounding_dino', label: 'Grounding DINO + SAM2 refine' },
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

export function SelectDetectAside() {
  const {
    image,
    studioLocked,
    runTextDetect,
    setToast,
  } = useStudio()
  const caps = useStudioStore((s) => s.capabilities)

  const [busy, setBusy] = useState('')
  const [prompt, setPrompt] = useState('')
  const [segmentModel, setSegmentModel] = useState('sam2.1_hiera_tiny')
  const [dinoModel, setDinoModel] = useState('swint_ogc')
  const [sam3Model, setSam3Model] = useState('sam3')
  const [detectEngine, setDetectEngine] = useState('grounding_dino')

  const segmentOptions = useMemo(() => {
    const sam2 = caps.models?.sam2?.length ? caps.models.sam2 : SAM2_FALLBACK
    return sam2.map((m) => ({ ...m, family: 'sam2' }))
  }, [caps.models])

  const detectEngines = useMemo(() => {
    if (caps.models?.select_detect?.length) return caps.models.select_detect
    const sam3Ready = (caps.models?.sam3 || []).some((m) => m.ready === true)
    return DETECT_ENGINES_FALLBACK.map((e) => (
      e.id === 'sam3' ? { ...e, ready: sam3Ready } : e
    ))
  }, [caps.models])

  const dinoOptions = useMemo(
    () => (caps.models?.grounding_dino?.length ? caps.models.grounding_dino : DINO_FALLBACK),
    [caps.models],
  )
  const sam3Options = useMemo(
    () => (caps.models?.sam3?.length ? caps.models.sam3 : SAM3_FALLBACK),
    [caps.models],
  )

  useEffect(() => { setSegmentModel((id) => pickReady(segmentOptions, id)) }, [segmentOptions])
  useEffect(() => { setDinoModel((id) => pickReady(dinoOptions, id)) }, [dinoOptions])
  useEffect(() => { setSam3Model((id) => pickReady(sam3Options, id)) }, [sam3Options])
  useEffect(() => { setDetectEngine((id) => pickReady(detectEngines, id)) }, [detectEngines])

  const open = Boolean(image)
  const locked = Boolean(busy || studioLocked)
  const detectUsesSam2 = detectEngine === 'grounding_dino'
  const detectModelOptions = detectEngine === 'sam3' ? sam3Options : dinoOptions
  const detectModelValue = detectEngine === 'sam3' ? sam3Model : dinoModel
  const setDetectModelValue = detectEngine === 'sam3' ? setSam3Model : setDinoModel
  const detectModelLabel = detectEngine === 'sam3' ? 'SAM 3 model' : 'DINO model'
  const detectBtnLabel = detectEngine === 'sam3' ? 'Detect → layer' : 'DINO + SAM2 → layer'
  const refineLabel = segmentOptions.find((m) => m.id === segmentModel)?.label || 'SAM 2'

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

  if (!open) return null

  return (
    <aside
      aria-label="Select and detect"
      className="scrollbar flex h-full w-[228px] shrink-0 flex-col overflow-y-auto overscroll-contain border-r border-white/[.06] bg-panel"
    >
      <div className="flex h-11 shrink-0 items-center border-b border-white/[.06] px-3">
        <span className="text-[10px] font-semibold uppercase tracking-[.14em] text-zinc-500">
          Select & detect
        </span>
      </div>

      <div className="space-y-2 px-3 py-3">
        {detectUsesSam2 ? (
          <SelectField label="SAM 2 refine" value={segmentModel} onChange={setSegmentModel}>
            {segmentOptions.map((m) => (
              <option key={m.id} value={m.id} disabled={m.ready === false}>
                {optionLabel(m)}
              </option>
            ))}
          </SelectField>
        ) : null}

        <SelectField label="Detect engine" value={detectEngine} onChange={setDetectEngine}>
          {detectEngines.map((e) => (
            <option key={e.id} value={e.id} disabled={e.ready === false}>
              {optionLabel(e)}
            </option>
          ))}
        </SelectField>

        <SelectField label={detectModelLabel} value={detectModelValue} onChange={setDetectModelValue}>
          {detectModelOptions.map((m) => (
            <option key={m.id} value={m.id} disabled={m.ready === false}>
              {optionLabel(m)}
            </option>
          ))}
        </SelectField>

        {detectUsesSam2 ? (
          <p className="text-[10px] leading-snug text-zinc-600">
            Boxes from detect · masks via <span className="font-medium text-zinc-400">{refineLabel}</span>
          </p>
        ) : null}

        <label className="block">
          <span className="gs-label">Text prompt</span>
          <input
            className="gs-input w-full normal-case tracking-normal"
            value={prompt}
            disabled={locked}
            onChange={(e) => setPrompt(e.target.value)}
            placeholder="chair . person . dog ."
          />
        </label>

        <Button
          variant="accent"
          size="sm"
          full
          disabled={
            locked
            || !prompt.trim()
            || (detectEngine === 'sam3' && sam3Options.every((m) => m.ready === false))
          }
          onClick={() => run('Detect', () => runTextDetect(prompt, {
            engine: detectEngine,
            dinoModel,
            sam3Model,
            sam2Model: segmentModel,
          }))}
        >
          {busy === 'Detect'
            ? <LoaderCircle className="h-3.5 w-3.5 animate-spin" />
            : <ScanSearch className="h-3.5 w-3.5" />}
          {detectBtnLabel}
        </Button>
      </div>
    </aside>
  )
}

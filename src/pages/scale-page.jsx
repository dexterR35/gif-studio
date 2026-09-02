/**
 * Scale workspace — upscale to an underlay layer (base image stays intact).
 * Fit controls when enhanced pixels exceed the artboard. Atomic PNG download.
 */
import { useEffect, useMemo, useState } from 'react'
import { ArrowRight, Check, Download, ImageMinus, LoaderCircle, Maximize2, Trash2 } from 'lucide-react'
import { Button, Field, FormGrid, Hint, Section, SelectField, Switch } from '../components/ui'
import { useStudio } from '../context/studio-provider'
import { useStudioStore } from '../store/studio-store'
import { UPSCALE_MODELS } from '../ai/model-catalogs.js'
import { FIT_MODES } from '../lib/catalogs'
import { fmtBytes, MAX_CANVAS } from '../lib/format'

function optionLabel(m) {
  if (m.ready === false) {
    if (/\((missing|needs HF)/i.test(m.label)) return m.label
    return `${m.label} (missing)`
  }
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

export default function ScalePage() {
  const {
    image, source, settings, setSettings, canvasLocked,
    enhancedLayer, runUpscaleToEnhanced, runRemoveBackgroundAndUpscale, updateEnhancedLayer,
    removeEnhancedLayer, downloadEnhancedPng, matchEnhancedSize,
    imageVisible, setImageVisible,
    downloadBusy, scaleBusy, busyLabel, studioLocked, setToast,
  } = useStudio()
  const caps = useStudioStore((s) => s.capabilities)
  const [upscaleScale, setUpscaleScale] = useState(2)
  const [activeAction, setActiveAction] = useState('')

  const upscaleOptions = useMemo(
    () => (caps.models?.upscale?.length ? caps.models.upscale : UPSCALE_MODELS),
    [caps.models],
  )

  useEffect(() => {
    const selected = upscaleOptions.find((option) => Number(option.scale) === upscaleScale)
    if (selected?.ready !== false) return
    const ready = upscaleOptions.find((option) => option.ready !== false)
    if (ready) setUpscaleScale(Number(ready.scale))
  }, [upscaleOptions, upscaleScale])

  const ioLocked = Boolean(studioLocked)
  const device = deviceLabel(caps.device)
  const hasEnhanced = Boolean(enhancedLayer?.image)
  const selectedUpscaleReady = Boolean(caps.realesrgan && upscaleOptions.some((option) => (
    Number(option.scale) === upscaleScale && option.ready !== false
  )))
  const selectedSourceName = source?.name || 'Background'
  const removeBackgroundReady = Boolean(caps.matte || caps.rembg)
  const combinedReady = selectedUpscaleReady && removeBackgroundReady
  const combinedBusy = activeAction === 'combined' && scaleBusy
  const removingBackground = combinedBusy && String(busyLabel).toLowerCase().includes('removing')
  const combinedResult = Boolean(enhancedLayer?.backgroundRemoved)
  const largerThanCanvas = hasEnhanced
    && (enhancedLayer.width > settings.width || enhancedLayer.height > settings.height)

  const runUpscale = async () => {
    if (!image) {
      setToast('Open an image first')
      return
    }
    setActiveAction('upscale')
    try {
      await runUpscaleToEnhanced({ scale: upscaleScale })
    } catch (err) {
      setToast(err?.message || 'Upscale failed')
    } finally {
      setActiveAction('')
    }
  }

  const runCombined = async () => {
    if (!image) {
      setToast('Open an image first')
      return
    }
    setActiveAction('combined')
    try {
      await runRemoveBackgroundAndUpscale({ scale: upscaleScale })
    } catch (err) {
      setToast(err?.message || 'Remove background and upscale failed')
    } finally {
      setActiveAction('')
    }
  }

  return (
    <>
      <Section
        title="Remove background + upscale"
        info={`Runs both steps on the current upload and keeps the original for rollback · ${device}`}
        open
      >
        <div className="space-y-2">
          <div className="rounded-lg border border-white/[.08] bg-black/15 px-2.5 py-2">
            <p className="text-[9px] font-semibold uppercase tracking-[.12em] text-zinc-600">Current upload</p>
            <p className="mt-0.5 truncate text-[11px] font-medium text-zinc-200" title={selectedSourceName}>
              {selectedSourceName}
            </p>
          </div>
          <SelectField
            label="Real-ESRGAN scale"
            value={String(upscaleScale)}
            onChange={(value) => setUpscaleScale(Number(value))}
          >
            {upscaleOptions.map((m) => (
              <option key={m.id} value={m.scale} disabled={m.ready === false}>
                {optionLabel(m)}
              </option>
            ))}
          </SelectField>
          <Button
            variant="accent"
            size="sm"
            full
            disabled={ioLocked || !image || !combinedReady}
            onClick={runCombined}
            title={!removeBackgroundReady
              ? 'Requires the local background-removal model'
              : !selectedUpscaleReady
                ? 'Requires a ready Real-ESRGAN model'
                : `Remove the background from ${selectedSourceName}, then upscale it`}
          >
            {combinedBusy
              ? <LoaderCircle className="h-3.5 w-3.5" />
              : <ImageMinus className="h-3.5 w-3.5" />}
            {combinedBusy ? (busyLabel || 'Processing…') : `Remove background + upscale ${upscaleScale}×`}
          </Button>
          <div
            className="flex items-center justify-center gap-1.5 text-[9px] font-medium text-zinc-500"
            role={combinedBusy ? 'status' : undefined}
            aria-live="polite"
          >
            <span className={removingBackground ? 'text-acid' : ''}>1. Remove background</span>
            <ArrowRight className="h-3 w-3" aria-hidden="true" />
            <span className={combinedBusy && !removingBackground ? 'text-acid' : ''}>2. Upscale</span>
            <ArrowRight className="h-3 w-3" aria-hidden="true" />
            <span className={combinedResult ? 'text-acid' : ''}>3. Enhanced layer</span>
          </div>
          {combinedResult && (
            <div className="flex items-start gap-2 rounded-lg border border-acid/20 bg-acid/[.06] px-2.5 py-2 text-[10px] text-zinc-400">
              <Check className="mt-px h-3.5 w-3.5 shrink-0 text-acid" aria-hidden="true" />
              <span>
                Transparent {enhancedLayer.scale || upscaleScale}× result created from{' '}
                <b className="font-medium text-zinc-200">{enhancedLayer.sourceName || selectedSourceName}</b>.
                {enhancedLayer.matteEngine ? ` Matte: ${enhancedLayer.matteEngine}.` : ''}
              </span>
            </div>
          )}
          <div className="flex items-center gap-2 py-0.5" aria-hidden="true">
            <div className="h-px flex-1 bg-white/[.06]" />
            <span className="text-[9px] uppercase tracking-[.12em] text-zinc-700">or</span>
            <div className="h-px flex-1 bg-white/[.06]" />
          </div>
          <Button
            variant="soft"
            size="sm"
            full
            disabled={ioLocked || !image || !selectedUpscaleReady}
            onClick={runUpscale}
          >
            {activeAction === 'upscale' && scaleBusy
              ? <LoaderCircle className="h-3.5 w-3.5" />
              : <Maximize2 className="h-3.5 w-3.5" />}
            {activeAction === 'upscale' && scaleBusy ? 'Upscaling…' : `Upscale original only ${upscaleScale}×`}
          </Button>
          <p className="text-[10px] leading-snug text-zinc-600">
            The primary action removes the background first. “Upscale original only” skips background removal.
          </p>
        </div>
      </Section>

      <Section
        title="Fit on canvas"
        info="When the enhanced image is larger than the artboard, choose how it sits — or grow the artboard."
        open
      >
        <div className="space-y-2">
          {hasEnhanced ? (
            <>
              <div className="rounded-lg border border-white/[.06] bg-black/15 px-2.5 py-2 text-[10px] text-zinc-500">
                Enhanced{' '}
                <b className="text-zinc-300">{enhancedLayer.width} × {enhancedLayer.height}</b>
                {' · '}artboard{' '}
                <b className="text-zinc-300">{settings.width} × {settings.height}</b>
                {source?.width ? (
                  <>
                    {' · '}base{' '}
                    <b className="text-zinc-300">{source.width} × {source.height}</b>
                  </>
                ) : null}
              </div>
              <SelectField
                label="Enhanced fit"
                value={enhancedLayer.fit || 'Contain'}
                onChange={(v) => updateEnhancedLayer({ fit: v })}
              >
                {FIT_MODES.map((mode) => (
                  <option key={mode}>{mode}</option>
                ))}
              </SelectField>
              <SelectField
                label="Base image fit"
                value={settings.fit}
                onChange={(v) => setSettings((s) => ({ ...s, fit: v }))}
              >
                {FIT_MODES.map((mode) => (
                  <option key={mode}>{mode}</option>
                ))}
              </SelectField>
              <FormGrid gap={3}>
                <Field
                  label="Artboard W"
                  value={settings.width}
                  onChange={(v) => !canvasLocked && setSettings((s) => ({ ...s, width: Math.min(MAX_CANVAS, Math.max(1, v)) }))}
                  min={1}
                  max={MAX_CANVAS}
                  suffix="px"
                />
                <Field
                  label="Artboard H"
                  value={settings.height}
                  onChange={(v) => !canvasLocked && setSettings((s) => ({ ...s, height: Math.min(MAX_CANVAS, Math.max(1, v)) }))}
                  min={1}
                  max={MAX_CANVAS}
                  suffix="px"
                />
              </FormGrid>
              <Button
                variant="soft"
                size="sm"
                full
                disabled={canvasLocked || ioLocked}
                onClick={matchEnhancedSize}
              >
                Match enhanced size
              </Button>
              {largerThanCanvas && (
                <Hint className="mt-1">
                  Enhanced is larger than the artboard — use Contain, Original size + pan, or Match enhanced size.
                </Hint>
              )}
              <Switch
                label="Show enhanced layer"
                checked={enhancedLayer.visible !== false}
                onChange={(v) => updateEnhancedLayer({ visible: v })}
                className="mt-1"
              />
              <Switch
                label="Hide base image (see underlay)"
                checked={imageVisible === false}
                onChange={(hide) => setImageVisible(!hide)}
                className="mt-1"
              />
            </>
          ) : (
            <p className="text-[10px] leading-snug text-zinc-600">
              Run an enhancement above to add an Enhanced layer. Fit controls appear here.
            </p>
          )}
        </div>
      </Section>

      <Section title="Download" info="One atomic PNG download when the file is ready. Blocked while export/upscale runs." open>
        <div className="space-y-2">
          <Button
            variant="solid"
            size="lg"
            full
            className="text-[10px] font-bold"
            disabled={!hasEnhanced || ioLocked}
            onClick={() => downloadEnhancedPng()}
          >
            {downloadBusy
              ? <LoaderCircle className="h-3.5 w-3.5" />
              : <Download className="h-3.5 w-3.5" />}
            {downloadBusy
              ? 'Preparing PNG…'
              : enhancedLayer?.backgroundRemoved
                ? 'Download transparent PNG'
                : 'Download enhanced PNG'}
          </Button>
          {hasEnhanced && (
            <Button
              variant="ghost"
              size="sm"
              full
              disabled={ioLocked}
              onClick={removeEnhancedLayer}
            >
              <Trash2 className="h-3.5 w-3.5" />
              Remove enhanced layer
            </Button>
          )}
          {hasEnhanced && (
            <p className="text-[9px] leading-relaxed text-zinc-600">
              {enhancedLayer.backgroundRemoved ? 'Transparent background · ' : ''}
              {enhancedLayer.name}
              {enhancedLayer.engine ? ` · ${enhancedLayer.engine}` : ''}
              {enhancedLayer.width
                ? ` · ${enhancedLayer.width}×${enhancedLayer.height}`
                : ''}
              {enhancedLayer.bytes ? ` · ${fmtBytes(enhancedLayer.bytes)}` : ''}
            </p>
          )}
        </div>
      </Section>
    </>
  )
}

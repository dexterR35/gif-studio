/**
 * Scale workspace — upscale to an underlay layer (base image stays intact).
 * Fit controls when enhanced pixels exceed the artboard. Atomic PNG download.
 */
import { useEffect, useMemo, useState } from 'react'
import { Download, LoaderCircle, Maximize2, Trash2 } from 'lucide-react'
import { Button, Field, FormGrid, Hint, Section, SelectField, Switch } from '../components/ui'
import { useStudio } from '../context/studio-provider'
import { useStudioStore } from '../store/studio-store'
import { UPSCALE_MODELS } from '../ai/realesrgan'
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
    enhancedLayer, runUpscaleToEnhanced, updateEnhancedLayer,
    removeEnhancedLayer, downloadEnhancedPng, matchEnhancedSize,
    imageVisible, setImageVisible,
    downloadBusy, scaleBusy, studioLocked, setToast,
  } = useStudio()
  const caps = useStudioStore((s) => s.capabilities)
  const [upscaleModel, setUpscaleModel] = useState('realesrgan')
  const [upscaleScale, setUpscaleScale] = useState(2)

  const upscaleOptions = useMemo(
    () => (caps.models?.upscale?.length ? caps.models.upscale : UPSCALE_MODELS),
    [caps.models],
  )

  useEffect(() => {
    const readyUp = upscaleOptions.find((m) => m.ready !== false && m.id !== 'bicubic' && m.id !== 'gfpgan')
      || upscaleOptions.find((m) => m.id === 'bicubic')
    if (readyUp) {
      setUpscaleModel((id) => (upscaleOptions.some((m) => m.id === id && m.ready !== false) ? id : readyUp.id))
    }
  }, [upscaleOptions])

  const ioLocked = Boolean(studioLocked)
  const device = deviceLabel(caps.device)
  const hasEnhanced = Boolean(enhancedLayer?.image)
  const largerThanCanvas = hasEnhanced
    && (enhancedLayer.width > settings.width || enhancedLayer.height > settings.height)

  const runUpscale = async () => {
    if (!image) {
      setToast('Open an image first')
      return
    }
    try {
      await runUpscaleToEnhanced({ model: upscaleModel, scale: upscaleScale })
    } catch (err) {
      setToast(err?.message || 'Upscale failed')
    }
  }

  return (
    <>
      <Section
        title="Upscale"
        info={`Creates an Enhanced layer under Background · base stays unchanged · ${device}`}
        open
      >
        <div className="space-y-2">
          <SelectField label="Upscale model" value={upscaleModel} onChange={setUpscaleModel}>
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
            variant="accent"
            size="sm"
            full
            disabled={ioLocked || !image}
            onClick={runUpscale}
          >
            {scaleBusy
              ? <LoaderCircle className="h-3.5 w-3.5 animate-spin" />
              : <Maximize2 className="h-3.5 w-3.5" />}
            {scaleBusy ? 'Upscaling…' : `Upscale ${upscaleScale}× → layer`}
          </Button>
          <p className="text-[10px] leading-snug text-zinc-600">
            GFPGAN is a face-polish slot when weights exist. Size/RAM caps are enforced on the API.
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
              Run Upscale to add an Enhanced layer under Background. Fit controls appear here.
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
              ? <LoaderCircle className="h-3.5 w-3.5 animate-spin" />
              : <Download className="h-3.5 w-3.5" />}
            {downloadBusy ? 'Preparing PNG…' : 'Download enhanced PNG'}
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

import { Download, Film } from 'lucide-react'
import { useState } from 'react'
import { Button, ColorField, Field, FormGrid, Hint, Section, SelectField, Switch } from '../components/ui'
import { fmtBytes } from '../lib/format'
import { QUALITY_PROFILES } from '../lib/catalogs'
import { useStudio } from '../context/studio-provider'
import { useStudioStore } from '../store/studio-store'

export default function OutputPage() {
  const {
    settings, update, applyQuality, setSettings,
    compressGifRef, compressExistingGif, lastExport, setToast,
  } = useStudio()
  const [ffmpegBusy, setFfmpegBusy] = useState(false)

  const exportMp4ViaFfmpeg = async () => {
    setFfmpegBusy(true)
    let objectUrl = null
    try {
      const { gifToMp4, loadFFmpeg } = await import('../engine/ffmpeg-export')
      await loadFFmpeg()
      useStudioStore.getState().setCapabilities({ ffmpeg: true })
      const file = await new Promise((resolve) => {
        const input = document.createElement('input')
        input.type = 'file'
        input.accept = 'image/gif,.gif'
        input.onchange = () => resolve(input.files?.[0] || null)
        input.addEventListener('cancel', () => resolve(null))
        input.click()
      })
      if (!file) return
      const mp4 = await gifToMp4(file)
      objectUrl = URL.createObjectURL(mp4)
      const a = document.createElement('a')
      a.href = objectUrl
      a.download = `${file.name.replace(/\.gif$/i, '') || 'animation'}.mp4`
      a.click()
      setToast(`MP4 exported via ffmpeg.wasm · ${fmtBytes(mp4.size)}`)
    } catch (err) {
      setToast(err?.message || 'ffmpeg.wasm export failed')
    } finally {
      if (objectUrl) setTimeout(() => URL.revokeObjectURL(objectUrl), 1000)
      setFfmpegBusy(false)
    }
  }

  return (
    <>
      <Section title="Background">
        <Switch label="Transparent canvas" checked={settings.transparent} onChange={(v) => update('transparent', v)} />
        <ColorField className="mt-4" label="Matte color" value={settings.background} disabled={settings.transparent} onChange={(v) => update('background', v)} />
      </Section>
      <Section title="Encoding">
        <SelectField label="Quality profile" value={settings.quality} onChange={applyQuality}>{QUALITY_PROFILES.map(x => <option key={x}>{x}</option>)}</SelectField>
        <FormGrid className="mt-3" gap={3}>
          <Field label="Palette" value={settings.palette} onChange={(v) => setSettings((s) => ({ ...s, palette: v, quality: 'Custom' }))} min={2} max={256} suffix="colors" />
          <Field label="Loop" value={settings.loop} onChange={(v) => update('loop', v)} min={0} max={65535} />
        </FormGrid>
        <div className="mt-3"><SelectField label="Frame disposal" value={settings.disposal} onChange={(v) => update('disposal', Number(v))}><option value="2">Don't stack · clear next</option><option value="1">Keep previous frame</option><option value="3">Restore previous</option></SelectField></div>
        <div className="mt-3"><SelectField label="Compression method" value={settings.compressionMethod} onChange={(v) => setSettings((s) => ({ ...s, compressionMethod: v, quality: 'Custom' }))}>{['Lossless','Lossy LZW','Optimize Transparency','Color Reduction'].map((x) => <option key={x}>{x}</option>)}</SelectField></div>
        <div className={`mt-3 ${settings.compressionMethod === 'Lossy LZW' ? '' : 'pointer-events-none opacity-35'}`}><Field label="Lossy LZW level" value={settings.lossy} onChange={(v) => setSettings((s) => ({ ...s, lossy: v, quality: 'Custom' }))} min={0} max={200} /></div>
        <div className="mt-2 flex justify-between text-[9px] font-semibold uppercase tracking-wider text-zinc-700"><span>Best quality</span><span>Smallest</span></div>
        <div className="mt-4 rounded-xl border border-white/[.07] bg-black/15 p-3 text-[10px] leading-relaxed text-zinc-500"><b className="text-zinc-300">{settings.quality}</b> · {settings.palette} colors · {settings.compressionMethod}{settings.compressionMethod === 'Lossy LZW' ? ` ${settings.lossy}` : ''} · exact {settings.width} × {settings.height}px with Python export.</div>
        <p className="mt-2 text-[9px] leading-relaxed text-zinc-600">High Quality uses GIF&apos;s full 256-color palette and one shared palette across every frame. GIF itself cannot store more than 256 simultaneous colors.</p>
        <div className="mt-4 border-t border-white/[.06] pt-4"><Button variant="accent" size="lg" full className="text-[10px] font-bold" onClick={() => compressGifRef.current?.click()}><Download className="h-3.5 w-3.5" />Compress existing GIF</Button><input ref={compressGifRef} type="file" accept="image/gif,.gif" className="hidden" onChange={(e) => compressExistingGif(e.target.files[0])} /><p className="mt-2 text-[9px] leading-relaxed text-zinc-600">Lossy works best for photos and gradients. Transparency optimization is best for flat graphics with unchanged areas.</p></div>
        <div className="mt-3">
          <Button variant="solid" size="lg" full className="text-[10px] font-bold" disabled={ffmpegBusy} onClick={exportMp4ViaFfmpeg}>
            <Film className="h-3.5 w-3.5" />{ffmpegBusy ? 'Loading ffmpeg…' : 'GIF → MP4 (ffmpeg.wasm)'}
          </Button>
        </div>
        {lastExport && <Hint tone="acid" className="mt-3 border-acid/15"><div className="flex items-center justify-between text-[10px]"><span className="font-semibold text-zinc-400">Last exported file</span><b className="text-acid">{fmtBytes(lastExport.bytes)}</b></div><div className="mt-1 text-[9px] text-zinc-600">{lastExport.encoder}{lastExport.optimized ? ' + gifsicle O3' : ''}{lastExport.originalBytes > lastExport.bytes ? ` · ${Math.round((1 - lastExport.bytes / lastExport.originalBytes) * 100)}% smaller` : ''}</div></Hint>}
      </Section>
    </>
  )
}

import { Download } from 'lucide-react'
import { Button, CanvasSizeControls, ColorField, Field, Hint, Section, SelectField, Switch } from '../components/ui'
import { fmtBytes } from '../lib/format'
import { useStudio } from '../context/studio-provider'

export default function OutputPage() {
  const {
    settings, update, applyPreset, applyQuality, setSettings,
    textLayers, selectedText, setSelectedText, setPlaying, addTextLayer, updateText, removeText, moveText,
    fontOptions, fontFileRef, uploadFont,
    frameFileRef, loadFrameFiles, frameMode, setFrameMode, frameOptions, setFrameOptions,
    frameSequence, setFrameSequence, updateFrame, moveFrame, duplicateFrame, removeFrame, reorderFrame,
    effectTarget, setEffectTarget, elements, selectedElement, setSelectedElement, overlays, selectedOverlay, setSelectedOverlay,
    updateElement, updateOverlay, imageEdits, setImageEdits, activeEffects, updateEffect, gifEffects, setGifEffects,
    censor, setCensor, setCensorSelecting, setMaskEditing, setSelectMode, overlayFileRef, addOverlay,
    saveCurrentPng, compressGifRef, compressExistingGif, lastExport,
    apiAvailable, apiInfo, selectionTool, setSelectionTool, cancelSelection, segmenting, setSelection, setSelectionPoints,
    selectMode, setMobilePanel, extractTolerance, setExtractTolerance, removeElement,
    parallax, setParallax, maskEditing, maskBrush, setMaskBrush, resetElementMask, invertElementMask, featherElementMask,
    source, lockAspect, setLockAspect, setCanvasWidth, setCanvasHeight, useSourceSize, memory,
  } = useStudio()

  return (
    <>
<Section title="Canvas" info="Output canvas starts at the source image size. Resize here to scale the GIF; smaller canvas = less render memory and usually a smaller file.">
            <CanvasSizeControls
              width={settings.width}
              height={settings.height}
              fit={settings.fit}
              lockAspect={lockAspect}
              sourceWidth={source.width}
              sourceHeight={source.height}
              memoryBytes={memory}
              onWidthChange={setCanvasWidth}
              onHeightChange={setCanvasHeight}
              onFitChange={(v) => update('fit', v)}
              onLockAspectChange={setLockAspect}
              onUseSourceSize={useSourceSize}
            />
          </Section>
          <Section title="Background">
            <Switch label="Transparent canvas" checked={settings.transparent} onChange={(v) => update('transparent', v)} />
            <ColorField className="mt-4" label="Matte color" value={settings.background} disabled={settings.transparent} onChange={(v) => update('background', v)} />
          </Section>
          <Section title="Encoding">
            <SelectField label="Quality profile" value={settings.quality} onChange={applyQuality}>{['Low / small','Balanced','High quality','Custom'].map(x => <option key={x}>{x}</option>)}</SelectField>
            <div className="mt-3 grid grid-cols-2 gap-3"><Field label="Palette" value={settings.palette} onChange={(v) => setSettings((s) => ({ ...s, palette: v, quality: 'Custom' }))} min={2} max={256} suffix="colors" /><Field label="Loop" value={settings.loop} onChange={(v) => update('loop', v)} min={0} max={65535} /></div>
            <div className="mt-3"><SelectField label="Frame disposal" value={settings.disposal} onChange={(v) => update('disposal', Number(v))}><option value="2">Don't stack · clear next</option><option value="1">Keep previous frame</option><option value="3">Restore previous</option></SelectField></div>
            <div className="mt-3"><SelectField label="Compression method" value={settings.compressionMethod} onChange={(v) => setSettings((s) => ({ ...s, compressionMethod: v, quality: 'Custom' }))}>{['Lossless','Lossy LZW','Optimize Transparency','Color Reduction'].map((x) => <option key={x}>{x}</option>)}</SelectField></div>
            <div className={`mt-3 ${settings.compressionMethod === 'Lossy LZW' ? '' : 'pointer-events-none opacity-35'}`}><Field label="Lossy LZW level" value={settings.lossy} onChange={(v) => setSettings((s) => ({ ...s, lossy: v, quality: 'Custom' }))} min={0} max={200} /></div>
            <div className="mt-2 flex justify-between text-[9px] font-semibold uppercase tracking-wider text-zinc-700"><span>Best quality</span><span>Smallest</span></div>
            <div className="mt-4"><Switch label="Floyd–Steinberg dither" checked={settings.dither} onChange={(v) => setSettings((s) => ({ ...s, dither: v, quality: 'Custom' }))} /></div>
            <div className="mt-4 rounded-xl border border-white/[.07] bg-black/15 p-3 text-[10px] leading-relaxed text-zinc-500"><b className="text-zinc-300">{settings.quality}</b> · {settings.palette} colors · {settings.compressionMethod}{settings.compressionMethod === 'Lossy LZW' ? ` ${settings.lossy}` : ''} · exact {settings.width} × {settings.height}px with Python export.</div>
            <p className="mt-2 text-[9px] leading-relaxed text-zinc-600">High Quality uses GIF's full 256-color palette, one shared palette across every frame, and perceptual dithering. GIF itself cannot store more than 256 simultaneous colors.</p>
            <div className="mt-4 border-t border-white/[.06] pt-4"><Button variant="accent" size="lg" full className="text-[10px] font-bold" onClick={() => compressGifRef.current?.click()}><Download className="h-3.5 w-3.5" />Compress existing GIF</Button><input ref={compressGifRef} type="file" accept="image/gif,.gif" className="hidden" onChange={(e) => compressExistingGif(e.target.files[0])} /><p className="mt-2 text-[9px] leading-relaxed text-zinc-600">Lossy works best for photos and gradients. Transparency optimization is best for flat graphics with unchanged areas.</p></div>
            {lastExport && <Hint tone="acid" className="mt-3 border-acid/15"><div className="flex items-center justify-between text-[10px]"><span className="font-semibold text-zinc-400">Last exported file</span><b className="text-acid">{fmtBytes(lastExport.bytes)}</b></div><div className="mt-1 text-[9px] text-zinc-600">{lastExport.encoder}{lastExport.optimized ? ' + gifsicle O3' : ''}{lastExport.originalBytes > lastExport.bytes ? ` · ${Math.round((1 - lastExport.bytes / lastExport.originalBytes) * 100)}% smaller` : ''}</div></Hint>}
          </Section>
    </>
  )
}

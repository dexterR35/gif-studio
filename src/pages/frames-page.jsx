import { ArrowDown, ArrowUp, Copy, Film, Plus, Trash2 } from 'lucide-react'
import { Button, Card, EmptyState, Field, Hint, IconButton, Section, SelectField, Switch } from '../components/ui'
import { clamp } from '../lib/format'
import { useStudio } from '../context/studio-provider'

export default function FramesPage() {
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
  } = useStudio()

  return (
    <>
<Section title="GIF frame maker">
            <Button variant="primary" size="xl" full onClick={() => frameFileRef.current?.click()} className="font-bold"><Plus className="h-4 w-4" />Add images or animations</Button>
            <input ref={frameFileRef} type="file" multiple accept="image/png,image/jpeg,.png,.jpg,.jpeg" className="hidden" onChange={(e) => loadFrameFiles(e.target.files)} />
            <p className="mt-3 text-[10px] leading-relaxed text-zinc-600">PNG or JPG only · max 20 MB · max 5000×5000 px. The Python API extracts frames when available.</p>
            <div className="mt-4"><Switch label="Use frame sequence" checked={frameMode} onChange={(v) => { setFrameMode(v); setPlaying(false) }} /></div>
          </Section>
          <Section title="Sequence options">
            <SelectField label="Mixed-size fitting" value={frameOptions.fit} onChange={(v) => setFrameOptions((current) => ({ ...current, fit: v }))}>{['Contain','Cover','Stretch','Original size'].map((x) => <option key={x}>{x}</option>)}</SelectField>
            <div className="mt-4"><Switch label="Crossfade frames" checked={frameOptions.crossfade} onChange={(v) => setFrameOptions((current) => ({ ...current, crossfade: v }))} /></div>
            <div className={`mt-3 ${frameOptions.crossfade ? '' : 'pointer-events-none opacity-40'}`}><Field label="Crossfade steps" value={frameOptions.crossfadeFrames} onChange={(v) => setFrameOptions((current) => ({ ...current, crossfadeFrames: v }))} min={1} max={9} /></div>
            <Hint className="mt-3">Canvas is limited to 1920 × 1920px for frame sequences. Delay uses GIF centiseconds: 10 = 0.10 seconds.</Hint>
          </Section>
          <Section title={`Frames · ${frameSequence.length}`}>
            {!frameSequence.length && <EmptyState icon={Film} className="py-7">No sequence frames yet</EmptyState>}
            <div className="space-y-2">{frameSequence.map((frame, index) => <Card key={frame.id} draggable onDragStart={(e) => e.dataTransfer.setData('text/frame-id', frame.id)} onDragOver={(e) => { e.preventDefault(); const id = e.dataTransfer.getData('text/frame-id'); if (id) reorderFrame(id, frame.id) }}>
              <div className="flex items-center gap-2"><span className="w-5 text-center text-[9px] font-bold text-zinc-600">{index + 1}</span><span className="grid h-10 w-12 shrink-0 place-items-center overflow-hidden rounded-lg checker"><img src={frame.url} alt="" className="max-h-full max-w-full" /></span><span className="min-w-0 flex-1 truncate text-[10px] font-semibold text-zinc-300">{frame.name}</span></div>
              <div className="mt-2 flex items-center gap-2"><span className="gs-label mb-0">Delay</span><input type="number" min="2" max="6000" value={frame.delay} onChange={(e) => updateFrame(frame.id, { delay: clamp(e.target.value, 2, 6000) })} className="gs-input gs-input-sm" /><span className="text-[9px] text-zinc-600">× 1/100s</span><span className="flex-1" /><IconButton label="Move earlier" onClick={() => moveFrame(frame.id, -1)}><ArrowUp className="h-3.5 w-3.5" /></IconButton><IconButton label="Move later" onClick={() => moveFrame(frame.id, 1)}><ArrowDown className="h-3.5 w-3.5" /></IconButton><IconButton label="Duplicate" onClick={() => duplicateFrame(frame)}><Copy className="h-3.5 w-3.5" /></IconButton><IconButton label="Delete" onClick={() => removeFrame(frame.id)}><Trash2 className="h-3.5 w-3.5" /></IconButton></div>
            </Card>)}</div>
          </Section>
    </>
  )
}

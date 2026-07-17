import { Crop, ImagePlus, RotateCw } from 'lucide-react'
import { Button, CanvasSizeControls, ColorField, Field, FormGrid, Hint, LayerRow, RotateControls, Section, SelectField, Switch } from '../components/ui'
import { EFFECT_DEFAULTS } from '../lib/presets'
import { useStudio } from '../context/studio-provider'
import { cn } from '../lib/cn'

export default function EditPage() {
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
<Section title="Edit target">
            <SelectField label="Apply edit controls to" value={effectTarget} onChange={setEffectTarget}><option>Entire GIF</option><option disabled={!selectedElement}>Selected element</option><option disabled={!selectedOverlay}>Selected overlay</option></SelectField>
            {effectTarget === 'Selected element' && selectedElement && <Hint tone="info" className="mt-3 rounded-lg px-3 py-2">Editing {elements.find((item) => item.id === selectedElement)?.name}</Hint>}
            {effectTarget === 'Selected overlay' && selectedOverlay && <Hint tone="info" className="mt-3 rounded-lg px-3 py-2">Editing {overlays.find((item) => item.id === selectedOverlay)?.name}</Hint>}
          </Section>
          {effectTarget === 'Selected element' && selectedElement && (() => { const el = elements.find((item) => item.id === selectedElement); return el ? <Section title="Selected layer geometry">
            <div className="grid grid-cols-2 gap-3"><Field label="X" value={Math.round(el.x * 1000) / 10} onChange={(v) => updateElement('x', v / 100)} min={-100} max={200} suffix="%" /><Field label="Y" value={Math.round(el.y * 1000) / 10} onChange={(v) => updateElement('y', v / 100)} min={-100} max={200} suffix="%" /><Field label="Width" value={Math.round(el.w * 1000) / 10} onChange={(v) => updateElement('w', v / 100)} min={1} max={300} suffix="%" /><Field label="Height" value={Math.round(el.h * 1000) / 10} onChange={(v) => updateElement('h', v / 100)} min={1} max={300} suffix="%" /><Field label="Rotation" value={el.rotation} onChange={(v) => updateElement('rotation', v)} min={-360} max={360} suffix="°" /><Field label="Opacity" value={el.opacity} onChange={(v) => updateElement('opacity', v)} min={0} max={100} suffix="%" /></div>
            <div className="mt-3 grid grid-cols-2 gap-3"><Switch label="Flip horizontal" checked={el.flipX} onChange={(v) => updateElement('flipX', v)} /><Switch label="Flip vertical" checked={el.flipY} onChange={(v) => updateElement('flipY', v)} /></div>
          </Section> : null })()}
          {effectTarget === 'Selected overlay' && selectedOverlay && (() => { const overlay = overlays.find((item) => item.id === selectedOverlay); return overlay ? <Section title="Selected overlay geometry">
            <div className="grid grid-cols-2 gap-3"><Field label="X" value={overlay.x} onChange={(v) => updateOverlay('x', v)} min={-100} max={200} suffix="%" /><Field label="Y" value={overlay.y} onChange={(v) => updateOverlay('y', v)} min={-100} max={200} suffix="%" /><Field label="Size" value={overlay.width} onChange={(v) => updateOverlay('width', v)} min={1} max={300} suffix="%" /><Field label="Rotation" value={overlay.rotation} onChange={(v) => updateOverlay('rotation', v)} min={-360} max={360} suffix="°" /><Field label="Scale X" value={overlay.scaleX || 100} onChange={(v) => updateOverlay('scaleX', v)} min={1} max={500} suffix="%" /><Field label="Scale Y" value={overlay.scaleY || 100} onChange={(v) => updateOverlay('scaleY', v)} min={1} max={500} suffix="%" /><Field label="Opacity" value={overlay.opacity} onChange={(v) => updateOverlay('opacity', v)} min={0} max={100} suffix="%" /></div>
            <RotateControls className="mt-3" value={overlay.rotation} onChange={(v) => updateOverlay('rotation', v)} />
            <div className="mt-3 grid grid-cols-2 gap-3"><Switch label="Flip horizontal" checked={overlay.flipX} onChange={(v) => updateOverlay('flipX', v)} /><Switch label="Flip vertical" checked={overlay.flipY} onChange={(v) => updateOverlay('flipY', v)} /></div>
            <div className="mt-4 grid grid-cols-2 gap-3"><Field label="Crop left" value={overlay.cropLeft || 0} onChange={(v) => updateOverlay('cropLeft', v)} min={0} max={95} suffix="%" /><Field label="Crop right" value={overlay.cropRight || 0} onChange={(v) => updateOverlay('cropRight', v)} min={0} max={95} suffix="%" /><Field label="Crop top" value={overlay.cropTop || 0} onChange={(v) => updateOverlay('cropTop', v)} min={0} max={95} suffix="%" /><Field label="Crop bottom" value={overlay.cropBottom || 0} onChange={(v) => updateOverlay('cropBottom', v)} min={0} max={95} suffix="%" /></div>
          </Section> : null })()}
          <Section title="GIF canvas resize & crop" info="Canvas starts at the image’s original size. Shrink width/height to resize the output and lower render memory (MB). Image fit controls how the source scales inside the canvas.">
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
            <div className="mt-3 grid grid-cols-2 gap-3"><Field label="Crop left" value={imageEdits.cropLeft} onChange={(v) => setImageEdits((s) => ({ ...s, cropLeft: v }))} min={0} max={90} suffix="%" /><Field label="Crop right" value={imageEdits.cropRight} onChange={(v) => setImageEdits((s) => ({ ...s, cropRight: v }))} min={0} max={90} suffix="%" /><Field label="Crop top" value={imageEdits.cropTop} onChange={(v) => setImageEdits((s) => ({ ...s, cropTop: v }))} min={0} max={90} suffix="%" /><Field label="Crop bottom" value={imageEdits.cropBottom} onChange={(v) => setImageEdits((s) => ({ ...s, cropBottom: v }))} min={0} max={90} suffix="%" /></div>
          </Section>
          <Section title="GIF base rotate & flip">
            <RotateControls value={imageEdits.rotation} onChange={(v) => setImageEdits((s) => ({ ...s, rotation: v }))} />
            <div className="mt-3 grid grid-cols-2 gap-3"><Switch label="Flip horizontal" checked={imageEdits.flipX} onChange={(v) => setImageEdits((s) => ({ ...s, flipX: v }))} /><Switch label="Flip vertical" checked={imageEdits.flipY} onChange={(v) => setImageEdits((s) => ({ ...s, flipY: v }))} /></div>
          </Section>
          <Section title="Base image quick adjustments">
            <div className="grid grid-cols-2 gap-3"><Field label="Brightness" value={imageEdits.brightness} onChange={(v) => setImageEdits((s) => ({ ...s, brightness: v }))} min={0} max={300} suffix="%" /><Field label="Contrast" value={imageEdits.contrast} onChange={(v) => setImageEdits((s) => ({ ...s, contrast: v }))} min={0} max={300} suffix="%" /><Field label="Saturation" value={imageEdits.saturation} onChange={(v) => setImageEdits((s) => ({ ...s, saturation: v }))} min={0} max={300} suffix="%" /><Field label="Hue" value={imageEdits.hue} onChange={(v) => setImageEdits((s) => ({ ...s, hue: v }))} min={-180} max={180} suffix="°" /><Field label="Blur" value={imageEdits.blur} onChange={(v) => setImageEdits((s) => ({ ...s, blur: v }))} min={0} max={50} suffix="px" /><Field label="Grayscale" value={imageEdits.grayscale} onChange={(v) => setImageEdits((s) => ({ ...s, grayscale: v }))} min={0} max={100} suffix="%" /><Field label="Sepia" value={imageEdits.sepia} onChange={(v) => setImageEdits((s) => ({ ...s, sepia: v }))} min={0} max={100} suffix="%" /></div>
            <Button full className="mt-3 text-[10px]" onClick={() => setImageEdits((s) => ({ ...s, brightness: 100, contrast: 100, saturation: 100, blur: 0, hue: 0, grayscale: 0, sepia: 0 }))}>Reset effects</Button>
          </Section>
          <Section title="Advanced effects">
            <SelectField label="Apply effects to" value={effectTarget} onChange={setEffectTarget}><option>Entire GIF</option><option disabled={!selectedElement}>Selected element</option><option disabled={!selectedOverlay}>Selected overlay</option></SelectField>
            <div className="mt-3 rounded-lg bg-black/15 px-3 py-2 text-[9px] text-zinc-600">Editing: <b className="text-zinc-300">{effectTarget === 'Selected element' ? elements.find((item) => item.id === selectedElement)?.name || 'No element selected' : effectTarget === 'Selected overlay' ? overlays.find((item) => item.id === selectedOverlay)?.name || 'No overlay selected' : 'complete GIF output'}</b></div>
            <div className="mt-4 grid grid-cols-2 gap-3"><Field label="Hue" value={activeEffects.hue} onChange={(v) => updateEffect('hue', v)} min={-180} max={180} suffix="°" /><Field label="Saturation" value={activeEffects.saturation} onChange={(v) => updateEffect('saturation', v)} min={0} max={300} suffix="%" /><Field label="Lightness" value={activeEffects.lightness} onChange={(v) => updateEffect('lightness', v)} min={0} max={200} suffix="%" /><Field label="Brightness" value={activeEffects.brightness} onChange={(v) => updateEffect('brightness', v)} min={-100} max={100} /><Field label="Contrast" value={activeEffects.contrast} onChange={(v) => updateEffect('contrast', v)} min={-100} max={200} /></div>
            <div className="mt-4"><SelectField label="Color preset" value={activeEffects.preset} onChange={(v) => updateEffect('preset', v)}>{['None','Grayscale','Sepia','Monochrome','Gotham','Lomo','Nashville','Toaster','Vignette','Polaroid'].map((x) => <option key={x}>{x}</option>)}</SelectField></div>
            <div className="mt-3 grid grid-cols-2 gap-3"><Field label="Negative / invert" value={activeEffects.invert} onChange={(v) => updateEffect('invert', v)} min={0} max={100} suffix="%" /><Field label="Tint amount" value={activeEffects.tint} onChange={(v) => updateEffect('tint', v)} min={0} max={100} suffix="%" /></div>
            <ColorField className="mt-3 text-[10px]" label="Tint color" value={activeEffects.tintColor} onChange={(v) => updateEffect('tintColor', v)} showHex={false} />
          </Section>
          <Section title="Color to transparency">
            <Switch label="Replace selected color" checked={activeEffects.transparentEnabled} onChange={(v) => updateEffect('transparentEnabled', v)} />
            <div className="mt-3 gs-chip-row"><button type="button" onClick={() => updateEffect('transparentColor', '#ffffff')} className={cn('gs-chip flex-1', activeEffects.transparentColor === '#ffffff' && 'is-active')}>White</button><button type="button" onClick={() => updateEffect('transparentColor', '#000000')} className={cn('gs-chip flex-1', activeEffects.transparentColor === '#000000' && 'is-active')}>Black</button><input type="color" value={activeEffects.transparentColor} onChange={(e) => updateEffect('transparentColor', e.target.value)} className="h-7 w-full min-w-[2.5rem] flex-1 bg-transparent" /></div>
            <div className="mt-3 grid grid-cols-2 gap-3"><Field label="Fuzz" value={activeEffects.fuzz} onChange={(v) => updateEffect('fuzz', v)} min={0} max={100} suffix="%" /><Field label="Edge cleanup" value={activeEffects.edgeCleanup} onChange={(v) => updateEffect('edgeCleanup', v)} min={0} max={20} suffix="px" /></div>
            <ColorField className="mt-3 text-[10px]" label="GIF background" value={settings.background} onChange={(v) => update('background', v)} showHex={false} />
          </Section>
          <Section title="Blur, sharpen & artistic">
            <div className="grid grid-cols-2 gap-3"><Field label="Gaussian blur" value={activeEffects.blur} onChange={(v) => updateEffect('blur', v)} min={0} max={30} suffix="px" /><Field label="Sharpen" value={activeEffects.sharpen} onChange={(v) => updateEffect('sharpen', v)} min={0} max={100} suffix="%" /><Field label="Oil paint" value={activeEffects.oilPaint} onChange={(v) => updateEffect('oilPaint', v)} min={0} max={100} /><Field label="Emboss" value={activeEffects.emboss} onChange={(v) => updateEffect('emboss', v)} min={0} max={100} /><Field label="Posterize" value={activeEffects.posterize} onChange={(v) => updateEffect('posterize', v)} min={0} max={100} /><Field label="Solarize" value={activeEffects.solarize} onChange={(v) => updateEffect('solarize', v)} min={0} max={100} /><Field label="Noise" value={activeEffects.noise} onChange={(v) => updateEffect('noise', v)} min={0} max={100} /></div>
          </Section>
          <Section title="Dithering & distortion">
            <SelectField label="Dithering" value={activeEffects.dither} onChange={(v) => updateEffect('dither', v)}>{['None','Ordered','Error diffusion'].map((x) => <option key={x}>{x}</option>)}</SelectField>
            <div className="mt-3"><SelectField label="Distortion" value={activeEffects.distortion} onChange={(v) => updateEffect('distortion', v)}>{['None','Swirl','Implode','Wave'].map((x) => <option key={x}>{x}</option>)}</SelectField></div>
            <div className="mt-3"><Field label="Distortion amount" value={activeEffects.distortionAmount} onChange={(v) => updateEffect('distortionAmount', v)} min={0} max={100} suffix="%" /></div>
          </Section>
          <Section title="Decorative frame">
            <SelectField label="Frame style" value={activeEffects.frame} onChange={(v) => updateEffect('frame', v)}>{['None','Camera','Fuzzy','Rounded corners','Solid border'].map((x) => <option key={x}>{x}</option>)}</SelectField>
            <ColorField className="mt-3 text-[10px]" label="Frame color" value={activeEffects.frameColor} onChange={(v) => updateEffect('frameColor', v)} showHex={false} />
            <div className="mt-3 grid grid-cols-2 gap-3"><Field label="Frame width" value={activeEffects.frameWidth} onChange={(v) => updateEffect('frameWidth', v)} min={1} max={200} suffix="px" /><Field label="Corner radius" value={activeEffects.rounded} onChange={(v) => updateEffect('rounded', v)} min={0} max={500} suffix="px" /></div>
            <Button full className="mt-3 text-[10px]" onClick={() => { if (effectTarget === 'Selected element' && selectedElement) setElements((current) => current.map((element) => element.id === selectedElement ? { ...element, effects: { ...EFFECT_DEFAULTS } } : element)); else if (effectTarget === 'Selected overlay' && selectedOverlay) setOverlays((current) => current.map((overlay) => overlay.id === selectedOverlay ? { ...overlay, effects: { ...EFFECT_DEFAULTS } } : overlay)); else setGifEffects({ ...EFFECT_DEFAULTS }) }}>Reset advanced effects</Button>
          </Section>
          <Section title="Censor / pixelate">
            <Button variant="accent" size="lg" full onClick={() => { setCensorSelecting(true); setMaskEditing(false); setSelectMode(false); setPlaying(false) }} className="font-bold"><Crop className="h-4 w-4" />Draw censor region</Button>
            <div className="mt-3"><Switch label="Show censor" checked={censor.enabled} onChange={(v) => setCensor((s) => ({ ...s, enabled: v }))} /></div>
            <div className="mt-3"><Field label="Pixel block size" value={censor.pixelSize} onChange={(v) => setCensor((s) => ({ ...s, pixelSize: v }))} min={2} max={100} suffix="px" /></div>
          </Section>
          <Section title="Add image overlay">
            <Button variant="soft" size="lg" full onClick={() => overlayFileRef.current?.click()}><ImagePlus className="h-4 w-4" />Add image</Button><input ref={overlayFileRef} type="file" accept="image/*" className="hidden" onChange={(e) => addOverlay(e.target.files[0])} />
            <div className="mt-3 space-y-2">{overlays.map((overlay) => (
              <LayerRow
                key={overlay.id}
                selected={selectedOverlay === overlay.id}
                onClick={() => { setSelectedOverlay(overlay.id); setEffectTarget('Selected overlay') }}
                className="gap-2 p-2"
                thumb={<img src={overlay.url} alt="" className="h-8 w-8 rounded object-contain" />}
                title={overlay.name}
              />
            ))}</div>
            {selectedOverlay && (() => { const overlay = overlays.find((item) => item.id === selectedOverlay); return overlay ? <div className="mt-4"><div className="grid grid-cols-2 gap-3"><Field label="X" value={overlay.x} onChange={(v) => updateOverlay('x', v)} min={-100} max={200} suffix="%" /><Field label="Y" value={overlay.y} onChange={(v) => updateOverlay('y', v)} min={-100} max={200} suffix="%" /><Field label="Width" value={overlay.width} onChange={(v) => updateOverlay('width', v)} min={1} max={300} suffix="%" /><Field label="Rotation" value={overlay.rotation} onChange={(v) => updateOverlay('rotation', v)} min={-360} max={360} suffix="°" /><Field label="Opacity" value={overlay.opacity} onChange={(v) => updateOverlay('opacity', v)} min={0} max={100} suffix="%" /></div><div className="mt-3 grid grid-cols-2 gap-3"><Switch label="Flip X" checked={overlay.flipX} onChange={(v) => updateOverlay('flipX', v)} /><Switch label="Flip Y" checked={overlay.flipY} onChange={(v) => updateOverlay('flipY', v)} /></div><Button variant="danger" full className="mt-3 text-[10px]" onClick={() => { setOverlays((current) => current.filter((item) => item.id !== overlay.id)); setSelectedOverlay(null) }}>Remove overlay</Button></div> : null })()}
          </Section>
          <Section title="Sequence & save">
            <Button full className="text-[10px]" disabled={!frameSequence.length} onClick={() => setFrameSequence((current) => [...current].reverse())}><RotateCw className="h-3.5 w-3.5" />Reverse frame order</Button>
            <FormGrid gap={2} className="mt-2"><Button variant="solid" className="text-[10px] font-bold" onClick={() => saveCurrentPng(false)}>Save PNG</Button><Button variant="accent" className="text-[10px] font-bold" onClick={() => saveCurrentPng(true)}>8-bit PNG</Button></FormGrid>
            <p className="mt-2 text-[9px] leading-relaxed text-zinc-600">PNG saving uses oxipng O4 when installed, otherwise lossless Pillow compression. The 8-bit option reduces output to 256 colors.</p>
          </Section>
    </>
  )
}

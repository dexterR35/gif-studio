import { AlignCenter, AlignLeft, AlignRight, ArrowDown, ArrowUp, ChevronsDown, ChevronsUp, Plus, Trash2, Type, Upload } from 'lucide-react'
import { Button, ColorField, Field, FormGrid, Hint, LayerRow, Section, SelectField, Switch, Textarea, ToggleGroup } from '../components/ui'
import { MAX_TEXT_LAYERS } from '../lib/presets'
import { useStudio } from '../context/studio-provider'

export default function TextPage() {
  const {
    textLayers, selectedText, setSelectedText, setPlaying, addTextLayer, updateText, removeText, moveText,
    fontOptions, fontFileRef, uploadFont,
  } = useStudio()

  const atCap = textLayers.length >= MAX_TEXT_LAYERS

  return (
    <>
      <Section title="Text layers" info={`Up to ${MAX_TEXT_LAYERS} text layers — each gets an editable track on the Timeline.`}>
        <Button
          variant="primary"
          size="xl"
          full
          onClick={addTextLayer}
          disabled={atCap}
          className="font-bold"
        >
          <Plus className="h-4 w-4" />
          Add text
        </Button>
        <p className="mt-2 font-mono text-[10px] text-zinc-500">
          {textLayers.length}/{MAX_TEXT_LAYERS} layers
        </p>
        <div className="mt-3 space-y-2">{textLayers.map((layer) => (
          <LayerRow
            key={layer.id}
            selected={selectedText === layer.id}
            onClick={() => { setSelectedText(layer.id); setPlaying(false) }}
            icon={Type}
            title={layer.text || 'Empty text'}
            subtitle={`${layer.font} · ${layer.size}px · ${(layer.in ?? 0).toFixed(1)}s–${(layer.out ?? 0).toFixed(1)}s`}
            visible={layer.visible}
          />
        ))}</div>
        {!textLayers.length && (
          <p className="mt-3 text-center text-[10px] text-zinc-600">
            Add headlines, captions, labels, or animated titles.
          </p>
        )}
        {atCap && (
          <Hint className="mt-3">Maximum {MAX_TEXT_LAYERS} text layers. Remove one to add another.</Hint>
        )}
      </Section>

          {selectedText && (() => { const layer = textLayers.find((item) => item.id === selectedText); return layer ? <>
            <Section title="Content & font">
              <Textarea value={layer.text} onChange={(e) => updateText('text', e.target.value)} className="h-20" placeholder="Type your text…" />
              <div className="mt-3"><SelectField label="Font family" value={layer.font} onChange={(v) => updateText('font', v)}>{fontOptions.map((font) => <option key={font} value={font}>{font}</option>)}</SelectField></div>
              <Button full className="mt-2" onClick={() => fontFileRef.current?.click()}><Upload className="h-3.5 w-3.5" />Upload local font</Button>
              <input ref={fontFileRef} type="file" accept=".ttf,.otf,.woff,.woff2" className="hidden" onChange={(e) => uploadFont(e.target.files[0])} />
              <div className="mt-3 grid grid-cols-2 gap-3"><Field label="Size" value={layer.size} onChange={(v) => updateText('size', v)} min={4} max={1000} suffix="px" /><SelectField label="Weight" value={layer.weight} onChange={(v) => updateText('weight', Number(v))}>{[100,200,300,400,500,600,700,800,900].map((x) => <option key={x} value={x}>{x}</option>)}</SelectField></div>
              <div className="mt-4"><Switch label="Italic" checked={layer.italic} onChange={(v) => updateText('italic', v)} /></div>
              <div className="mt-3 grid grid-cols-2 gap-3"><SelectField label="Case" value={layer.casing} onChange={(v) => updateText('casing', v)}>{['As typed','UPPERCASE','lowercase'].map((x) => <option key={x}>{x}</option>)}</SelectField><SelectField label="Decoration" value={layer.decoration} onChange={(v) => updateText('decoration', v)}>{['None','Underline','Strikethrough'].map((x) => <option key={x}>{x}</option>)}</SelectField></div>
              <ToggleGroup className="mt-4" value={layer.align} onChange={(align) => updateText('align', align)} options={[{ value: 'left', icon: AlignLeft }, { value: 'center', icon: AlignCenter }, { value: 'right', icon: AlignRight }]} />
              <div className="mt-3 grid grid-cols-2 gap-3"><Field label="Tracking" value={layer.letterSpacing} onChange={(v) => updateText('letterSpacing', v)} min={-20} max={100} suffix="px" /><Field label="Line height" value={layer.lineHeight} onChange={(v) => updateText('lineHeight', v)} min={.5} max={4} step={.1} suffix="×" /></div>
            </Section>

            <Section title="Fill & outline">
              <ColorField label="Text color" value={layer.color} onChange={(v) => updateText('color', v)} />
              <ColorField className="mt-3" label="Outline color" value={layer.strokeColor} onChange={(v) => updateText('strokeColor', v)} />
              <div className="mt-3 grid grid-cols-2 gap-3"><Field label="Outline" value={layer.strokeWidth} onChange={(v) => updateText('strokeWidth', v)} min={0} max={30} suffix="px" /><Field label="Opacity" value={layer.opacity} onChange={(v) => updateText('opacity', v)} min={0} max={100} suffix="%" /></div>
              <div className="mt-3"><SelectField label="Blend mode" value={layer.blendMode} onChange={(v) => updateText('blendMode', v)}>{[['source-over','Normal'],['multiply','Multiply'],['screen','Screen'],['overlay','Overlay'],['darken','Darken'],['lighten','Lighten'],['difference','Difference']].map(([value,label]) => <option key={value} value={value}>{label}</option>)}</SelectField></div>
            </Section>

            <Section title="Transform">
              <div className="grid grid-cols-2 gap-3"><Field label="X position" value={layer.x} onChange={(v) => updateText('x', v)} min={-100} max={200} suffix="%" /><Field label="Y position" value={layer.y} onChange={(v) => updateText('y', v)} min={-100} max={200} suffix="%" /></div>
              <div className="mt-3 grid grid-cols-2 gap-3"><Field label="Width scale" value={layer.scaleX} onChange={(v) => updateText('scaleX', v)} min={1} max={500} suffix="%" /><Field label="Height scale" value={layer.scaleY} onChange={(v) => updateText('scaleY', v)} min={1} max={500} suffix="%" /></div>
              <div className="mt-3"><Field label="Rotation" value={layer.rotation} onChange={(v) => updateText('rotation', v)} min={-360} max={360} suffix="°" /></div>
              <div className="mt-4 grid grid-cols-2 gap-3"><Switch label="Flip X" checked={layer.flipX} onChange={(v) => updateText('flipX', v)} /><Switch label="Flip Y" checked={layer.flipY} onChange={(v) => updateText('flipY', v)} /></div>
            </Section>

            <Section title="Shadow">
              <ColorField label="Shadow color" value={layer.shadowColor} onChange={(v) => updateText('shadowColor', v)} showHex={false} />
              <div className="mt-3 grid grid-cols-2 gap-3"><Field label="Blur" value={layer.shadowBlur} onChange={(v) => updateText('shadowBlur', v)} min={0} max={100} suffix="px" /><Field label="X offset" value={layer.shadowX} onChange={(v) => updateText('shadowX', v)} min={-100} max={100} suffix="px" /><Field label="Y offset" value={layer.shadowY} onChange={(v) => updateText('shadowY', v)} min={-100} max={100} suffix="px" /></div>
            </Section>

            <Section title="Text animation">
              <SelectField label="Entrance" value={layer.entrance} onChange={(v) => updateText('entrance', v)}>{['None','Fade in','Slide in left','Slide in right','Slide in up','Slide in down','Zoom in','Spin in'].map((x) => <option key={x}>{x}</option>)}</SelectField>
              <div className="mt-3"><Field label="Entrance duration" value={layer.entranceDuration} onChange={(v) => updateText('entranceDuration', v)} min={1} max={80} suffix="%" /></div>
              <div className="mt-4"><SelectField label="Loop animation" value={layer.motion} onChange={(v) => updateText('motion', v)}>{['None','Float','Drift','Bounce','Pulse','Spin','Wobble','Fade','Typewriter'].map((x) => <option key={x}>{x}</option>)}</SelectField></div>
              <div className="mt-3 grid grid-cols-2 gap-3"><Field label="Amount" value={layer.amplitude} onChange={(v) => updateText('amplitude', v)} min={0} max={100} suffix="%" /><Field label="Speed" value={layer.speed} onChange={(v) => updateText('speed', v)} min={.1} max={10} step={.1} suffix="×" /></div>
              <div className="mt-4"><SelectField label="Exit" value={layer.exit} onChange={(v) => updateText('exit', v)}>{['None','Fade out','Slide out left','Slide out right','Slide out up','Slide out down','Zoom out','Spin out'].map((x) => <option key={x}>{x}</option>)}</SelectField></div>
              <div className="mt-3"><Field label="Exit duration" value={layer.exitDuration} onChange={(v) => updateText('exitDuration', v)} min={1} max={80} suffix="%" /></div>
              <Hint className="mt-3">Entrance → loop → exit animations are combined on the same text layer.</Hint>
            </Section>

            <Section title="Arrange">
              <FormGrid gap={2}>
                <Button onClick={() => moveText(layer.id, 'front')}><ChevronsUp className="h-3.5 w-3.5" />To front</Button>
                <Button onClick={() => moveText(layer.id, 1)}><ArrowUp className="h-3.5 w-3.5" />Bring forward</Button>
                <Button onClick={() => moveText(layer.id, -1)}><ArrowDown className="h-3.5 w-3.5" />Send backward</Button>
                <Button onClick={() => moveText(layer.id, 'back')}><ChevronsDown className="h-3.5 w-3.5" />To back</Button>
              </FormGrid>
              <div className="mt-3"><Switch label="Show text layer" checked={layer.visible} onChange={(v) => updateText('visible', v)} /></div>
              <Button variant="danger" full className="mt-4" onClick={() => removeText(layer.id)}><Trash2 className="h-3.5 w-3.5" />Delete text layer</Button>
            </Section>
          </> : null })()}
    </>
  )
}

import { Plus, Trash2 } from 'lucide-react'
import { Button, Field, Hint, Section, SelectField } from '../components/ui'
import { MAX_TEXT_LAYERS } from '../lib/presets'
import { useStudio } from '../context/studio-provider'

export default function TextPage() {
  const {
    textLayers, selectedText, addTextLayer, updateText, removeText,
  } = useStudio()

  const atCap = textLayers.length >= MAX_TEXT_LAYERS
  const layer = textLayers.find((item) => item.id === selectedText)

  return (
    <>
      <Section title="Text" info={`Up to ${MAX_TEXT_LAYERS} layers. Select a layer from the Layers panel to edit style and animation.`}>
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
        {atCap && (
          <Hint className="mt-3">Maximum {MAX_TEXT_LAYERS} text layers. Remove one to add another.</Hint>
        )}
      </Section>

      {layer && (
        <>
          <Section title="Text animation">
            <SelectField label="Entrance" value={layer.entrance} onChange={(v) => updateText('entrance', v)}>
              {['None', 'Fade in', 'Slide in left', 'Slide in right', 'Slide in up', 'Slide in down', 'Zoom in', 'Spin in'].map((x) => (
                <option key={x}>{x}</option>
              ))}
            </SelectField>
            <div className="mt-3">
              <Field label="Entrance duration" value={layer.entranceDuration} onChange={(v) => updateText('entranceDuration', v)} min={1} max={80} suffix="%" />
            </div>
            <div className="mt-4">
              <SelectField label="Loop animation" value={layer.motion} onChange={(v) => updateText('motion', v)}>
                {['None', 'Float', 'Drift', 'Bounce', 'Pulse', 'Spin', 'Wobble', 'Fade', 'Typewriter'].map((x) => (
                  <option key={x}>{x}</option>
                ))}
              </SelectField>
            </div>
            <div className="mt-3 grid grid-cols-2 gap-3">
              <Field label="Amount" value={layer.amplitude} onChange={(v) => updateText('amplitude', v)} min={0} max={100} suffix="%" />
              <Field label="Speed" value={layer.speed} onChange={(v) => updateText('speed', v)} min={0.1} max={10} step={0.1} suffix="×" />
            </div>
            <div className="mt-4">
              <SelectField label="Exit" value={layer.exit} onChange={(v) => updateText('exit', v)}>
                {['None', 'Fade out', 'Slide out left', 'Slide out right', 'Slide out up', 'Slide out down', 'Zoom out', 'Spin out'].map((x) => (
                  <option key={x}>{x}</option>
                ))}
              </SelectField>
            </div>
            <div className="mt-3">
              <Field label="Exit duration" value={layer.exitDuration} onChange={(v) => updateText('exitDuration', v)} min={1} max={80} suffix="%" />
            </div>
            <Hint className="mt-3">Entrance → loop → exit animations are combined on the same text layer. Style controls are in the Properties panel.</Hint>
          </Section>

          <Button variant="danger" full className="mt-1" onClick={() => removeText(layer.id)}>
            <Trash2 className="h-3.5 w-3.5" />Delete text layer
          </Button>
        </>
      )}
    </>
  )
}

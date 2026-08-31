import { Plus, Trash2 } from 'lucide-react'
import { Button, Hint, Section } from '../components/ui'
import { MAX_TEXT_LAYERS } from '../lib/presets'
import { useStudio } from '../context/studio-provider'

export default function TextPage() {
  const {
    textLayers, selectedText, addTextLayer, removeText,
  } = useStudio()

  const atCap = textLayers.length >= MAX_TEXT_LAYERS
  const layer = textLayers.find((item) => item.id === selectedText)

  return (
    <>
      <Section title="Text" info={`Up to ${MAX_TEXT_LAYERS} layers. Select a layer from the Layers panel to edit its style.`}>
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
          <Hint className="mb-3">Text content, typography, color, and transforms are available in the Properties panel.</Hint>

          <Button variant="danger" full className="mt-1" onClick={() => removeText(layer.id)}>
            <Trash2 className="h-3.5 w-3.5" />Delete text layer
          </Button>
        </>
      )}
    </>
  )
}

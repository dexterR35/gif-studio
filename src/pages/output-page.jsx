import { Download } from 'lucide-react'
import { Button, ColorField, Hint, Section, Switch } from '../components/ui'
import { fmtBytes } from '../lib/format'
import { useStudio } from '../context/studio-provider'

export default function OutputPage() {
  const {
    settings, update, saveCurrentPng, lastExport, downloadBusy,
  } = useStudio()

  return (
    <>
      <Section title="Background">
        <Switch label="Transparent canvas" checked={settings.transparent} onChange={(v) => update('transparent', v)} />
        <ColorField className="mt-4" label="Matte color" value={settings.background} disabled={settings.transparent} onChange={(v) => update('background', v)} />
      </Section>
      <Section title="PNG output" open>
        <Switch
          label="Reduce to a 256-color palette"
          checked={Boolean(settings.reducePalette)}
          onChange={(v) => update('reducePalette', v)}
        />
        <Hint className="mt-3">
          Exports one still PNG at exactly {settings.width} × {settings.height}px. Palette reduction can make flat graphics smaller.
        </Hint>
        <Button variant="accent" size="lg" full className="mt-4 text-[10px] font-bold" disabled={downloadBusy} onClick={() => saveCurrentPng(settings.reducePalette)}>
          <Download className="h-3.5 w-3.5" />{downloadBusy ? 'Preparing PNG…' : 'Download PNG'}
        </Button>
        {lastExport && <Hint tone="acid" className="mt-3 border-acid/15"><div className="flex items-center justify-between text-[10px]"><span className="font-semibold text-zinc-400">Last PNG</span><b className="text-acid">{fmtBytes(lastExport.bytes)}</b></div><div className="mt-1 text-[9px] text-zinc-600">{lastExport.encoder}</div></Hint>}
      </Section>
    </>
  )
}

import { Menu, Redo2, RotateCcw, Undo2, Zap, Download, LoaderCircle } from 'lucide-react'
import { Badge, Button, IconButton } from '../components/ui'
import { useStudio } from '../context/studio-provider'

export function StudioHeader() {
  const {
    mobilePanel, setMobilePanel, source, reset, exportGif, exporting,
  } = useStudio()

  return (
    <header className="relative z-40 flex h-[68px] shrink-0 items-center justify-between border-b border-white/[.07] bg-ink/95 px-4 backdrop-blur md:px-6">
      <div className="flex items-center gap-3">
        <button type="button" onClick={() => setMobilePanel(!mobilePanel)} className="grid h-9 w-9 place-items-center rounded-lg hover:bg-white/5 lg:hidden">
          <Menu className="h-5 w-5" />
        </button>
        <div className="grid h-8 w-8 place-items-center rounded-[10px] bg-acid text-black">
          <Zap className="h-[18px] w-[18px] fill-current" />
        </div>
        <div className="display text-[17px] font-extrabold tracking-tight">My Studio</div>
        <Badge className="hidden sm:block">LOCAL</Badge>
      </div>
      <div className="absolute left-1/2 hidden -translate-x-1/2 items-center gap-1 lg:flex">
        <IconButton label="Undo"><Undo2 className="h-4 w-4" /></IconButton>
        <IconButton label="Redo" disabled><Redo2 className="h-4 w-4" /></IconButton>
        <span className="mx-2 h-5 w-px bg-white/[.08]" />
        <div className="max-w-48 truncate text-xs font-medium text-zinc-400">{source.name.replace(/\.[^.]+$/, '')}</div>
        <span className="h-1.5 w-1.5 rounded-full bg-zinc-700" />
      </div>
      <div className="flex items-center gap-2">
        <Button onClick={reset} className="hidden sm:inline-flex" size="md">
          <RotateCcw className="h-4 w-4" /> Reset
        </Button>
        <Button variant="primary" size="lg" onClick={exportGif} disabled={exporting} className="font-bold disabled:opacity-70">
          {exporting ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
          {exporting ? 'Exporting' : 'Export GIF'}
        </Button>
      </div>
    </header>
  )
}

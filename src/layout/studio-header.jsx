import { Menu, RotateCcw, Zap, Download, LoaderCircle } from 'lucide-react'
import { Badge, Button } from '../components/ui'
import { useStudio } from '../context/studio-provider'

export function StudioHeader() {
  const {
    mobilePanel, setMobilePanel, reset, exportGif, exporting, downloadBusy, scaleBusy,
  } = useStudio()
  const ioBusy = Boolean(exporting || downloadBusy || scaleBusy)

  return (
    <header className="relative z-40 flex h-12 shrink-0 items-center justify-between border-b border-white/[.07] bg-ink/95 px-4 backdrop-blur md:px-5">
      <div className="flex items-center gap-2.5">
        <button type="button" onClick={() => setMobilePanel(!mobilePanel)} className="grid h-8 w-8 place-items-center rounded-lg hover:bg-white/5 lg:hidden">
          <Menu className="h-4 w-4" />
        </button>
        <div className="grid h-7 w-7 place-items-center rounded-lg bg-acid text-black">
          <Zap className="h-3.5 w-3.5 fill-current" />
        </div>
        <div className="display text-[15px] font-extrabold tracking-tight">My Studio</div>
        <Badge className="hidden sm:block">LOCAL</Badge>
      </div>
      <div className="flex items-center gap-2">
        <Button onClick={reset} className="hidden sm:inline-flex" size="md">
          <RotateCcw className="h-3.5 w-3.5" /> Reset
        </Button>
        <Button variant="primary" size="md" onClick={exportGif} disabled={ioBusy} className="font-bold disabled:opacity-70">
          {exporting || scaleBusy || downloadBusy
            ? <LoaderCircle className="h-3.5 w-3.5 animate-spin" />
            : <Download className="h-3.5 w-3.5" />}
          {exporting ? 'Exporting' : scaleBusy ? 'Upscaling…' : downloadBusy ? 'Downloading…' : 'Export GIF'}
        </Button>
      </div>
    </header>
  )
}

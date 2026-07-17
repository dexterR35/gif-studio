import { useEffect, useRef, useState } from 'react'
import { Expand, Maximize2, Minimize2, Scan, ZoomIn, ZoomOut } from 'lucide-react'
import { cn } from '../../lib/cn'
import { IconButton } from './icon-button'

const PRESETS = [
  { label: 'Zoom to fit', value: 'fit' },
  { label: 'Zoom to 50%', value: 50 },
  { label: 'Zoom to 100%', value: 100 },
  { label: 'Zoom to 200%', value: 200 },
]

/**
 * Reusable Figma-style zoom toolbar.
 */
export function ZoomControls({
  zoom,
  onZoomChange,
  onZoomIn,
  onZoomOut,
  onFit,
  onReset,
  onFullscreen,
  isFullscreen = false,
  className,
  compact = false,
}) {
  const [open, setOpen] = useState(false)
  const [draft, setDraft] = useState(String(Math.round(zoom)))
  const menuRef = useRef(null)

  useEffect(() => {
    setDraft(String(Math.round(zoom)))
  }, [zoom])

  useEffect(() => {
    if (!open) return undefined
    const onPointerDown = (event) => {
      if (!menuRef.current?.contains(event.target)) setOpen(false)
    }
    window.addEventListener('pointerdown', onPointerDown)
    return () => window.removeEventListener('pointerdown', onPointerDown)
  }, [open])

  const commitDraft = () => {
    const parsed = Number.parseFloat(draft)
    if (Number.isFinite(parsed)) onZoomChange?.(parsed)
    else setDraft(String(Math.round(zoom)))
    setOpen(false)
  }

  return (
    <div className={cn('relative flex items-center gap-0.5', className)} ref={menuRef}>
      <IconButton label="Zoom out" onClick={onZoomOut} className="h-8 w-8">
        <ZoomOut className="h-3.5 w-3.5" />
      </IconButton>

      <button
        type="button"
        title="Zoom options"
        aria-expanded={open}
        onClick={() => setOpen((value) => !value)}
        className={cn(
          'focus-ring flex h-8 min-w-[3.25rem] items-center justify-center rounded-lg px-1.5 text-[10px] font-semibold tabular-nums text-zinc-400 transition hover:bg-white/5 hover:text-white',
          open && 'bg-white/5 text-white',
        )}
      >
        {Math.round(zoom)}%
      </button>

      <IconButton label="Zoom in" onClick={onZoomIn} className="h-8 w-8">
        <ZoomIn className="h-3.5 w-3.5" />
      </IconButton>

      {!compact && (
        <>
          <span className="mx-0.5 h-4 w-px bg-white/10" />
          <IconButton label="Zoom to fit" onClick={onFit} className="h-8 w-8">
            <Scan className="h-3.5 w-3.5" />
          </IconButton>
          <IconButton label="Restore 100%" onClick={onReset} className="h-8 w-8">
            <Maximize2 className="h-3.5 w-3.5" />
          </IconButton>
          <IconButton
            label={isFullscreen ? 'Exit fullscreen' : 'Fullscreen stage'}
            onClick={onFullscreen}
            className="h-8 w-8"
          >
            {isFullscreen ? <Minimize2 className="h-3.5 w-3.5" /> : <Expand className="h-3.5 w-3.5" />}
          </IconButton>
        </>
      )}

      {open && (
        <div className="absolute right-0 top-full z-50 mt-1 w-44 overflow-hidden rounded-xl border border-white/10 bg-zinc-950 py-1 shadow-2xl">
          <form
            className="border-b border-white/[.06] px-2 pb-2 pt-1.5"
            onSubmit={(event) => {
              event.preventDefault()
              commitDraft()
            }}
          >
            <label className="block text-[9px] font-bold uppercase tracking-wider text-zinc-600">Zoom</label>
            <div className="mt-1 flex items-center gap-1">
              <input
                autoFocus
                value={draft}
                onChange={(event) => setDraft(event.target.value)}
                onBlur={commitDraft}
                className="h-7 w-full rounded-md border border-white/10 bg-black/40 px-2 text-[11px] font-semibold text-zinc-200 outline-none focus:border-acid/40"
              />
              <span className="text-[10px] text-zinc-600">%</span>
            </div>
          </form>
          {PRESETS.map((preset) => (
            <button
              key={preset.label}
              type="button"
              className="flex w-full items-center px-3 py-1.5 text-left text-[11px] text-zinc-400 transition hover:bg-white/[.04] hover:text-zinc-100"
              onClick={() => {
                if (preset.value === 'fit') onFit?.()
                else onZoomChange?.(preset.value)
                setOpen(false)
              }}
            >
              {preset.label}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

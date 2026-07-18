/**
 * Photoshop-style Contextual Task Bar — compact horizontal actions over the preview.
 */
import { useEffect, useMemo, useRef, useState } from 'react'
import {
  ImageMinus,
  LoaderCircle,
  MoreHorizontal,
  Sparkles,
  UserRound,
} from 'lucide-react'
import { useStudio } from '../../context/studio-provider'
import { useStudioStore } from '../../store/studio-store'
import { cn } from '../../lib/cn'

const MATTE_FALLBACK = [
  { id: 'birefnet', label: 'BiRefNet (soft edges)' },
  { id: 'rmbg-2.0', label: 'RMBG-2.0' },
  { id: 'rembg-isnet', label: 'rembg isnet' },
]

const GRABCUT_OPTION = {
  id: 'opencv-grabcut',
  label: 'OpenCV GrabCut',
  ready: true,
}

function optionLabel(m) {
  if (m.ready === false) {
    if (/\((missing|needs HF)/i.test(m.label)) return m.label
    return `${m.label} (missing)`
  }
  return m.label
}

function pickReady(options, currentId) {
  if (options.some((m) => m.id === currentId && m.ready !== false)) return currentId
  return options.find((m) => m.ready !== false)?.id || currentId
}

function BarBtn({
  disabled,
  onClick,
  busy,
  icon: Icon,
  children,
  title,
  className,
}) {
  const labeled = Boolean(children)
  return (
    <button
      type="button"
      title={title}
      aria-label={title}
      disabled={disabled}
      onClick={onClick}
      className={cn(
        'inline-flex h-8 items-center justify-center gap-1.5 rounded-[var(--control-radius)]',
        'border-0 bg-transparent text-zinc-300',
        'transition hover:bg-acid/10 hover:text-zinc-100',
        'disabled:pointer-events-none disabled:opacity-35',
        labeled ? 'px-2.5 text-[11px] font-medium' : 'w-8 px-0',
        className,
      )}
    >
      {busy
        ? <LoaderCircle className="h-4 w-4 shrink-0 animate-spin text-acid" />
        : Icon
          ? <Icon className="h-4 w-4 shrink-0 text-acid" strokeWidth={1.75} />
          : null}
      {labeled ? <span className="whitespace-nowrap">{children}</span> : null}
    </button>
  )
}

export function ContextualTaskBar() {
  const {
    image,
    studioLocked,
    selectMode,
    maskEditing,
    selectedElement,
    elements,
    runMatteCutout,
    setToast,
  } = useStudio()
  const caps = useStudioStore((s) => s.capabilities)
  const cutoutModel = useStudioStore((s) => s.tools.cutoutModel)
  const setCutoutModel = useStudioStore((s) => s.setCutoutModel)

  const [busy, setBusy] = useState('')
  const [menuOpen, setMenuOpen] = useState(false)
  const rootRef = useRef(null)

  const cutoutOptions = useMemo(() => {
    const matte = caps.models?.matte?.length ? caps.models.matte : MATTE_FALLBACK
    const withoutGrab = matte.filter((m) => m.id !== GRABCUT_OPTION.id)
    return [...withoutGrab, GRABCUT_OPTION]
  }, [caps.models])

  useEffect(() => {
    setCutoutModel((id) => pickReady(cutoutOptions, id || 'birefnet'))
  }, [cutoutOptions, setCutoutModel])

  useEffect(() => {
    if (!menuOpen) return undefined
    const onDoc = (e) => {
      if (!rootRef.current?.contains(e.target)) setMenuOpen(false)
    }
    const onKey = (e) => {
      if (e.key === 'Escape') setMenuOpen(false)
    }
    document.addEventListener('pointerdown', onDoc)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('pointerdown', onDoc)
      document.removeEventListener('keydown', onKey)
    }
  }, [menuOpen])

  const selectedCutout = useMemo(
    () => elements.find((el) => el.id === selectedElement && (el.sourceBitmap || el.bitmap)),
    [elements, selectedElement],
  )

  const locked = Boolean(busy || studioLocked)
  const hidden = !image || selectMode || maskEditing
  const cutoutLabel = cutoutOptions.find((m) => m.id === cutoutModel)?.label || cutoutModel
  const isGrabCut = cutoutModel === 'opencv-grabcut'

  const run = async (label, fn) => {
    setBusy(label)
    setMenuOpen(false)
    try {
      await fn()
    } catch (err) {
      setToast(err?.message || `${label} failed`)
    } finally {
      setBusy('')
    }
  }

  if (hidden) return null

  return (
    <div className="pointer-events-none absolute left-1/2 top-0 z-30 w-max max-w-[calc(100%-1rem)] -translate-x-1/2 pt-2.5">
      <div
        ref={rootRef}
        className={cn(
          'pointer-events-auto relative flex items-center gap-1.5 rounded-[var(--control-radius)]',
          'border border-white/[.08] bg-panel px-1.5 py-1.5',
        )}
        role="toolbar"
        aria-label="Contextual task bar"
      >
        <BarBtn
          disabled={locked}
          busy={busy === 'SelectSubject'}
          icon={UserRound}
          title={`Select subject · ${cutoutLabel}`}
          onClick={() => run('SelectSubject', () => runMatteCutout({
            model: cutoutModel,
            target: 'canvas',
          }))}
        >
          Select subject
        </BarBtn>

        <BarBtn
          disabled={locked || !selectedCutout}
          busy={busy === 'RemoveBG'}
          icon={ImageMinus}
          title={selectedCutout
            ? `Remove background on “${selectedCutout.name}” only · base stays untouched · ${cutoutLabel}`
            : 'Select a cutout layer first'}
          onClick={() => run('RemoveBG', () => runMatteCutout({
            model: cutoutModel,
            target: 'selection',
          }))}
        >
          Remove background
        </BarBtn>

        <BarBtn
          disabled={locked}
          busy={busy === 'Matte'}
          icon={Sparkles}
          title={`${isGrabCut ? 'GrabCut' : 'Soft matte'} → layer · ${cutoutLabel}`}
          onClick={() => run('Matte', () => runMatteCutout({
            model: cutoutModel,
            target: 'canvas',
          }))}
        />

        <div className="relative">
          <BarBtn
            disabled={locked}
            icon={MoreHorizontal}
            title="More · cutout engine"
            className={menuOpen ? 'bg-acid/10 text-acid' : ''}
            onClick={() => setMenuOpen((v) => !v)}
          />

          {menuOpen && (
            <div
              className={cn(
                'absolute right-0 top-[calc(100%+6px)] z-40 w-56 rounded-[var(--control-radius)]',
                'border border-white/[.08] bg-panel p-2',
              )}
              role="menu"
            >
              <label className="block">
                <span className="gs-label">Cutout engine</span>
                <div className="gs-select-wrap">
                  <select
                    value={cutoutModel}
                    disabled={locked}
                    onChange={(e) => setCutoutModel(e.target.value)}
                    className="gs-select focus-ring"
                  >
                    {cutoutOptions.map((m) => (
                      <option key={m.id} value={m.id} disabled={m.ready === false}>
                        {optionLabel(m)}
                      </option>
                    ))}
                  </select>
                </div>
              </label>
              <p className="mt-2 text-[10px] leading-snug text-zinc-600">
                {isGrabCut
                  ? 'OpenCV GrabCut only — no rembg. Also used by the rectangle tool.'
                  : 'Selected rembg matte only — GrabCut is a separate option, not a fallback.'}
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

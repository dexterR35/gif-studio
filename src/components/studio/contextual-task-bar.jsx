/**
 * Photoshop-style Contextual Task Bar — compact horizontal actions over the preview.
 */
import { useMemo, useState } from 'react'
import {
  Eraser,
  ImageMinus,
  LoaderCircle,
  ScanSearch,
  Scissors,
  UserRound,
} from 'lucide-react'
import { useStudio } from '../../context/studio-provider'
import { useStudioStore } from '../../store/studio-store'
import { capabilityButtonProps } from '../../a11y/capability-honesty'
import { cn } from '../../lib/cn'

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
        'hover:bg-acid/10 hover:text-zinc-100',
        'disabled:pointer-events-none disabled:opacity-35',
        labeled ? 'px-2.5 text-[11px] font-medium' : 'w-8 px-0',
        className,
      )}
    >
      {busy
        ? <LoaderCircle className="h-4 w-4 shrink-0 text-acid" />
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
    cleanBackgroundFromSelected,
    beginRemoveFromImage,
    cancelSelection,
    confirmCutSelection,
    selectionPurpose,
    pendingSelection,
    runTextDetect,
    setToast,
  } = useStudio()
  const caps = useStudioStore((s) => s.capabilities)

  const [busy, setBusy] = useState('')
  const [prompt, setPrompt] = useState('')

  const inpaintBtn = capabilityButtonProps(caps, 'lama', 'Remove from image')
  const detectBtn = capabilityButtonProps(caps, 'promptSelection', 'Find & cut out')
  const inpaintEngine = 'LaMa'
  const eraseSelect = selectMode && selectionPurpose === 'erase'
  const hasPendingCut = Boolean(pendingSelection?.rect)

  const selectedCutout = useMemo(
    () => elements.find((el) => el.id === selectedElement && (el.sourceBitmap || el.bitmap)),
    [elements, selectedElement],
  )

  const locked = Boolean(busy || studioLocked)
  // Keep bar visible while drawing erase selection or waiting for Cut.
  const hidden = !image || (selectMode && !eraseSelect && !hasPendingCut) || (maskEditing && !hasPendingCut)
  const cutoutLabel = 'BiRefNet'

  const run = async (label, fn) => {
    setBusy(label)
    try {
      await fn()
    } catch (err) {
      setToast(err?.message || `${label} failed`)
    } finally {
      setBusy('')
    }
  }

  if (hidden) return null

  if (hasPendingCut) {
    return (
      <div className="pointer-events-none absolute left-1/2 top-0 z-30 w-max max-w-[calc(100%-1rem)] -translate-x-1/2 pt-2.5">
        <div
          className={cn(
            'pointer-events-auto relative flex items-center gap-1.5 rounded-[var(--control-radius)]',
            'border border-acid/30 bg-panel px-2 py-1.5',
          )}
          role="toolbar"
          aria-label="Cut selection"
        >
          <Scissors className="h-4 w-4 shrink-0 text-acid" strokeWidth={1.75} />
          <span className="text-[11px] font-medium text-zinc-200">
            Selection ready
          </span>
          <BarBtn
            disabled={locked || busy === 'Cut'}
            busy={busy === 'Cut'}
            title={`Cut — ${inpaintEngine} removes this region from the image`}
            className="bg-acid/15 text-acid"
            onClick={() => run('Cut', () => confirmCutSelection())}
          >
            Cut
          </BarBtn>
          <BarBtn
            disabled={locked || busy === 'Cut'}
            title="Cancel selection"
            onClick={() => cancelSelection()}
          >
            Cancel
          </BarBtn>
        </div>
      </div>
    )
  }

  if (eraseSelect) {
    return (
      <div className="pointer-events-none absolute left-1/2 top-0 z-30 w-max max-w-[calc(100%-1rem)] -translate-x-1/2 pt-2.5">
        <div
          className={cn(
            'pointer-events-auto relative flex items-center gap-1.5 rounded-[var(--control-radius)]',
            'border border-acid/30 bg-panel px-2 py-1.5',
          )}
          role="status"
          aria-label="Remove from image"
        >
          <Scissors className="h-4 w-4 shrink-0 text-acid" strokeWidth={1.75} />
          <span className="text-[11px] font-medium text-zinc-200">
            Draw selection first — then Cut
          </span>
          <BarBtn
            disabled={locked}
            title="Cancel remove"
            onClick={() => cancelSelection()}
          >
            Cancel
          </BarBtn>
        </div>
      </div>
    )
  }

  return (
    <div className="pointer-events-none absolute left-1/2 top-0 z-30 w-max max-w-[calc(100%-1rem)] -translate-x-1/2 pt-2.5">
      <div
        className={cn(
          'pointer-events-auto relative flex max-w-full items-center gap-1.5 overflow-x-auto rounded-[var(--control-radius)]',
          'border border-white/[.08] bg-panel px-1.5 py-1.5',
        )}
        role="toolbar"
        aria-label="Contextual task bar"
      >
        <label className="flex min-w-0 items-center">
          <span className="sr-only">Text prompt</span>
          <input
            type="text"
            value={prompt}
            disabled={locked}
            autoComplete="off"
            spellCheck={false}
            placeholder="chair . person . dog ."
            onChange={(event) => setPrompt(event.target.value)}
            onKeyDown={(event) => {
              if (event.key !== 'Enter') return
              event.preventDefault()
              if (!prompt.trim() || locked || detectBtn.disabled) return
              run('Detect', () => runTextDetect(prompt))
            }}
            className={cn(
              'h-8 w-[10.5rem] min-w-[7rem] rounded-[var(--control-radius)] border-0 bg-control',
              'px-2.5 text-[11px] font-medium text-zinc-200 outline-none',
              'placeholder:text-zinc-600',
              'hover:bg-[var(--color-control-hover)]',
              'focus:bg-[var(--color-control-hover)]',
              'disabled:opacity-50',
            )}
          />
        </label>
        <BarBtn
          disabled={locked || !prompt.trim() || detectBtn.disabled}
          busy={busy === 'Detect'}
          icon={ScanSearch}
          title={detectBtn.disabled
            ? detectBtn.title
            : 'Find & cut out — describe the object, then run'}
          onClick={() => run('Detect', () => runTextDetect(prompt))}
        />

        <div className="mx-0.5 h-4 w-px shrink-0 bg-white/[.12]" aria-hidden="true" />

        <BarBtn
          disabled={locked || inpaintBtn.disabled}
          busy={busy === 'RemoveObject'}
          icon={Scissors}
          title={inpaintBtn.disabled
            ? inpaintBtn.title
            : `Draw a selection, then press Cut — ${inpaintEngine} removes it`}
          onClick={() => run('RemoveObject', () => beginRemoveFromImage('Rectangle'))}
        >
          Remove from image
        </BarBtn>

        <BarBtn
          disabled={locked}
          busy={busy === 'SelectSubject'}
          icon={UserRound}
          title={`Select subject · ${cutoutLabel} · base stays untouched`}
          onClick={() => run('SelectSubject', () => runMatteCutout({
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
            target: 'selection',
          }))}
        >
          Remove background
        </BarBtn>

        <BarBtn
          disabled={locked || !selectedCutout || inpaintBtn.disabled}
          busy={busy === 'CleanBG'}
          icon={Eraser}
          title={selectedCutout
            ? (inpaintBtn.disabled
              ? inpaintBtn.title
              : `Clean base under “${selectedCutout.name}” with ${inpaintEngine} (uses the cutout mask)`)
            : 'Select a cutout layer first'}
          onClick={() => run('CleanBG', () => cleanBackgroundFromSelected())}
        >
          Clean background
        </BarBtn>

      </div>
    </div>
  )
}
